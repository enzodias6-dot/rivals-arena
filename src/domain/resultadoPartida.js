'use strict';

class ErroResultadoPartida extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ErroResultadoPartida';
    this.code = code;
  }
}

function participar(partida, usuarioId) {
  return usuarioId === partida.jogador_1_id || usuarioId === partida.jogador_2_id;
}

function validarResultado(partida, autorId, vencedorId, resultado) {
  if (!partida || !partida.id) {
    throw new ErroResultadoPartida('partida_nao_encontrada', 'Partida não encontrada.');
  }
  if (partida.status === 'concluida' || partida.concluida_em) {
    throw new ErroResultadoPartida('partida_finalizada', 'Uma partida finalizada não pode ser alterada.');
  }
  if (!participar(partida, autorId)) {
    throw new ErroResultadoPartida('nao_participante', 'Somente um participante pode relatar o resultado.');
  }
  if (vencedorId !== partida.jogador_1_id && vencedorId !== partida.jogador_2_id) {
    throw new ErroResultadoPartida('vencedor_invalido', 'O vencedor deve ser um participante da partida.');
  }
  if (typeof resultado !== 'string' || resultado.length > 63 ||
      !/^\d{1,31}-\d{1,31}$/.test(resultado)) {
    throw new ErroResultadoPartida('resultado_invalido', 'O placar deve usar o formato numérico, por exemplo 2-1.');
  }
  const [pontosJogador1, pontosJogador2] = resultado.split('-').map(BigInt);
  if (pontosJogador1 === pontosJogador2 ||
      vencedorId !== (pontosJogador1 > pontosJogador2 ? partida.jogador_1_id : partida.jogador_2_id)) {
    throw new ErroResultadoPartida('resultado_invalido', 'O placar deve corresponder ao vencedor informado.');
  }
}

function criarRelatoResultado({ partida, autorId, vencedorId, resultado }) {
  validarResultado(partida, autorId, vencedorId, resultado);
  return Object.freeze({
    partidaId: partida.id,
    reportadoPor: autorId,
    vencedorId,
    resultado,
    status: 'aguardando_confirmacao'
  });
}

function confirmarRelatoResultado({ partida, relato, confirmadorId }) {
  if (!relato || relato.partidaId !== partida?.id) {
    throw new ErroResultadoPartida('relato_nao_encontrado', 'Relato de resultado não encontrado.');
  }
  if (partida.status === 'concluida' || partida.concluida_em ||
      relato.status !== 'aguardando_confirmacao') {
    throw new ErroResultadoPartida('partida_finalizada', 'O resultado não está aguardando confirmação.');
  }
  if (!participar(partida, confirmadorId) || confirmadorId === relato.reportadoPor) {
    throw new ErroResultadoPartida('nao_adversario', 'Somente o outro participante pode confirmar o resultado.');
  }
  return Object.freeze({ ...relato, confirmadoPor: confirmadorId, status: 'confirmada' });
}

function contestarRelatoResultado({ partida, relato, contestadorId, vencedorId, resultado }) {
  if (!relato || relato.partidaId !== partida?.id ||
      relato.status !== 'aguardando_confirmacao') {
    throw new ErroResultadoPartida('relato_nao_encontrado', 'Não há resultado pendente para contestar.');
  }
  if (partida.status === 'concluida' || partida.concluida_em) {
    throw new ErroResultadoPartida('partida_finalizada', 'Uma partida finalizada não pode ser contestada.');
  }
  if (!participar(partida, contestadorId) || contestadorId === relato.reportadoPor) {
    throw new ErroResultadoPartida('nao_adversario', 'Somente o outro participante pode contestar o resultado.');
  }
  validarResultado(partida, contestadorId, vencedorId, resultado);
  return Object.freeze({
    ...relato,
    contestadoPor: contestadorId,
    resultadoContestado: resultado,
    vencedorContestadoId: vencedorId,
    status: 'disputada'
  });
}

module.exports = {
  ErroResultadoPartida,
  criarRelatoResultado,
  confirmarRelatoResultado,
  contestarRelatoResultado
};
