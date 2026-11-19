'use strict';

const PARAMETROS_ELO_PROPOSTOS = Object.freeze({
  ratingInicial: 1000,
  fatorK: 32,
  escala: 400,
  versao: 'elo-v1-proposta'
});

function expectativa(rating, adversario, escala) {
  const expoente = (adversario - rating) / escala;
  return expoente >= 0
    ? 1 / (1 + (10 ** expoente))
    : 1 - (1 / (1 + (10 ** -expoente)));
}

function calcularAtualizacaoElo({
  ratingJogador1,
  ratingJogador2,
  vencedor,
  fatorK = PARAMETROS_ELO_PROPOSTOS.fatorK,
  escala = PARAMETROS_ELO_PROPOSTOS.escala
}) {
  if (!Number.isFinite(ratingJogador1) || ratingJogador1 < 0 ||
      !Number.isFinite(ratingJogador2) || ratingJogador2 < 0) {
    throw new TypeError('Os ratings devem ser números finitos não negativos.');
  }
  if (![1, 2].includes(vencedor)) {
    throw new TypeError('O vencedor deve identificar o jogador 1 ou 2.');
  }
  if (!Number.isFinite(fatorK) || fatorK <= 0 ||
      !Number.isFinite(escala) || escala <= 0) {
    throw new TypeError('Os parâmetros do Elo devem ser números finitos positivos.');
  }

  const esperado1 = expectativa(ratingJogador1, ratingJogador2, escala);
  const esperado2 = 1 - esperado1;
  const pontuacao1 = vencedor === 1 ? 1 : 0;
  const pontuacao2 = 1 - pontuacao1;
  const variacao1 = fatorK * (pontuacao1 - esperado1);
  const variacao2 = fatorK * (pontuacao2 - esperado2);

  return Object.freeze({
    ratingEsperadoJogador1: esperado1,
    ratingEsperadoJogador2: esperado2,
    variacaoJogador1: variacao1,
    variacaoJogador2: variacao2,
    novoRatingJogador1: ratingJogador1 + variacao1,
    novoRatingJogador2: ratingJogador2 + variacao2
  });
}

module.exports = { PARAMETROS_ELO_PROPOSTOS, calcularAtualizacaoElo };
