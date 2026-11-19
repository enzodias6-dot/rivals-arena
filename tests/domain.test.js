'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { PARAMETROS_ELO_PROPOSTOS, calcularAtualizacaoElo } = require('../src/domain/ivi');
const {
  criarRelatoResultado,
  confirmarRelatoResultado,
  contestarRelatoResultado
} = require('../src/domain/resultadoPartida');

test('Elo proposto inicializa e atualiza jogadores de rating igual simetricamente', () => {
  assert.deepEqual(PARAMETROS_ELO_PROPOSTOS, {
    ratingInicial: 1000,
    fatorK: 32,
    escala: 400,
    versao: 'elo-v1-proposta'
  });

  const atualizacao = calcularAtualizacaoElo({
    ratingJogador1: 1000,
    ratingJogador2: 1000,
    vencedor: 1
  });

  assert.equal(atualizacao.ratingEsperadoJogador1, 0.5);
  assert.equal(atualizacao.variacaoJogador1, 16);
  assert.equal(atualizacao.variacaoJogador2, -16);
  assert.equal(atualizacao.novoRatingJogador1, 1016);
  assert.equal(atualizacao.novoRatingJogador2, 984);
});

test('Elo proposto aumenta mais ao vencer adversário forte e reduz menos ao perder para ele', () => {
  const vitoria = calcularAtualizacaoElo({
    ratingJogador1: 1000,
    ratingJogador2: 1200,
    vencedor: 1
  });
  const derrota = calcularAtualizacaoElo({
    ratingJogador1: 1000,
    ratingJogador2: 1200,
    vencedor: 2
  });

  assert.ok(Math.abs(vitoria.variacaoJogador1 - 24.3119) < 0.001);
  assert.ok(Math.abs(vitoria.variacaoJogador2 + vitoria.variacaoJogador1) < 1e-10);
  assert.ok(Math.abs(derrota.variacaoJogador1 + 7.6881) < 0.001);
  assert.ok(Math.abs(derrota.variacaoJogador2 + derrota.variacaoJogador1) < 1e-10);
});

test('Elo aceita parâmetros configuráveis e rejeita ratings ou vencedores inválidos', () => {
  const configurado = calcularAtualizacaoElo({
    ratingJogador1: 1000,
    ratingJogador2: 1000,
    vencedor: 2,
    fatorK: 16,
    escala: 200
  });
  assert.equal(configurado.variacaoJogador1, -8);
  assert.equal(configurado.variacaoJogador2, 8);

  assert.throws(() => calcularAtualizacaoElo({
    ratingJogador1: Number.NaN, ratingJogador2: 1000, vencedor: 1
  }), /ratings/);
  assert.throws(() => calcularAtualizacaoElo({
    ratingJogador1: 1000, ratingJogador2: 1000, vencedor: 3
  }), /vencedor/);
});

test('relato de resultado exige participante autenticado e vencedor participante', () => {
  const partida = {
    id: 'm1',
    jogador_1_id: 'p1',
    jogador_2_id: 'p2',
    status: 'em_andamento'
  };
  const relato = criarRelatoResultado({
    partida,
    autorId: 'p1',
    vencedorId: 'p1',
    resultado: '2-1'
  });
  assert.equal(relato.status, 'aguardando_confirmacao');
  assert.throws(() => criarRelatoResultado({
    partida,
    autorId: 'p3',
    vencedorId: 'p1',
    resultado: '2-1'
  }), /participante/);
  assert.throws(() => criarRelatoResultado({
    partida,
    autorId: 'p1',
    vencedorId: 'p3',
    resultado: '2-1'
  }), /vencedor/);
  assert.throws(() => criarRelatoResultado({
    partida, autorId: 'p1', vencedorId: 'p1', resultado: '1-2'
  }), /corresponder ao vencedor/);
});

test('somente o adversário pode confirmar; resultado final não pode ser alterado', () => {
  const partida = { id: 'm1', jogador_1_id: 'p1', jogador_2_id: 'p2', status: 'em_andamento' };
  const relato = criarRelatoResultado({
    partida, autorId: 'p1', vencedorId: 'p1', resultado: '2-1'
  });
  assert.throws(() => confirmarRelatoResultado({
    partida, relato, confirmadorId: 'p1'
  }), /outro participante/);
  assert.equal(confirmarRelatoResultado({
    partida, relato, confirmadorId: 'p2'
  }).status, 'confirmada');
  assert.throws(() => criarRelatoResultado({
    partida: { ...partida, status: 'concluida' },
    autorId: 'p1',
    vencedorId: 'p1',
    resultado: '2-1'
  }), /finalizada/);
});

test('relato divergente fica disputado e não é confirmado automaticamente', () => {
  const partida = { id: 'm1', jogador_1_id: 'p1', jogador_2_id: 'p2', status: 'em_andamento' };
  const relato = criarRelatoResultado({
    partida, autorId: 'p1', vencedorId: 'p1', resultado: '2-1'
  });
  const contestacao = contestarRelatoResultado({
    partida,
    relato,
    contestadorId: 'p2',
    vencedorId: 'p2',
    resultado: '1-2'
  });
  assert.equal(contestacao.status, 'disputada');
  assert.equal(contestacao.vencedorContestadoId, 'p2');
  assert.throws(() => contestarRelatoResultado({
    partida, relato, contestadorId: 'p3', vencedorId: 'p1', resultado: '2-1'
  }), /outro participante/);
});
