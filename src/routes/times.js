'use strict';

const express = require('express');

const { executar, buscarTodasAsPaginas, clienteDaRequisicao } = require('../utils/supabase');
const { lerUuid, validarNome } = require('../utils/validacao');

const LIMITE_INTEGRANTES_PROPOSTO = 5;

function validarDadosTime(corpo, parcial = false) {
  const dados = corpo && typeof corpo === 'object' && !Array.isArray(corpo) ? corpo : {};
  const resposta = {};

  if (!parcial || dados.nome !== undefined) {
    const nome = validarNome(dados.nome, 'O nome do time');
    if (nome.erro) return { erro: nome.erro };
    resposta.nome = nome.valor;
  }
  if (!parcial || dados.descricao !== undefined) {
    if (dados.descricao !== undefined && typeof dados.descricao !== 'string') {
      return { erro: 'A descrição do time deve ser um texto.' };
    }
    resposta.descricao = (dados.descricao || '').trim();
    if (resposta.descricao.length > 1000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(resposta.descricao)) {
      return { erro: 'A descrição do time deve ter até 1000 caracteres válidos.' };
    }
  }
  if (!parcial || dados.max_integrantes !== undefined) {
    const capacidade = dados.max_integrantes === undefined
      ? LIMITE_INTEGRANTES_PROPOSTO
      : dados.max_integrantes;
    if (!Number.isInteger(capacidade) || capacidade < 2 || capacidade > LIMITE_INTEGRANTES_PROPOSTO) {
      return { erro: 'O limite proposto deve ser um número inteiro entre 2 e 5.' };
    }
    resposta.max_integrantes = capacidade;
  }
  return resposta;
}

function responderErroRpc(res, error) {
  if (error.code === '42501' || error.status === 403) {
    return res.status(403).json({ mensagem: 'Você não tem permissão para realizar esta ação no time.' });
  }
  if (error.code === 'P0002') return res.status(404).json({ mensagem: 'Time ou solicitação não encontrado.' });
  if (['P0001', '23505'].includes(error.code)) {
    const mensagens = {
      team_full: 'O time atingiu o limite de integrantes.',
      already_team_member: 'Você já integra este time.',
      request_already_decided: 'Esta solicitação já foi respondida.',
      new_leader_must_be_active_member: 'A nova liderança deve ser um integrante ativo.',
      leader_must_transfer_first: 'Transfira a liderança antes de sair ou ser removido.',
      capacity_below_members: 'O limite não pode ser menor que o número atual de integrantes.',
      request_not_found: 'Solicitação não encontrada.'
    };
    return res.status(409).json({
      mensagem: mensagens[error.message] || 'A ação conflita com o estado atual do time.'
    });
  }
  if (error.code?.startsWith('22')) {
    return res.status(400).json({ mensagem: 'Os dados enviados não são válidos para esta ação.' });
  }
  if (['42P01', '42703', '42883', 'PGRST202', 'PGRST205'].includes(error.code)) {
    return res.status(503).json({
      mensagem: 'O schema ou RPC de Times necessário não está disponível ou homologado no Supabase; nenhuma alteração foi realizada.'
    });
  }
  return null;
}

async function chamarRpc(req, nome, parametros, res, status = 200) {
  const { data, error } = await clienteDaRequisicao(req).rpc(nome, parametros);
  if (error) {
    const resposta = responderErroRpc(res, error);
    if (resposta) return resposta;
    throw error;
  }
  return res.status(status).json({ dados: data });
}

