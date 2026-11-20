'use strict';

const express = require('express');

const { executar, clienteDaRequisicao } = require('../utils/supabase');
const { lerUuid, validarTimestampCampeonato } = require('../utils/validacao');

function validarCorpoResultado(corpo) {
  const dados = corpo && typeof corpo === 'object' && !Array.isArray(corpo) ? corpo : {};
  const vencedorId = dados.vencedor_id === null ? null : lerUuid(dados.vencedor_id);
  const chaveIdempotencia = lerUuid(dados.chave_idempotencia);
  if (dados.vencedor_id !== null && !vencedorId) return { erro: 'Informe um vencedor válido ou null em caso de empate.' };
  if (!chaveIdempotencia) return { erro: 'Informe uma chave de idempotência UUID para a operação.' };
  const resultado = typeof dados.resultado === 'string'
    ? dados.resultado
    : dados.resultado && typeof dados.resultado === 'object' && !Array.isArray(dados.resultado)
      ? dados.resultado.placar
      : null;
  if (typeof resultado !== 'string' || resultado.length > 63 ||
      !/^\d{1,31}-\d{1,31}$/.test(resultado)) {
    return { erro: 'Informe o placar no formato numérico exigido, por exemplo 2-1.' };
  }
  const [pontosJogador1, pontosJogador2] = resultado.split('-').map(BigInt);
  if ((pontosJogador1 === pontosJogador2) !== (vencedorId === null)) {
    return { erro: 'Informe vencedor_id como null somente quando o placar indicar empate.' };
  }
  return { vencedorId, resultado, chaveIdempotencia };
}

function resultadoConfirmado(partida) {
  if (partida.status !== 'concluida' || !partida.resultado) return null;
  return {
    partida_id: partida.id,
    vencedor_id: partida.vencedor_id,
    resultado: partida.resultado,
    status: 'confirmada',
    confirmado_em: partida.concluida_em
  };
}

function responderErroPartida(res, error) {
  if (error.code === '42501' || error.status === 403) {
    const mensagem = error.message === 'administrator_required'
      ? 'Somente um administrador pode resolver resultados contestados.'
      : 'Você não tem permissão para alterar esta partida.';
    return res.status(403).json({ mensagem });
  }
  if (error.code === 'P0002') return res.status(404).json({ mensagem: 'Partida ou resultado não encontrado.' });
  if (['P0001', '23505'].includes(error.code)) {
    const mensagens = {
      match_finalized: 'A partida já foi finalizada e não pode ser alterada.',
      result_not_waiting_for_confirmation: 'O resultado não está aguardando confirmação.',
      result_not_open_for_contest: 'O resultado não está disponível para contestação.',
      result_not_divergent: 'O placar enviado é igual ao relato atual; confirme-o em vez de contestar.',
      idempotency_key_reused: 'A chave de idempotência já foi usada em outra operação.',
      opponent_confirmation_required: 'Somente o adversário pode confirmar este resultado.',
      opponent_contest_required: 'Somente o adversário pode contestar este resultado.',
      match_not_schedulable: 'A partida não pode ser agendada neste estado.',
      championship_full: 'A capacidade do campeonato foi atingida.',
      administrator_required: 'Somente um administrador pode resolver resultados contestados.',
      result_not_disputed: 'A partida não possui um resultado contestado aguardando decisão.'
    };
    return res.status(409).json({
      mensagem: mensagens[error.message] || 'A operação conflita com o estado atual da partida.'
    });
  }
  if (error.code?.startsWith('22')) {
    return res.status(400).json({ mensagem: 'Os dados enviados para a partida são inválidos.' });
  }
  if (['42P01', '42703', '42883', 'PGRST202', 'PGRST205'].includes(error.code)) {
    return res.status(503).json({
      mensagem: 'O fluxo de resultados depende de estruturas ou colunas ainda não homologadas no Supabase; nenhuma alteração foi realizada.'
    });
  }
  return null;
}

async function executarRpc(req, res, nome, parametros, campo = 'resultado') {
  const { data, error } = await clienteDaRequisicao(req).rpc(nome, parametros);
  if (error) {
    const resposta = responderErroPartida(res, error);
    if (resposta) return resposta;
    throw error;
  }
  return res.json({ [campo]: data });
}

