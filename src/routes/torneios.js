'use strict';

const express = require('express');

const { executar, buscarTodasAsPaginas, clienteDaRequisicao } = require('../utils/supabase');
const { lerUuid, validarCriacaoCampeonato } = require('../utils/validacao');

const ORDEM_STATUS = { aberto: 0, em_breve: 1, encerrado: 2 };
const STATUS_INSCRICAO_ATIVA = ['pendente', 'aprovada'];

function criarRotasTorneios() {
  const router = express.Router();

  router.get('/torneios', async (req, res) => {
    const cliente = clienteDaRequisicao(req);
    const [campeonatos, inscricoes] = await Promise.all([
      buscarTodasAsPaginas(() => cliente.from('campeonatos')
        .select('id,nome,descricao,modalidade,formato,max_participantes,inicio_em,encerramento_em,premio,status', { count: 'exact' })),
      buscarTodasAsPaginas(() => cliente.from('inscricoes')
        .select('campeonato_id,jogador_id', { count: 'exact' })
        .in('status', STATUS_INSCRICAO_ATIVA))
    ]);

    const contagens = new Map();
    const meusCampeonatos = new Set();
    for (const inscricao of inscricoes) {
      contagens.set(inscricao.campeonato_id, (contagens.get(inscricao.campeonato_id) || 0) + 1);
      if (inscricao.jogador_id === req.usuario.id) meusCampeonatos.add(inscricao.campeonato_id);
    }

    const torneios = campeonatos.map((campeonato) => ({
      id: campeonato.id,
      nome: campeonato.nome,
      descricao: campeonato.descricao,
      modalidade: campeonato.modalidade,
      formato: campeonato.formato,
      vagas: campeonato.max_participantes,
      inicio: campeonato.inicio_em,
      encerramento: campeonato.encerramento_em,
      premiacao: campeonato.premio,
      status: campeonato.status,
      inscritos: contagens.get(campeonato.id) || 0,
      inscrito: meusCampeonatos.has(campeonato.id)
    })).sort((a, b) =>
      (ORDEM_STATUS[a.status] ?? 3) - (ORDEM_STATUS[b.status] ?? 3) ||
      String(a.id).localeCompare(String(b.id))
    );

    return res.json({ torneios });
  });

  router.post('/torneios', async (req, res) => {
    const dados = validarCriacaoCampeonato(req.body);
    if (dados.erro) return res.status(400).json({ mensagem: dados.erro });

    const cliente = clienteDaRequisicao(req);
    const { data: campeonato, error } = await cliente.from('campeonatos')
      .insert({
        ...dados,
        status: 'aberto',
        criador_id: req.usuario.id
      })
      .select('id,nome,descricao,modalidade,formato,max_participantes,inicio_em,encerramento_em,premio,status,criador_id')
      .single();

    if (error) {
      if (error.code === '42501' || error.status === 403) {
        return res.status(403).json({ mensagem: 'A criação do campeonato foi bloqueada pelas políticas de acesso do Supabase.' });
      }
      if (['23502', '23514', '22P02'].includes(error.code)) {
        return res.status(400).json({ mensagem: 'Os dados do campeonato não atendem às regras do banco.' });
      }
      if (error.code === '23505') {
        return res.status(409).json({ mensagem: 'O campeonato entrou em conflito com um registro existente.' });
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
      console.error('Falha ao criar campeonato no Supabase:', error.code || error.name || 'erro desconhecido');
      return res.status(indisponivel ? 503 : 500).json({
        mensagem: indisponivel
          ? 'Supabase indisponível. Confira a conexão e tente novamente.'
          : 'Não foi possível criar o campeonato. Tente novamente.'
      });
    }

    if (!campeonato) {
      console.error('Falha ao criar campeonato no Supabase: resposta sem registro.');
      return res.status(500).json({ mensagem: 'Não foi possível confirmar a criação do campeonato.' });
    }

    return res.status(201).json({ mensagem: 'Campeonato criado com sucesso.', campeonato });
  });

  router.post('/torneios/:id/inscricao', async (req, res) => {
    const campeonatoId = lerUuid(req.params.id);
    if (!campeonatoId) return res.status(400).json({ mensagem: 'Torneio inválido.' });

    const cliente = clienteDaRequisicao(req);
    const { data: campeonato } = await executar(
      cliente.from('campeonatos')
        .select('id,nome,max_participantes,status')
        .eq('id', campeonatoId)
        .maybeSingle()
    );

    if (!campeonato) return res.status(404).json({ mensagem: 'Torneio não encontrado.' });
    if (campeonato.status !== 'aberto') {
      return res.status(409).json({ mensagem: 'As inscrições deste torneio não estão abertas.' });
    }

    const { data: inscricaoExistente } = await executar(
      cliente.from('inscricoes')
        .select('id,status,inscrito_em')
        .eq('campeonato_id', campeonatoId)
        .eq('jogador_id', req.usuario.id)
        .maybeSingle()
    );
    if (inscricaoExistente && STATUS_INSCRICAO_ATIVA.includes(inscricaoExistente.status)) {
      return res.status(409).json({ mensagem: 'Você já está inscrito neste torneio.' });
    }

    const { count: totalInscricoes } = await executar(
      cliente.from('inscricoes')
        .select('id', { count: 'exact', head: true })
        .eq('campeonato_id', campeonatoId)
        .in('status', STATUS_INSCRICAO_ATIVA)
    );
    if (!Number.isInteger(totalInscricoes)) {
      throw new Error('Supabase não retornou a contagem de inscrições necessária para verificar as vagas.');
    }
    if (totalInscricoes >= Number(campeonato.max_participantes)) {
      return res.status(409).json({ mensagem: 'Todas as vagas deste torneio já foram preenchidas.' });
    }

    const consultaInscricao = inscricaoExistente
      ? cliente.from('inscricoes')
        .update({ status: 'pendente' })
        .eq('id', inscricaoExistente.id)
        .eq('status', 'cancelada')
      : cliente.from('inscricoes').insert({
        campeonato_id: campeonatoId,
        jogador_id: req.usuario.id
      });
    const { data: inscricaoAtualizada, error } = await consultaInscricao.select('id,status,inscrito_em');
    if (error) {
      if (error.code === 'P0001' && error.message === 'championship_full') {
        return res.status(409).json({ mensagem: 'Todas as vagas deste torneio já foram preenchidas.' });
      }
      if (error.code === 'P0001' && error.message === 'registration_closed') {
        return res.status(409).json({ mensagem: 'As inscrições deste torneio não estão abertas.' });
      }
      if (error.code === '23505') {
        return res.status(409).json({ mensagem: 'Você já está inscrito neste torneio.' });
      }
      throw error;
    }

    if (!inscricaoAtualizada?.length) {
      return res.status(409).json({ mensagem: 'Não foi possível reativar sua inscrição. Atualize a página e tente novamente.' });
    }

    return res.status(201).json({
      mensagem: inscricaoExistente
        ? `Reinscrição confirmada em ${campeonato.nome}!`
        : `Inscrição confirmada em ${campeonato.nome}!`,
      inscricao: inscricaoAtualizada[0],
      inscritos: totalInscricoes + 1
    });
  });

  router.delete('/torneios/:id/inscricao', async (req, res) => {
    const campeonatoId = lerUuid(req.params.id);
    if (!campeonatoId) return res.status(400).json({ mensagem: 'Torneio inválido.' });

    const cliente = clienteDaRequisicao(req);
    const { data: campeonato } = await executar(
      cliente.from('campeonatos')
        .select('status')
        .eq('id', campeonatoId)
        .maybeSingle()
    );
    if (!campeonato) return res.status(404).json({ mensagem: 'Torneio não encontrado.' });
    if (campeonato.status !== 'aberto') {
      return res.status(409).json({ mensagem: 'Não é mais possível cancelar a inscrição neste torneio.' });
    }

    const { data } = await executar(
      cliente.from('inscricoes')
        .update({ status: 'cancelada' })
        .eq('campeonato_id', campeonatoId)
        .eq('jogador_id', req.usuario.id)
        .in('status', STATUS_INSCRICAO_ATIVA)
        .select('id')
    );
    if (!data?.length) {
      return res.status(404).json({ mensagem: 'Você não possui uma inscrição ativa neste torneio.' });
    }

    return res.json({ mensagem: 'Inscrição cancelada.' });
  });

  router.get('/resumo', async (req, res) => {
    const cliente = clienteDaRequisicao(req);
    const [{ count: torneiosAbertos }, inscricoes, { count: partidasConcluidas }] = await Promise.all([
      executar(cliente.from('campeonatos')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'aberto')),
      buscarTodasAsPaginas(() => cliente.from('inscricoes')
        .select('jogador_id', { count: 'exact' })
        .in('status', STATUS_INSCRICAO_ATIVA)),
      executar(cliente.from('partidas')
        .select('id', { count: 'exact', head: true })
        .not('concluida_em', 'is', null))
    ]);
    if (!Number.isInteger(torneiosAbertos) || !Number.isInteger(partidasConcluidas)) {
      throw new Error('Supabase não retornou as contagens necessárias para montar o resumo.');
    }

    return res.json({
      torneiosAbertos,
      jogadoresInscritos: new Set(inscricoes.map((item) => item.jogador_id)).size,
      partidasConcluidas
    });
  });

  router.get('/historico/inscricoes', async (req, res) => {
    const cliente = clienteDaRequisicao(req);
    const inscricoes = await buscarTodasAsPaginas(() => cliente.from('inscricoes')
      .select('id,campeonato_id,status,inscrito_em', { count: 'exact' })
      .eq('jogador_id', req.usuario.id)
      .in('status', ['pendente', 'aprovada', 'cancelada'])
      .order('inscrito_em', { ascending: false }));

    const idsCampeonatos = [...new Set(inscricoes.map((inscricao) => inscricao.campeonato_id))];
    const { data: campeonatos } = idsCampeonatos.length
      ? await executar(cliente.from('campeonatos')
        .select('id,nome,modalidade,formato')
        .in('id', idsCampeonatos))
      : { data: [] };
    const campeonatosPorId = new Map((campeonatos || []).map((campeonato) => [campeonato.id, campeonato]));

    return res.json({
      inscricoes: inscricoes.map((inscricao) => {
        const campeonato = campeonatosPorId.get(inscricao.campeonato_id);
        return {
          id: inscricao.id,
          campeonato_id: inscricao.campeonato_id,
          campeonato: campeonato?.nome || null,
          modalidade: campeonato?.modalidade || null,
          formato: campeonato?.formato || null,
          inscrito_em: inscricao.inscrito_em,
          status: inscricao.status
        };
      })
    });
  });

  router.get('/partidas', async (req, res) => {
    const cliente = clienteDaRequisicao(req);
    const { data: partidas } = await executar(
      cliente.from('partidas')
        .select('id,campeonato_id,jogador_1_id,jogador_2_id,vencedor_id,fase,resultado,concluida_em')
        .or(`jogador_1_id.eq.${req.usuario.id},jogador_2_id.eq.${req.usuario.id}`)
        .not('concluida_em', 'is', null)
        .order('concluida_em', { ascending: false })
        .limit(10)
    );

    const idsJogadores = [...new Set((partidas || [])
      .flatMap((partida) => [partida.jogador_1_id, partida.jogador_2_id])
      .filter(Boolean))];
    const idsCampeonatos = [...new Set((partidas || []).map((partida) => partida.campeonato_id).filter(Boolean))];
    const [perfisResult, campeonatosResult] = await Promise.all([
      idsJogadores.length
        ? executar(cliente.from('vw_perfis_publicos').select('id,nome').in('id', idsJogadores))
        : Promise.resolve({ data: [] }),
      idsCampeonatos.length
        ? executar(cliente.from('campeonatos').select('id,nome').in('id', idsCampeonatos))
        : Promise.resolve({ data: [] })
    ]);
    const nomes = new Map((perfisResult.data || []).map((perfil) => [perfil.id, perfil.nome]));
    const nomesCampeonatos = new Map((campeonatosResult.data || []).map((item) => [item.id, item.nome]));

    return res.json({
      partidas: (partidas || []).map((partida) => {
        const vencedorEhJogador1 = partida.vencedor_id === partida.jogador_1_id;
        const vencedorEhJogador2 = partida.vencedor_id === partida.jogador_2_id;
        const perdedorId = vencedorEhJogador1
          ? partida.jogador_2_id
          : vencedorEhJogador2 ? partida.jogador_1_id : null;
        return {
          id: partida.id,
          jogador1: nomes.get(partida.jogador_1_id) || null,
          jogador2: nomes.get(partida.jogador_2_id) || null,
          vencedor: nomes.get(partida.vencedor_id) || null,
          perdedor: perdedorId ? nomes.get(perdedorId) || null : null,
          resultado: partida.resultado,
          fase: partida.fase,
          torneio: nomesCampeonatos.get(partida.campeonato_id) || null
        };
      })
    });
  });

  return router;
}

module.exports = { criarRotasTorneios };
