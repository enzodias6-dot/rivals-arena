'use strict';

const express = require('express');

const { criarLimitador } = require('../middlewares/limitador');
const { validarNome, lerIdPositivo } = require('../utils/validacao');

function criarRotasDesafios({ db, config, auth }) {
  const router = express.Router();
  const limitarCriacao = criarLimitador({ ...config.limites.desafios, contar: 'todas' });

  router.get('/desafios', async (req, res) => {
    const [linhas] = await db.execute(
      `SELECT d.id, d.status, d.desafiante_id, a.nome AS desafiante, b.nome AS desafiado
       FROM desafios d
       JOIN usuarios a ON a.id = d.desafiante_id
       JOIN usuarios b ON b.id = d.desafiado_id
       WHERE d.desafiante_id = ? OR d.desafiado_id = ?
       ORDER BY d.id DESC
       LIMIT 20`,
      [req.usuario.id, req.usuario.id]
    );

    return res.json({
      desafios: linhas.map((linha) => ({
        id: linha.id,
        desafiante: linha.desafiante,
        desafiado: linha.desafiado,
        status: linha.status,
        direcao: linha.desafiante_id === req.usuario.id ? 'enviado' : 'recebido'
      }))
    });
  });

  router.post('/desafios', limitarCriacao, async (req, res) => {
    const oponente = validarNome((req.body || {}).oponente, 'O nome do adversário');
    if (oponente.erro) return res.status(400).json({ mensagem: oponente.erro });

    const [candidatos] = await db.execute(
      'SELECT id, nome FROM usuarios WHERE LOWER(nome) = LOWER(?) LIMIT 2',
      [oponente.valor]
    );

    if (!candidatos.length) {
      return res.status(404).json({ mensagem: 'Nenhum combatente com esse nome foi encontrado.' });
    }
    if (candidatos.length > 1) {
      return res.status(409).json({
        mensagem: 'Há mais de um combatente com esse nome, então não é possível desafiar por ele ainda.'
      });
    }

    const adversario = candidatos[0];
    if (adversario.id === req.usuario.id) {
      return res.status(400).json({ mensagem: 'Você não pode desafiar a si mesmo.' });
    }

    const [pendentes] = await db.execute(
      `SELECT id FROM desafios
       WHERE status = 'pendente'
         AND ((desafiante_id = ? AND desafiado_id = ?) OR (desafiante_id = ? AND desafiado_id = ?))
       LIMIT 1`,
      [req.usuario.id, adversario.id, adversario.id, req.usuario.id]
    );
    if (pendentes.length) {
      return res.status(409).json({ mensagem: 'Já existe um desafio pendente entre vocês dois.' });
    }

    try {
      const [resultado] = await db.execute(
        'INSERT INTO desafios (desafiante_id, desafiado_id) VALUES (?, ?)',
        [req.usuario.id, adversario.id]
      );
      return res.status(201).json({
        mensagem: `Desafio enviado para ${adversario.nome}!`,
        desafio: { id: Number(resultado.insertId) }
      });
    } catch (erro) {
      if (erro.code === 'ER_NO_REFERENCED_ROW_2') {
        auth.encerrarSessao(req, res);
        return res.status(401).json({ mensagem: 'Sessão inválida ou expirada. Entre novamente.' });
      }
      throw erro;
    }
  });

  router.patch('/desafios/:id', async (req, res) => {
    const desafioId = lerIdPositivo(req.params.id);
    const acao = (req.body || {}).acao;
    if (!desafioId || !['aceitar', 'recusar'].includes(acao)) {
      return res.status(400).json({ mensagem: 'Informe o desafio e a ação (aceitar ou recusar).' });
    }

    const [linhas] = await db.execute(
      'SELECT id, desafiado_id, status FROM desafios WHERE id = ? LIMIT 1',
      [desafioId]
    );
    const desafio = linhas[0];

    if (!desafio || desafio.desafiado_id !== req.usuario.id) {
      return res.status(404).json({ mensagem: 'Desafio não encontrado.' });
    }
    if (desafio.status !== 'pendente') {
      return res.status(409).json({ mensagem: 'Este desafio já foi respondido.' });
    }

    const novoStatus = acao === 'aceitar' ? 'aceito' : 'recusado';
    await db.execute(
      "UPDATE desafios SET status = ?, respondido_em = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pendente'",
      [novoStatus, desafioId]
    );

    return res.json({ mensagem: acao === 'aceitar' ? 'Desafio aceito!' : 'Desafio recusado.', status: novoStatus });
  });

  return router;
}

module.exports = { criarRotasDesafios };
