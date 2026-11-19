'use strict';

const express = require('express');
const { lerIdPositivo } = require('../utils/validacao');

function criarRotasTorneios({ db, auth }) {
  const router = express.Router();

  router.get('/torneios', async (req, res) => {
    const [linhas] = await db.execute(
      `SELECT t.id, t.nome, t.descricao, t.formato, t.vagas, t.inicio, t.premiacao, t.status,
              (SELECT COUNT(*) FROM inscricoes i WHERE i.torneio_id = t.id) AS inscritos,
              EXISTS (SELECT 1 FROM inscricoes i WHERE i.torneio_id = t.id AND i.usuario_id = ?) AS inscrito
       FROM torneios t
       ORDER BY CASE t.status WHEN 'aberto' THEN 0 WHEN 'em_breve' THEN 1 ELSE 2 END, t.id`,
      [req.usuario.id]
    );

    return res.json({
      torneios: linhas.map((linha) => ({
        ...linha,
        inscritos: Number(linha.inscritos),
        inscrito: Boolean(linha.inscrito)
      }))
    });
  });

  router.post('/torneios/:id/inscricao', async (req, res) => {
    const torneioId = lerIdPositivo(req.params.id);
    if (!torneioId) return res.status(400).json({ mensagem: 'Torneio inválido.' });

    const conexao = await db.getConnection();
    try {
      await conexao.beginTransaction();

      // FOR UPDATE trava a linha do torneio: duas inscrições simultâneas não passam do limite de vagas.
      const [torneios] = await conexao.execute(
        'SELECT id, nome, vagas, status FROM torneios WHERE id = ? FOR UPDATE',
        [torneioId]
      );
      const torneio = torneios[0];

      if (!torneio) {
        await conexao.rollback();
        return res.status(404).json({ mensagem: 'Torneio não encontrado.' });
      }
      if (torneio.status !== 'aberto') {
        await conexao.rollback();
        return res.status(409).json({ mensagem: 'As inscrições deste torneio não estão abertas.' });
      }

      const [jaInscrito] = await conexao.execute(
        'SELECT id FROM inscricoes WHERE torneio_id = ? AND usuario_id = ? LIMIT 1',
        [torneioId, req.usuario.id]
      );
      if (jaInscrito.length) {
        await conexao.rollback();
        return res.status(409).json({ mensagem: 'Você já está inscrito neste torneio.' });
      }

      const [[contagem]] = await conexao.execute(
        'SELECT COUNT(*) AS total FROM inscricoes WHERE torneio_id = ?',
        [torneioId]
      );
      if (Number(contagem.total) >= torneio.vagas) {
        await conexao.rollback();
        return res.status(409).json({ mensagem: 'Todas as vagas deste torneio já foram preenchidas.' });
      }

      await conexao.execute('INSERT INTO inscricoes (torneio_id, usuario_id) VALUES (?, ?)', [
        torneioId,
        req.usuario.id
      ]);
      await conexao.commit();

      return res.status(201).json({
        mensagem: `Inscrição confirmada em ${torneio.nome}!`,
        inscritos: Number(contagem.total) + 1
      });
    } catch (erro) {
      await conexao.rollback().catch(() => {});
      if (erro.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ mensagem: 'Você já está inscrito neste torneio.' });
      }
      if (erro.code === 'ER_NO_REFERENCED_ROW_2') {
        auth.encerrarSessao(req, res);
        return res.status(401).json({ mensagem: 'Sessão inválida ou expirada. Entre novamente.' });
      }
      throw erro;
    } finally {
      conexao.release();
    }
  });

  router.delete('/torneios/:id/inscricao', async (req, res) => {
    const torneioId = lerIdPositivo(req.params.id);
    if (!torneioId) return res.status(400).json({ mensagem: 'Torneio inválido.' });

    const [torneios] = await db.execute('SELECT status FROM torneios WHERE id = ? LIMIT 1', [torneioId]);
    if (!torneios.length) return res.status(404).json({ mensagem: 'Torneio não encontrado.' });
    if (torneios[0].status !== 'aberto') {
      return res.status(409).json({ mensagem: 'Não é mais possível cancelar a inscrição neste torneio.' });
    }

    const [resultado] = await db.execute(
      'DELETE FROM inscricoes WHERE torneio_id = ? AND usuario_id = ?',
      [torneioId, req.usuario.id]
    );
    if (!resultado.affectedRows) {
      return res.status(404).json({ mensagem: 'Você não estava inscrito neste torneio.' });
    }

    return res.json({ mensagem: 'Inscrição cancelada.' });
  });

  router.get('/resumo', async (req, res) => {
    const [[resumo]] = await db.query(
      `SELECT (SELECT COUNT(*) FROM torneios WHERE status = 'aberto') AS torneios_abertos,
              (SELECT COUNT(DISTINCT usuario_id) FROM inscricoes) AS jogadores_inscritos,
              (SELECT COUNT(*) FROM partidas) AS partidas_concluidas`
    );

    return res.json({
      torneiosAbertos: Number(resumo.torneios_abertos),
      jogadoresInscritos: Number(resumo.jogadores_inscritos),
      partidasConcluidas: Number(resumo.partidas_concluidas)
    });
  });

  router.get('/partidas', async (req, res) => {
    const [linhas] = await db.query(
      `SELECT p.id, v.nome AS vencedor, d.nome AS perdedor,
              p.placar_vencedor, p.placar_perdedor, p.fase, t.nome AS torneio
       FROM partidas p
       JOIN usuarios v ON v.id = p.vencedor_id
       JOIN usuarios d ON d.id = p.perdedor_id
       LEFT JOIN torneios t ON t.id = p.torneio_id
       ORDER BY p.id DESC
       LIMIT 10`
    );

    return res.json({
      partidas: linhas.map((linha) => ({
        id: linha.id,
        vencedor: linha.vencedor,
        perdedor: linha.perdedor,
        placarVencedor: linha.placar_vencedor,
        placarPerdedor: linha.placar_perdedor,
        fase: linha.fase,
        torneio: linha.torneio
      }))
    });
  });

  return router;
}

module.exports = { criarRotasTorneios };
