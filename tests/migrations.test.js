'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const raiz = path.resolve(__dirname, '..');
const inscricoes = fs.readFileSync(path.join(
  raiz,
  'database/migrations/20261120_proposta_inscricao_atomica_reinscricao.sql'
), 'utf8');
const partidas = fs.readFileSync(path.join(
  raiz,
  'database/migrations/20261120_proposta_partidas_resultados_ivi.sql'
), 'utf8');

test('preflight de reinscrição só troca a constraint UNIQUE conhecida e exata', () => {
  assert.match(inscricoes, /c\.conname\s*=\s*'inscricoes_campeonato_id_jogador_id_key'/i);
  assert.match(inscricoes, /c\.contype\s*=\s*'u'/i);
  assert.match(inscricoes, /v_constraint_attnums\s+is\s+distinct\s+from/i);
  assert.match(inscricoes, /v_constraints_exatas\s+<>\s*1/i);
  assert.match(inscricoes, /v_dependencias_fk\s*>\s*0/i);
  assert.match(inscricoes, /drop constraint inscricoes_campeonato_id_jogador_id_key/i);
  assert.doesNotMatch(inscricoes, /drop\s+constraint\s+%I/i);
  assert.doesNotMatch(inscricoes, /\bdrop\s+index\b/i);
});

test('preflight de reinscrição interrompe diante de índice standalone equivalente', () => {
  assert.match(inscricoes, /i\.indisunique/i);
  assert.match(inscricoes, /i\.indpred is null/i);
  assert.match(inscricoes, /i\.indexprs is null/i);
  assert.match(inscricoes, /i\.indnkeyatts\s*=\s*2/i);
  assert.match(inscricoes, /if v_indices_standalone > 0 then\s+raise exception/i);
  assert.match(inscricoes, /to_regclass\('public\.inscricoes_ativas_campeonato_jogador_uq'\)/i);
});

test('resultado de partidas respeita VARCHAR e não exige nem cria fonte JSONB', () => {
  assert.match(partidas, /\('partidas',\s*'resultado',\s*'string'\)/i);
  assert.match(partidas, /resultado text not null check\s*\(\s*resultado ~ '\^\[0-9\]/i);
  assert.match(partidas, /p_resultado text/i);
  assert.match(partidas, /resultado = p_resultado/i);
  assert.match(partidas, /resultado final permanece exclusivamente em partidas\.resultado/i);
  assert.doesNotMatch(partidas, /resultado\s+jsonb/i);
  assert.match(partidas, /resultado\s*=\s*v_resultado\.resultado/i);
});

test('relatos confirmados são removidos do staging e o histórico IVI referencia partidas', () => {
  assert.match(partidas, /delete from public\.partida_resultados where partida_id = p_partida_id/i);
  assert.match(partidas, /partida_id uuid not null references public\.partidas\(id\) on delete restrict/i);
  assert.match(partidas, /returns jsonb/i);
});

test('funções de resultados são SECURITY DEFINER com search_path vazio e EXECUTE restrito', () => {
  const funcoes = partidas.split(/create function public\./i).slice(1);
  const funcoesResultado = funcoes.filter((trecho) =>
    /^(submeter_resultado_partida|confirmar_resultado_partida|contestar_resultado_partida|agendar_partida)/i.test(trecho)
  );
  assert.equal(funcoesResultado.length, 4);
  for (const funcao of funcoesResultado) {
    assert.match(funcao, /security definer/i);
    assert.match(funcao, /set search_path = ''/i);
  }
  assert.match(partidas, /revoke all on function public\.submeter_resultado_partida\(uuid, uuid, text, uuid\) from public, anon/i);
  assert.match(partidas, /grant execute on function public\.confirmar_resultado_partida\(uuid, uuid\) to authenticated/i);
});
