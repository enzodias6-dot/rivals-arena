'use strict';

const express = require('express');

const { criarLimitador } = require('../middlewares/limitador');
const { executar, clienteDaRequisicao } = require('../utils/supabase');
const { validarNome, lerUuid } = require('../utils/validacao');

function criarRotasDesafios({ config }) {
  const router = express.Router();
  const limitarCriacao = criarLimitador({ ...config.limites.desafios, contar: 'todas' });

  router.get('/desafios', async (req, res) => {
    const cliente = clienteDaRequisicao(req);
    const { data: desafios } = await executar(
      cliente.from('desafios')
        .select('id,status,desafiante_id,desafiado_id')
        .or(`desafiante_id.eq.${req.usuario.id},desafiado_id.eq.${req.usuario.id}`)
        .order('data_criacao', { ascending: false })
        .limit(20)
    );

    const ids = [...new Set((desafios || []).flatMap((desafio) => [
      desafio.desafiante_id,
      desafio.desafiado_id
    ]))];
    const { data: perfis } = ids.length
      ? await executar(cliente.from('vw_perfis_publicos').select('id,nome').in('id', ids))
      : { data: [] };
    const nomes = new Map((perfis || []).map((perfil) => [perfil.id, perfil.nome]));

    return res.json({
      desafios: (desafios || []).map((desafio) => ({
        id: desafio.id,
        desafiante: nomes.get(desafio.desafiante_id) || null,
        desafiado: nomes.get(desafio.desafiado_id) || null,
        status: desafio.status,
        direcao: desafio.desafiante_id === req.usuario.id ? 'enviado' : 'recebido'
      }))
    });
  });

  router.post('/desafios', limitarCriacao, async (req, res) => {
    const oponente = validarNome((req.body || {}).oponente, 'O nome do adversário');
    if (oponente.erro) return res.status(400).json({ mensagem: oponente.erro });

    const nomeEscapado = oponente.valor.replace(/[\\%_]/g, '\\$&');
    const cliente = clienteDaRequisicao(req);
    const { data: candidatos } = await executar(
      cliente.from('vw_perfis_publicos')
        .select('id,nome')
        .ilike('nome', nomeEscapado)
        .limit(2)
    );

    if (!candidatos?.length) {
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

    const { data: existente } = await executar(
      cliente.from('desafios')
        .select('id')
        .eq('status', 'pendente')
        .eq('desafiante_id', req.usuario.id)
        .eq('desafiado_id', adversario.id)
        .maybeSingle()
    );
    const { data: inverso } = await executar(
      cliente.from('desafios')
        .select('id')
        .eq('status', 'pendente')
        .eq('desafiante_id', adversario.id)
        .eq('desafiado_id', req.usuario.id)
        .maybeSingle()
    );
    if (existente || inverso) {
      return res.status(409).json({ mensagem: 'Já existe um desafio pendente entre vocês dois.' });
    }

    const { data, error } = await cliente.from('desafios').insert({
      desafiante_id: req.usuario.id,
      desafiado_id: adversario.id
    }).select('id').single();
    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ mensagem: 'Já existe um desafio pendente entre vocês dois.' });
      }
      throw error;
    }

    return res.status(201).json({
      mensagem: `Desafio enviado para ${adversario.nome}!`,
      desafio: { id: data.id }
    });
  });

  router.patch('/desafios/:id', async (req, res) => {
    const desafioId = lerUuid(req.params.id);
    const acao = (req.body || {}).acao;
    if (!desafioId || !['aceitar', 'recusar'].includes(acao)) {
      return res.status(400).json({ mensagem: 'Informe o desafio e a ação (aceitar ou recusar).' });
    }

    const cliente = clienteDaRequisicao(req);
    const { data: desafio } = await executar(
      cliente.from('desafios')
        .select('id,desafiado_id,status')
        .eq('id', desafioId)
        .maybeSingle()
    );
    if (!desafio || desafio.desafiado_id !== req.usuario.id) {
      return res.status(404).json({ mensagem: 'Desafio não encontrado.' });
    }
    if (desafio.status !== 'pendente') {
      return res.status(409).json({ mensagem: 'Este desafio já foi respondido.' });
    }

    const novoStatus = acao === 'aceitar' ? 'aceito' : 'recusado';
    const { data: atualizado } = await executar(
      cliente.from('desafios')
        .update({ status: novoStatus })
        .eq('id', desafioId)
        .eq('desafiado_id', req.usuario.id)
        .eq('status', 'pendente')
        .select('id')
        .maybeSingle()
    );
    if (!atualizado) {
      return res.status(409).json({ mensagem: 'Este desafio já foi respondido.' });
    }

    return res.json({
      mensagem: acao === 'aceitar' ? 'Desafio aceito!' : 'Desafio recusado.',
      status: novoStatus
    });
  });

  return router;
}

module.exports = { criarRotasDesafios };
