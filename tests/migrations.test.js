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

test('reinscrição mantém a UNIQUE global e reutiliza a mesma linha cancelada', () => {
  assert.match(inscricoes, /inscricoes_campeonato_id_jogador_id_key/i);
  assert.match(inscricoes, /contype = 'u'/i);
  assert.match(inscricoes, /old\.status = 'cancelada' and new\.status = 'pendente'/i);
  assert.match(inscricoes, /registration_identity_immutable/i);
  assert.match(inscricoes, /new\.id is distinct from old\.id/i);
  assert.match(inscricoes, /new\.inscrito_em is distinct from old\.inscrito_em/i);
  assert.match(inscricoes, /new\.inscrito_em := now\(\)/i);
  assert.match(inscricoes, /pg_advisory_xact_lock/i);
  assert.doesNotMatch(inscricoes, /drop\s+constraint/i);
  assert.doesNotMatch(inscricoes, /drop\s+index/i);
  assert.doesNotMatch(inscricoes, /create unique index/i);
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

test('empates exigem confirmação dos dois jogadores e não inventam pontuação', () => {
  assert.match(partidas, /v_pontos_jogador_1 = v_pontos_jogador_2 and p_vencedor_id is not null/i);
  assert.match(partidas, /insert into public\.partida_empates/i);
  assert.match(partidas, /v_resultado\.vencedor_id is null/i);
  assert.match(partidas, /v_resultado\.vencedor_id is not distinct from p_vencedor_id/i);
  assert.doesNotMatch(partidas, /draw_not_supported/i);
  assert.doesNotMatch(partidas, /set pontos\s*=\s*coalesce\(pontos/i);
});

test('papel admin não pode ser alterado diretamente por usuários autenticados', () => {
  assert.match(partidas, /revoke update on public\.usuarios from public, anon, authenticated/i);
  assert.match(partidas, /grant update \(nome\) on public\.usuarios to authenticated/i);
  assert.match(partidas, /select u\.perfil into v_perfil/i);
  assert.match(partidas, /v_perfil is distinct from 'admin'/i);
});

test('funções de resultados são SECURITY DEFINER com search_path vazio e EXECUTE restrito', () => {
  const funcoes = partidas.split(/create function public\./i).slice(1);
  const funcoesResultado = funcoes.filter((trecho) =>
    /^(submeter_resultado_partida|confirmar_resultado_partida|contestar_resultado_partida|resolver_resultado_partida|agendar_partida)/i.test(trecho)
  );
  assert.equal(funcoesResultado.length, 5);
  for (const funcao of funcoesResultado) {
    assert.match(funcao, /security definer/i);
    assert.match(funcao, /set search_path = ''/i);
  }
  assert.match(partidas, /revoke all on function public\.submeter_resultado_partida\(uuid, uuid, text, uuid\) from public, anon/i);
  assert.match(partidas, /grant execute on function public\.confirmar_resultado_partida\(uuid, uuid\) to authenticated/i);
  assert.match(partidas, /grant execute on function public\.resolver_resultado_partida\(uuid, uuid, text, text, uuid\) to authenticated/i);
  assert.match(partidas, /v_perfil is distinct from 'admin'/i);
  assert.match(partidas, /'resolvido_admin'/i);
});
