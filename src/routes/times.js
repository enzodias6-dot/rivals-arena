'use strict';

const express = require('express');
const { executar, buscarTodasAsPaginas, clienteDaRequisicao } = require('../utils/supabase');
const { lerUuid, validarNome } = require('../utils/validacao');

function validarDescricaoTime(valor) {
  if (valor === undefined || valor === null || valor === '') return { valor: null };
  if (typeof valor !== 'string') return { erro: 'A descrição deve ser um texto válido.' };
  const descricao = valor.trim();
  if (descricao.length > 500) return { erro: 'A descrição deve ter no máximo 500 caracteres.' };
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(descricao)) {
    return { erro: 'A descrição contém caracteres inválidos.' };
  }
  return { valor: descricao || null };
}

function criarRotasTimes() {
  const router = express.Router();

  // Consultas compatíveis com o schema confirmado: times.responsavel_id e
  // membros_time.usuario_id. Não pressupõe tabelas de solicitações inexistentes.
  router.get('/times', async (req, res) => {
    const cliente = clienteDaRequisicao(req);
    const times = await buscarTodasAsPaginas(() => cliente.from('times')
      .select('id,nome,descricao,responsavel_id,status,publico,criado_em', { count: 'exact' })
      .eq('status', 'ativo')
      .order('nome', { ascending: true }));
    const membros = await buscarTodasAsPaginas(() => cliente.from('membros_time')
      .select('time_id,usuario_id,status', { count: 'exact' })
      .eq('status', 'ativo'));
    const membrosDoUsuario = new Set(membros
      .filter((membro) => membro.usuario_id === req.usuario.id)
      .map((membro) => membro.time_id));
    const totais = new Map();
    for (const membro of membros) totais.set(membro.time_id, (totais.get(membro.time_id) || 0) + 1);
    return res.json({
      times: times.map((time) => ({
        ...time,
        integrantes: totais.get(time.id) || 0,
        meuPapel: time.responsavel_id === req.usuario.id
          ? 'lider'
          : membrosDoUsuario.has(time.id) ? 'membro' : 'visitante'
      }))
    });
  });

  router.post('/times', async (req, res) => {
    const corpo = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
      ? req.body
      : {};
    const nome = validarNome(corpo.nome, 'O nome do time');
    if (nome.erro) return res.status(400).json({ mensagem: nome.erro });
    const descricao = validarDescricaoTime(corpo.descricao);
    if (descricao.erro) return res.status(400).json({ mensagem: descricao.erro });

    const cliente = clienteDaRequisicao(req);
    const { data: timeId, error } = await cliente.rpc('criar_time', {
      p_nome: nome.valor,
      p_descricao: descricao.valor
    });

    if (error) {
      if (error.code === '42501' || error.status === 403) {
        return res.status(403).json({ mensagem: 'Sua sessão não permite criar este time.' });
      }
      if (error.code === '22023') {
        return res.status(400).json({ mensagem: 'Os dados informados não atendem às regras de criação do time.' });
      }
      if (error.code === '23505') {
        return res.status(409).json({ mensagem: 'Não foi possível criar o time por conflito com um registro existente.' });
      }
      if (error.code === '42883' || error.code === 'PGRST202') {
        return res.status(503).json({ mensagem: 'A criação de times ainda aguarda a aplicação da atualização aprovada no banco de dados.' });
      }
      if (error.status === 401) {
        return res.status(401).json({ mensagem: 'Sessão inválida ou expirada. Entre novamente.' });
      }
      if (error.status === 429) {
        return res.status(429).json({ mensagem: 'Supabase limitou temporariamente as requisições. Aguarde e tente novamente.' });
      }
      const indisponivel = error.status >= 500 ||
        error.name === 'AuthRetryableFetchError' ||
        (error.name === 'TypeError' && /fetch failed|network/i.test(error.message || '')) ||
        ['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT'].includes(error.code);
      console.error('Falha ao criar time no Supabase:', error.code || error.name || 'erro desconhecido');
      return res.status(indisponivel ? 503 : 500).json({
        mensagem: indisponivel
          ? 'Supabase indisponível. Confira a conexão e tente novamente.'
          : 'Não foi possível criar o time. Tente novamente.'
      });
    }

    if (typeof timeId !== 'string' || !lerUuid(timeId)) {
      console.error('Falha ao criar time no Supabase: RPC não retornou um UUID válido.');
      return res.status(500).json({ mensagem: 'Não foi possível confirmar a criação do time.' });
    }

    return res.status(201).json({
      mensagem: 'Time criado com sucesso! Você já está cadastrado como responsável.',
      time: { id: timeId, nome: nome.valor, descricao: descricao.valor }
    });
  });

  router.post('/times/:id/solicitacoes', async (req, res) => {
    const timeId = lerUuid(req.params.id);
    if (!timeId) return res.status(400).json({ mensagem: 'Time inválido.' });
    const cliente = clienteDaRequisicao(req);
    const { data, error } = await cliente.rpc('solicitar_entrada_time', { p_time_id: timeId });
    if (error) {
      const mensagens = {
        already_team_member: [409, 'Você já faz parte desta equipe.'],
        team_not_available: [409, 'Esta equipe não está disponível para receber solicitações.'],
        request_already_pending: [409, 'Você já tem uma solicitação pendente para esta equipe.'],
        authentication_required: [401, 'Entre novamente para solicitar entrada.']
      };
      const [status, mensagem] = mensagens[error.message] || (
        error.code === '23505' ? [409, 'Você já tem uma solicitação pendente para esta equipe.'] :
        error.code === '42883' || error.code === 'PGRST202' ? [503, 'A função de solicitações ainda não está disponível no banco.'] :
        [500, 'Não foi possível enviar sua solicitação. Tente novamente.']
      );
      return res.status(status).json({ mensagem });
    }
    return res.status(201).json({ mensagem: 'Solicitação enviada. Aguarde a aprovação do responsável.', solicitacao: { id: data } });
  });

  router.get('/times/minhas-solicitacoes', async (req, res) => {
    const cliente = clienteDaRequisicao(req);
    const { data: solicitacoes } = await executar(cliente.from('solicitacoes_time')
      .select('id,time_id,status,criado_em,atualizado_em')
      .eq('usuario_id', req.usuario.id)
      .order('criado_em', { ascending: false }));
    const ids = [...new Set((solicitacoes || []).map((item) => item.time_id))];
    const { data: timesRelacionados } = ids.length
      ? await executar(cliente.from('times').select('id,nome').in('id', ids))
      : { data: [] };
    const nomes = new Map((timesRelacionados || []).map((time) => [time.id, time.nome]));
    return res.json({ solicitacoes: (solicitacoes || []).map((item) => ({
      ...item, time_nome: nomes.get(item.time_id) || 'Equipe'
    })) });
  });

  router.get('/times/solicitacoes/recebidas', async (req, res) => {
    const cliente = clienteDaRequisicao(req);
    const { data: meusTimes } = await executar(cliente.from('times')
      .select('id,nome')
      .eq('responsavel_id', req.usuario.id)
      .eq('status', 'ativo'));
    const ids = (meusTimes || []).map((time) => time.id);
    if (!ids.length) return res.json({ solicitacoes: [] });
    const { data: solicitacoes } = await executar(cliente.from('solicitacoes_time')
      .select('id,time_id,usuario_id,status,criado_em')
      .in('time_id', ids)
      .eq('status', 'pendente')
      .order('criado_em', { ascending: true }));
    const usuarios = [...new Set((solicitacoes || []).map((item) => item.usuario_id))];
    const { data: perfis } = usuarios.length
      ? await executar(cliente.from('vw_perfis_publicos').select('id,nome').in('id', usuarios))
      : { data: [] };
    const nomesTimes = new Map((meusTimes || []).map((time) => [time.id, time.nome]));
    const nomesUsuarios = new Map((perfis || []).map((perfil) => [perfil.id, perfil.nome]));
    return res.json({ solicitacoes: (solicitacoes || []).map((item) => ({
      ...item,
      time_nome: nomesTimes.get(item.time_id) || 'Equipe',
      jogador_nome: nomesUsuarios.get(item.usuario_id) || 'Jogador'
    })) });
  });

  router.post('/times/solicitacoes/:id/responder', async (req, res) => {
    const solicitacaoId = lerUuid(req.params.id);
    const decisao = (req.body || {}).decisao;
    if (!solicitacaoId || !['aprovar', 'recusar'].includes(decisao)) {
      return res.status(400).json({ mensagem: 'Informe uma solicitação válida e escolha aprovar ou recusar.' });
    }
    const cliente = clienteDaRequisicao(req);
    const { data, error } = await cliente.rpc('responder_solicitacao_time', {
      p_solicitacao_id: solicitacaoId,
      p_decisao: decisao
    });
    if (error) {
      const mensagens = {
        only_active_team_owner_can_decide: [403, 'Somente o responsável da equipe pode responder.'],
        request_not_found: [404, 'Solicitação não encontrada.'],
        request_already_decided: [409, 'Esta solicitação já foi respondida.'],
        already_member: [409, 'Este jogador já faz parte da equipe.'],
        member_previously_removed: [409, 'Este jogador possui um vínculo anterior que precisa ser verificado.']
      };
      const [status, mensagem] = mensagens[error.message] || (
        error.code === '42883' || error.code === 'PGRST202' ? [503, 'A função de resposta ainda não está disponível no banco.'] :
        [500, 'Não foi possível responder à solicitação. Tente novamente.']
      );
      return res.status(status).json({ mensagem });
    }
    return res.json({ mensagem: data === 'aprovada' ? 'Solicitação aprovada. Jogador adicionado à equipe.' : 'Solicitação recusada.', status: data });
  });

  router.get('/times/:id', async (req, res) => {
    const timeId = lerUuid(req.params.id);
    if (!timeId) return res.status(400).json({ mensagem: 'Time inválido.' });
    const cliente = clienteDaRequisicao(req);
    const { data: time } = await executar(cliente.from('times')
      .select('id,nome,descricao,responsavel_id,status,publico,criado_em,atualizado_em')
      .eq('id', timeId)
      .maybeSingle());
    if (!time) return res.status(404).json({ mensagem: 'Time não encontrado.' });

    const membros = await buscarTodasAsPaginas(() => cliente.from('membros_time')
      .select('id,usuario_id,funcao,status,entrou_em', { count: 'exact' })
      .eq('time_id', timeId)
      .eq('status', 'ativo')
      .order('entrou_em', { ascending: true }));
    const ids = [...new Set([time.responsavel_id, ...membros.map((membro) => membro.usuario_id)])];
    const { data: perfis } = await executar(cliente.from('vw_perfis_publicos')
      .select('id,nome')
      .in('id', ids));
    const nomes = new Map((perfis || []).map((perfil) => [perfil.id, perfil.nome]));
    return res.json({
      time: {
        ...time,
        meuPapel: time.responsavel_id === req.usuario.id
          ? 'lider'
          : membros.some((membro) => membro.usuario_id === req.usuario.id) ? 'membro' : 'visitante',
        lider: { id: time.responsavel_id, nome: nomes.get(time.responsavel_id) || null },
        membros: membros.map((membro) => ({
          ...membro,
          jogador_id: membro.usuario_id,
          nome: nomes.get(membro.usuario_id) || null
        }))
      }
    });
  });

  return router;
}

module.exports = { criarRotasTimes };
