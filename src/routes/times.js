'use strict';

const express = require('express');
const { executar, buscarTodasAsPaginas, clienteDaRequisicao } = require('../utils/supabase');
const { lerUuid } = require('../utils/validacao');

function criarRotasTimes() {
  const router = express.Router();

  // Consultas compatíveis com o schema confirmado: times.responsavel_id e
  // membros_time.usuario_id. Não pressupõe RPCs/tabelas de solicitações inexistentes.
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