function criarRotasPartidas() {
  const router = express.Router();

  router.get('/partidas/agenda', async (req, res) => {
    const cliente = clienteDaRequisicao(req);
    const colunasPartida = 'id,campeonato_id,jogador_1_id,jogador_2_id,vencedor_id,fase,status,agendada_para,concluida_em,resultado';
    const { data: partidasPessoais } = await executar(cliente.from('partidas')
      .select(colunasPartida)
      .or(`jogador_1_id.eq.${req.usuario.id},jogador_2_id.eq.${req.usuario.id}`)
      .order('agendada_para', { ascending: true })
      .limit(50));

    let partidasAdministrativas = [];
    try {
      const { data: perfilAtual } = await executar(cliente.from('usuarios')
        .select('perfil')
        .eq('id', req.usuario.id)
        .maybeSingle());
      if (perfilAtual?.perfil === 'admin') {
        const { data } = await executar(cliente.from('partidas')
          .select(colunasPartida)
          .eq('status', 'disputada')
          .order('agendada_para', { ascending: true })
          .limit(50));
        partidasAdministrativas = data || [];
      }
    } catch (erro) {
      const detalhe = erro?.code || erro?.status || erro?.name || 'erro desconhecido';
      console.error(`Falha ao carregar fila administrativa de partidas: ${detalhe}`);
    }

    const partidas = [...new Map(
      [...(partidasPessoais || []), ...partidasAdministrativas]
        .map((partida) => [partida.id, partida])
    ).values()];
    const idsPartidas = partidas.map((partida) => partida.id);
    const idsJogadores = [...new Set((partidas || [])
      .flatMap((partida) => [partida.jogador_1_id, partida.jogador_2_id])
      .filter(Boolean))];
    const idsCampeonatos = [...new Set((partidas || [])
      .map((partida) => partida.campeonato_id).filter(Boolean))];
    const [resultados, perfis, campeonatos] = await Promise.all([
      idsPartidas.length
        ? executar(cliente.from('partida_resultados')
          .select('partida_id,reportado_por,vencedor_id,resultado,status,contestado_por,vencedor_contestado_id,resultado_contestado')
          .in('partida_id', idsPartidas))
        : Promise.resolve({ data: [] }),
      idsJogadores.length
        ? executar(cliente.from('vw_perfis_publicos').select('id,nome').in('id', idsJogadores))
        : Promise.resolve({ data: [] }),
      idsCampeonatos.length
        ? executar(cliente.from('campeonatos').select('id,nome,criador_id').in('id', idsCampeonatos))
        : Promise.resolve({ data: [] })
    ]);
    const resultadosPorPartida = new Map((resultados.data || []).map((item) => [item.partida_id, item]));
    const nomes = new Map((perfis.data || []).map((item) => [item.id, item.nome]));
    const nomesCampeonatos = new Map((campeonatos.data || []).map((item) => [item.id, item.nome]));
    const criadoresCampeonatos = new Map((campeonatos.data || []).map((item) => [item.id, item.criador_id]));

    return res.json({
      partidas: (partidas || []).map((partida) => ({
        ...partida,
        jogador1: nomes.get(partida.jogador_1_id) || null,
        jogador2: nomes.get(partida.jogador_2_id) || null,
        campeonato: nomesCampeonatos.get(partida.campeonato_id) || null,
        criador_id: criadoresCampeonatos.get(partida.campeonato_id) || null,
        resultado: resultadosPorPartida.get(partida.id) || resultadoConfirmado(partida)
      }))
    });
  });

  router.get('/partidas/:id/resultado', async (req, res) => {
    const partidaId = lerUuid(req.params.id);
    if (!partidaId) return res.status(400).json({ mensagem: 'Partida inválida.' });
    const cliente = clienteDaRequisicao(req);
    const { data: partida } = await executar(cliente.from('partidas')
      .select('id,jogador_1_id,jogador_2_id,vencedor_id,status,agendada_para,concluida_em,resultado')
      .eq('id', partidaId)
      .maybeSingle());
    if (!partida) return res.status(404).json({ mensagem: 'Partida não encontrada.' });
    if (partida.jogador_1_id !== req.usuario.id && partida.jogador_2_id !== req.usuario.id) {
      return res.status(404).json({ mensagem: 'Partida não encontrada.' });
    }
    const { data: resultadoPendente } = await executar(cliente.from('partida_resultados')
      .select('partida_id,reportado_por,vencedor_id,resultado,status,contestado_por,vencedor_contestado_id,resultado_contestado')
      .eq('partida_id', partidaId)
      .maybeSingle());
    return res.json({ partida, resultado: resultadoPendente || resultadoConfirmado(partida) });
  });

  router.post('/partidas/:id/resultado', async (req, res) => {
    const partidaId = lerUuid(req.params.id);
    if (!partidaId) return res.status(400).json({ mensagem: 'Partida inválida.' });
    const dados = validarCorpoResultado(req.body);
    if (dados.erro) return res.status(400).json({ mensagem: dados.erro });
    return executarRpc(req, res, 'submeter_resultado_partida', {
      p_partida_id: partidaId,
      p_vencedor_id: dados.vencedorId,
      p_resultado: dados.resultado,
      p_chave_idempotencia: dados.chaveIdempotencia
    });
  });

  router.post('/partidas/:id/resultado/confirmar', async (req, res) => {
    const partidaId = lerUuid(req.params.id);
    const chaveIdempotencia = lerUuid(req.body?.chave_idempotencia);
    if (!partidaId) return res.status(400).json({ mensagem: 'Partida inválida.' });
    if (!chaveIdempotencia) return res.status(400).json({ mensagem: 'Informe uma chave de idempotência UUID.' });
    return executarRpc(req, res, 'confirmar_resultado_partida', {
      p_partida_id: partidaId,
      p_chave_idempotencia: chaveIdempotencia
    });
  });

  router.post('/partidas/:id/resultado/contestar', async (req, res) => {
    const partidaId = lerUuid(req.params.id);
    if (!partidaId) return res.status(400).json({ mensagem: 'Partida inválida.' });
    const dados = validarCorpoResultado(req.body);
    if (dados.erro) return res.status(400).json({ mensagem: dados.erro });
    return executarRpc(req, res, 'contestar_resultado_partida', {
      p_partida_id: partidaId,
      p_vencedor_id: dados.vencedorId,
      p_resultado: dados.resultado,
      p_chave_idempotencia: dados.chaveIdempotencia
    });
  });

  router.post('/partidas/:id/resultado/resolver', async (req, res) => {
    const partidaId = lerUuid(req.params.id);
    if (!partidaId) return res.status(400).json({ mensagem: 'Partida inválida.' });

    const corpo = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
      ? req.body
      : {};
    const vencedorId = corpo.vencedor_id === null ? null : lerUuid(corpo.vencedor_id);
    const resultado = typeof corpo.resultado === 'string' ? corpo.resultado : '';
    const justificativa = typeof corpo.justificativa === 'string'
      ? corpo.justificativa.trim()
      : '';
    const chaveIdempotencia = lerUuid(corpo.chave_idempotencia);

    if (corpo.vencedor_id !== null && !vencedorId) {
      return res.status(400).json({ mensagem: 'Informe um vencedor válido ou null em caso de empate.' });
    }
    if (!/^\d{1,31}-\d{1,31}$/.test(resultado) || resultado.length > 63) {
      return res.status(400).json({ mensagem: 'Informe o placar no formato 2-1.' });
    }
    const [pontos1, pontos2] = resultado.split('-').map(BigInt);
    if ((pontos1 === pontos2) !== (vencedorId === null)) {
      return res.status(400).json({ mensagem: 'O vencedor deve corresponder ao placar; em empate, envie vencedor_id como null.' });
    }
    if (!justificativa || justificativa.length > 1000) {
      return res.status(400).json({ mensagem: 'A justificativa é obrigatória e deve ter até 1000 caracteres.' });
    }
    if (!chaveIdempotencia) {
      return res.status(400).json({ mensagem: 'Informe uma chave de idempotência UUID.' });
    }

    return executarRpc(req, res, 'resolver_resultado_partida', {
      p_partida_id: partidaId,
      p_vencedor_id: vencedorId,
      p_resultado: resultado,
      p_justificativa: justificativa,
      p_chave_idempotencia: chaveIdempotencia
    });
  });

  router.patch('/partidas/:id/agendamento', async (req, res) => {
    const partidaId = lerUuid(req.params.id);
    if (!partidaId) return res.status(400).json({ mensagem: 'Partida inválida.' });
    const horario = validarTimestampCampeonato(req.body?.agendada_para, 'A data de agendamento');
    if (horario.erro || !horario.valor || Date.parse(horario.valor) <= Date.now()) {
      return res.status(400).json({ mensagem: horario.erro || 'A data de agendamento deve estar no futuro.' });
    }
    return executarRpc(req, res, 'agendar_partida', {
      p_partida_id: partidaId,
      p_agendada_para: horario.valor
    }, 'partida');
  });

  return router;
}

module.exports = { criarRotasPartidas, validarCorpoResultado, resultadoConfirmado };