function criarRotasTimes() {
  const router = express.Router();

  router.get('/times', async (req, res) => {
    const cliente = clienteDaRequisicao(req);
    const [times, membros, solicitacoes] = await Promise.all([
      buscarTodasAsPaginas(() => cliente.from('times')
        .select('id,nome,descricao,lider_id,max_integrantes,criado_em', { count: 'exact' })
        .order('nome', { ascending: true })),
      buscarTodasAsPaginas(() => cliente.from('membros_time')
        .select('time_id,jogador_id,status', { count: 'exact' })
        .eq('status', 'ativo')),
      buscarTodasAsPaginas(() => cliente.from('solicitacoes_time')
        .select('time_id,status', { count: 'exact' })
        .eq('jogador_id', req.usuario.id)
        .eq('status', 'pendente'))
    ]);

    const totalPorTime = new Map();
    for (const membro of membros) {
      totalPorTime.set(membro.time_id, (totalPorTime.get(membro.time_id) || 0) + 1);
    }
    const solicitacoesPendentes = new Set(solicitacoes.map((item) => item.time_id));
    return res.json({
      times: times.map((time) => ({
        ...time,
        integrantes: totalPorTime.get(time.id) || 0,
        meuPapel: time.lider_id === req.usuario.id
          ? 'lider'
          : membros.some((membro) => membro.time_id === time.id && membro.jogador_id === req.usuario.id)
            ? 'membro'
            : 'visitante',
        solicitacaoPendente: solicitacoesPendentes.has(time.id)
      }))
    });
  });

  router.get('/times/:id', async (req, res) => {
    const timeId = lerUuid(req.params.id);
    if (!timeId) return res.status(400).json({ mensagem: 'Time inválido.' });
    const cliente = clienteDaRequisicao(req);
    const { data: time } = await executar(cliente.from('times')
      .select('id,nome,descricao,lider_id,max_integrantes,criado_em,atualizado_em')
      .eq('id', timeId)
      .maybeSingle());
    if (!time) return res.status(404).json({ mensagem: 'Time não encontrado.' });

    const [membros, solicitacoes] = await Promise.all([
      buscarTodasAsPaginas(() => cliente.from('membros_time')
        .select('id,jogador_id,status,entrou_em', { count: 'exact' })
        .eq('time_id', timeId)
        .eq('status', 'ativo')
        .order('entrou_em', { ascending: true })),
      time.lider_id === req.usuario.id
        ? buscarTodasAsPaginas(() => cliente.from('solicitacoes_time')
          .select('id,jogador_id,status,criada_em', { count: 'exact' })
          .eq('time_id', timeId)
          .eq('status', 'pendente')
          .order('criada_em', { ascending: true }))
        : Promise.resolve([])
    ]);
    const idsJogadores = [...new Set([time.lider_id, ...membros.map((membro) => membro.jogador_id),
      ...solicitacoes.map((item) => item.jogador_id)])];
    const { data: perfis } = await executar(cliente.from('vw_perfis_publicos')
      .select('id,nome', { count: 'exact' })
      .in('id', idsJogadores));
    const nomes = new Map((perfis || []).map((perfil) => [perfil.id, perfil.nome]));

    return res.json({
      time: {
        ...time,
        meuPapel: time.lider_id === req.usuario.id
          ? 'lider'
          : membros.some((membro) => membro.jogador_id === req.usuario.id) ? 'membro' : 'visitante',
        lider: { id: time.lider_id, nome: nomes.get(time.lider_id) || null },
        membros: membros.map((membro) => ({
          ...membro,
          nome: nomes.get(membro.jogador_id) || null
        })),
        solicitacoes: solicitacoes.map((item) => ({
          ...item,
          nome: nomes.get(item.jogador_id) || null
        }))
      }
    });
  });

  router.post('/times', async (req, res) => {
    const dados = validarDadosTime(req.body);
    if (dados.erro) return res.status(400).json({ mensagem: dados.erro });
    return chamarRpc(req, 'criar_time', {
      p_nome: dados.nome,
      p_descricao: dados.descricao,
      p_max_integrantes: dados.max_integrantes
    }, res, 201);
  });

  router.patch('/times/:id', async (req, res) => {
    const timeId = lerUuid(req.params.id);
    if (!timeId) return res.status(400).json({ mensagem: 'Time inválido.' });
    const dados = validarDadosTime(req.body);
    if (dados.erro) return res.status(400).json({ mensagem: dados.erro });
    return chamarRpc(req, 'atualizar_time', {
      p_time_id: timeId,
      p_nome: dados.nome,
      p_descricao: dados.descricao,
      p_max_integrantes: dados.max_integrantes
    }, res);
  });

  router.post('/times/:id/solicitacoes', async (req, res) => {
    const timeId = lerUuid(req.params.id);
    if (!timeId) return res.status(400).json({ mensagem: 'Time inválido.' });
    return chamarRpc(req, 'solicitar_entrada_time', { p_time_id: timeId }, res, 201);
  });

  router.patch('/times/solicitacoes/:id', async (req, res) => {
    const solicitacaoId = lerUuid(req.params.id);
    if (!solicitacaoId) return res.status(400).json({ mensagem: 'Solicitação inválida.' });
    if (typeof req.body?.aceitar !== 'boolean') {
      return res.status(400).json({ mensagem: 'Informe se a solicitação deve ser aprovada ou recusada.' });
    }
    return chamarRpc(req, 'responder_solicitacao_time', {
      p_solicitacao_id: solicitacaoId,
      p_aceitar: req.body.aceitar
    }, res);
  });

  router.post('/times/:id/sair', async (req, res) => {
    const timeId = lerUuid(req.params.id);
    if (!timeId) return res.status(400).json({ mensagem: 'Time inválido.' });
    return chamarRpc(req, 'sair_time', { p_time_id: timeId }, res);
  });

  router.delete('/times/:id/membros/:jogadorId', async (req, res) => {
    const timeId = lerUuid(req.params.id);
    const jogadorId = lerUuid(req.params.jogadorId);
    if (!timeId || !jogadorId) return res.status(400).json({ mensagem: 'Time ou jogador inválido.' });
    return chamarRpc(req, 'remover_membro_time', {
      p_time_id: timeId,
      p_jogador_id: jogadorId
    }, res);
  });

  router.post('/times/:id/transferir-lideranca', async (req, res) => {
    const timeId = lerUuid(req.params.id);
    const novoLiderId = lerUuid(req.body?.novo_lider_id);
    if (!timeId || !novoLiderId) {
      return res.status(400).json({ mensagem: 'Time ou novo líder inválido.' });
    }
    return chamarRpc(req, 'transferir_lider_time', {
      p_time_id: timeId,
      p_novo_lider_id: novoLiderId
    }, res);
  });

  return router;
}

module.exports = { criarRotasTimes, validarDadosTime };
