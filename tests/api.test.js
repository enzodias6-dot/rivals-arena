'use strict';

require('dotenv').config = () => ({ parsed: {} });

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { carregarConfig, validarConfigSupabase } = require('../src/config/env');
const { criarClienteSupabase } = require('../src/config/supabase');
const { criarApp } = require('../src/app');
const { criarSupabaseFake } = require('./helpers/supabaseFake');

const SUPABASE_URL = 'https://rivals-arena.test.supabase.co';
const CHAVE_PUBLICA = 'sb_publishable_fake-key-for-automated-tests';
const CHAVE_ANON_LEGADA = 'eyJhbGciOiJub25lIn0.eyJyb2xlIjoiYW5vbiJ9.signature';
const UUID = () => require('node:crypto').randomUUID();

async function criarAmbiente({
confirmacaoEmailObrigatoria = false,
producao = false,
limites,
limiteMaximoLinhas,
pastaPublica
} = {}) {
const supabase = criarSupabaseFake({ confirmacaoEmailObrigatoria, limiteMaximoLinhas });
  const config = {
    ...carregarConfig({}),
  ...(pastaPublica ? { pastaPublica } : {}),
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: CHAVE_PUBLICA,
    producao,
    confiarProxy: false,
    limites: {
      login: { janelaMs: 60000, max: 1000 },
      cadastro: { janelaMs: 60000, max: 1000 },
      desafios: { janelaMs: 60000, max: 1000 },
      ...limites
    }
  };
  const app = criarApp({ config, criarCliente: supabase.criarCliente });
  const servidor = await new Promise((resolver) => {
    const instancia = app.listen(0, '127.0.0.1', () => resolver(instancia));
  });
  const base = `http://127.0.0.1:${servidor.address().port}`;

  async function chamar(metodo, caminho, { corpo, cookie, headers = {}, bruto } = {}) {
    const resposta = await fetch(base + caminho, {
      method: metodo,
      redirect: 'manual',
      headers: {
        ...(corpo !== undefined || bruto !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers
      },
      body: bruto !== undefined ? bruto : corpo !== undefined ? JSON.stringify(corpo) : undefined
    });
    const texto = await resposta.text();
    let json = null;
    try { json = JSON.parse(texto); } catch (erro) { /* resposta pode ser HTML */ }
    return {
      status: resposta.status,
      headers: resposta.headers,
      texto,
      json,
      setCookie: typeof resposta.headers.getSetCookie === 'function'
        ? resposta.headers.getSetCookie()
        : [resposta.headers.get('set-cookie')].filter(Boolean)
    };
  }

  async function cadastrar(nome, email = `${nome.toLowerCase().replace(/\s/g, '')}@teste.com`, senha = 'senha-forte-123') {
    const resposta = await chamar('POST', '/api/usuarios', {
      corpo: { nome, email, senha }
    });
    assert.equal(resposta.status, 201, `cadastro de ${nome} falhou: ${resposta.texto}`);
    return { ...resposta.json.usuario, email: email.toLowerCase(), senha };
  }

  async function entrar(email, senha = 'senha-forte-123') {
    const resposta = await chamar('POST', '/api/login', { corpo: { email, senha } });
    assert.equal(resposta.status, 200, `login de ${email} falhou: ${resposta.texto}`);
    return {
      cookie: resposta.setCookie.map((valor) => valor.split(';')[0]).find((valor) => valor.startsWith('ra_session=')),
      resposta
    };
  }

  async function novoJogador(nome, email) {
    const usuario = await cadastrar(nome, email);
    const { cookie } = await entrar(usuario.email, usuario.senha);
    return { ...usuario, cookie };
  }

  const encerrar = () => new Promise((resolver) => servidor.close(resolver));
  return { chamar, cadastrar, entrar, novoJogador, encerrar, supabase, config, base };
}

test('configuração Supabase aceita apenas URL e chave pública', () => {
  assert.match(validarConfigSupabase('', CHAVE_PUBLICA), /SUPABASE_URL/);
  assert.match(validarConfigSupabase(SUPABASE_URL, ''), /SUPABASE_ANON_KEY/);
  assert.match(validarConfigSupabase('http://servidor-remoto.test', CHAVE_PUBLICA), /HTTPS/);
  assert.match(validarConfigSupabase(SUPABASE_URL, 'sb_secret-nao-usar'), /privada/);
  assert.match(validarConfigSupabase(SUPABASE_URL, 'eyJhbGciOiJub25lIn0.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature'), /service_role/);
  assert.match(validarConfigSupabase(SUPABASE_URL, 'eyJhbGciOiJub25lIn0.eyJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.signature'), /anon\/publicável/);
  assert.match(validarConfigSupabase(SUPABASE_URL, 'chave-invalida'), /sb_publishable_/);
  assert.match(validarConfigSupabase(SUPABASE_URL, 'sb_publishable_invalida.'), /incompleta ou inválida/);
  assert.equal(validarConfigSupabase(SUPABASE_URL, CHAVE_PUBLICA), null);
  assert.equal(validarConfigSupabase(SUPABASE_URL, CHAVE_ANON_LEGADA), null);
  assert.equal(carregarConfig({
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: CHAVE_PUBLICA
  }).supabaseAnonKey, CHAVE_PUBLICA);
  assert.doesNotThrow(() => criarClienteSupabase({
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: CHAVE_PUBLICA
  }));
});

test('páginas e arquivos estáticos continuam protegidos e preservados', async (t) => {
  const amb = await criarAmbiente();
  t.after(amb.encerrar);

  for (const rota of ['/', '/central.html', '/pages/ranking.html', '/pages/perfil.html', '/qualquer-coisa']) {
    const resposta = await amb.chamar('GET', rota);
    assert.equal(resposta.status, 302, rota);
    assert.equal(resposta.headers.get('location'), '/acesso.html');
  }

  for (const rota of ['/acesso.html', '/css/styles.css', '/css/campeonatos.css', '/js/comum.js', '/js/auth.js', '/img/logo.png']) {
    assert.equal((await amb.chamar('GET', rota)).status, 200, rota);
  }

  const inexistente = await amb.chamar('GET', '/js/nao-existe.js');
  assert.equal(inexistente.status, 404);
  assert.match(inexistente.headers.get('content-type'), /text\/plain/);

  const favicon = await amb.chamar('GET', '/favicon.ico');
  assert.equal(favicon.status, 301);
  assert.equal(favicon.headers.get('location'), '/img/logo.png');

  const publico = await amb.chamar('GET', '/acesso.html');
  assert.match(publico.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(publico.headers.get('x-frame-options'), 'DENY');

  const jogador = await amb.novoJogador('Ja Logado');
  const acesso = await amb.chamar('GET', '/acesso.html', { cookie: jogador.cookie });
  assert.equal(acesso.status, 302);
  assert.equal(acesso.headers.get('location'), '/');

  for (const rota of [
    '/', '/pages/campeonatos.html', '/pages/ranking.html',
    '/pages/perfil.html', '/pages/arsenal.html', '/pages/times.html'
  ]) {
    const protegida = await amb.chamar('GET', rota, { cookie: jogador.cookie });
    assert.equal(protegida.status, 200, rota);
    assert.equal(protegida.headers.get('cache-control'), 'no-store');
  }
});

test('cadastro com Auth não grava senha no perfil e respeita confirmação por email', async (t) => {
  const amb = await criarAmbiente({ confirmacaoEmailObrigatoria: true });
  t.after(amb.encerrar);

  const invalido = await amb.chamar('POST', '/api/usuarios', {
    corpo: { nome: 'A', email: 'email-invalido', senha: 'curta' }
  });
  assert.equal(invalido.status, 400);

  const cadastrado = await amb.chamar('POST', '/api/usuarios', {
    corpo: { nome: '  Maria   Silva ', email: 'Maria@Teste.com ', senha: 'senha-forte-123' }
  });
  assert.equal(cadastrado.status, 201);
  assert.equal(cadastrado.json.usuario.nome, 'Maria Silva');
  assert.equal(cadastrado.json.usuario.email, 'maria@teste.com');
  assert.equal(cadastrado.json.sessaoIniciada, false);
  assert.equal(cadastrado.json.confirmacaoEmailPendente, true);
  assert.equal(cadastrado.setCookie.length, 0);

  const perfil = amb.supabase.tabelas.usuarios[0];
  assert.equal(perfil.id, cadastrado.json.usuario.id);
  assert.equal(perfil.nome, 'Maria Silva');
  assert.equal(Object.hasOwn(perfil, 'senha'), false);

  const duplicado = await amb.chamar('POST', '/api/usuarios', {
    corpo: { nome: 'Outra Maria', email: 'MARIA@teste.com', senha: 'senha-forte-123' }
  });
  assert.equal(duplicado.status, 409);

  const antesDaConfirmacao = await amb.chamar('POST', '/api/login', {
    corpo: { email: 'maria@teste.com', senha: 'senha-forte-123' }
  });
  assert.equal(antesDaConfirmacao.status, 403);
  assert.match(antesDaConfirmacao.json.mensagem, /confirme seu email/i);

  amb.supabase.confirmarEmail('maria@teste.com');
  const depoisDaConfirmacao = await amb.entrar('maria@teste.com');
  assert.ok(depoisDaConfirmacao.cookie);
});

test('cadastro com confirmação desabilitada devolve sessão para o cookie HttpOnly', async (t) => {
  const amb = await criarAmbiente();
  t.after(amb.encerrar);
  const resposta = await amb.chamar('POST', '/api/usuarios', {
    corpo: { nome: 'Sessao Cadastro', email: 'sessao@teste.com', senha: 'senha-forte-123' }
  });

  assert.equal(resposta.status, 201);
  assert.equal(resposta.json.sessaoIniciada, true);
  assert.match(resposta.setCookie.find((valor) => valor.startsWith('ra_session=')), /HttpOnly/i);
});

test('login, cookies HttpOnly, renovação de sessão, logout e proteção CSRF', async (t) => {
  const amb = await criarAmbiente();
  t.after(amb.encerrar);
  const usuario = await amb.cadastrar('Sessao Teste');

  const senhaErrada = await amb.chamar('POST', '/api/login', {
    corpo: { email: usuario.email, senha: 'senha-errada' }
  });
  const emailInexistente = await amb.chamar('POST', '/api/login', {
    corpo: { email: 'ninguem@teste.com', senha: 'senha-errada' }
  });
  assert.equal(senhaErrada.status, 401);
  assert.equal(senhaErrada.json.mensagem, emailInexistente.json.mensagem);
  assert.equal((await amb.chamar('POST', '/api/login', { corpo: {} })).status, 400);

  const { cookie, resposta } = await amb.entrar(usuario.email.toUpperCase());
  const setCookie = resposta.setCookie.find((valor) => valor.startsWith('ra_session='));
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Strict/i);
  assert.equal(resposta.json.usuario.id, usuario.id);

  const credencialJson = decodeURIComponent(cookie.slice('ra_session='.length));
  const credencial = JSON.parse(credencialJson);
  assert.ok(credencial.access_token);
  assert.ok(credencial.refresh_token);
  assert.equal((await amb.chamar('GET', '/api/perfil', { cookie })).status, 200);
  assert.equal((await amb.chamar('GET', '/api/perfil')).status, 401);
  const cookieInvalido = await amb.chamar('GET', '/', { cookie: 'ra_session=%E0%A4%A' });
  assert.equal(cookieInvalido.status, 302);
  assert.ok(cookieInvalido.setCookie.some((valor) => valor.startsWith('ra_session=;')));

  amb.supabase.tokensExpirados.add(credencial.access_token);
  const renovada = await amb.chamar('GET', '/api/perfil', { cookie });
  assert.equal(renovada.status, 200);
  const novoCookie = renovada.setCookie.find((valor) => valor.startsWith('ra_session='));
  assert.ok(novoCookie, 'sessão renovada deve atualizar o cookie HttpOnly');
  const novoPar = novoCookie.split(';')[0];
  assert.notEqual(novoPar, cookie);
  assert.equal((await amb.chamar('GET', '/api/perfil', { cookie: novoPar })).status, 200);
  const outraSessao = await amb.entrar(usuario.email);

  const origemBloqueada = await amb.chamar('POST', '/api/logout', {
    cookie: novoPar,
    headers: { Origin: 'https://site-malicioso.example' }
  });
  assert.equal(origemBloqueada.status, 403);

  const logout = await amb.chamar('POST', '/api/logout', { cookie: novoPar });
  assert.equal(logout.status, 200);
  assert.equal(logout.json.mensagem, 'Sessão removida deste navegador.');
  assert.match(logout.setCookie.find((valor) => valor.startsWith('ra_session=')), /Expires=Thu, 01 Jan 1970/i);
  assert.deepEqual(amb.supabase.escoposSignOut, ['local']);
  assert.equal((await amb.chamar('GET', '/api/perfil', { cookie: novoPar })).status, 401);
  assert.equal((await amb.chamar('GET', '/api/perfil', { cookie: outraSessao.cookie })).status, 200);
});

test('logout limpa o cookie em erros temporários de setSession e signOut sem mascará-los', async (t) => {
  const amb = await criarAmbiente();
  t.after(amb.encerrar);
  const jogador = await amb.novoJogador('Logout Instável');

  amb.supabase.falharAuth('setSession', {
    status: 503,
    code: 'service_unavailable',
    message: 'Falha temporária de setSession'
  });
  const erroSetSession = await amb.chamar('POST', '/api/logout', { cookie: jogador.cookie });
  assert.equal(erroSetSession.status, 503);
  assert.ok(erroSetSession.setCookie.some((valor) => valor.startsWith('ra_session=;')));
  assert.doesNotMatch(erroSetSession.texto, /sessão inválida/i);

  amb.supabase.falharAuth('setSession', null);
  amb.supabase.falharAuth('signOut', {
    status: 429,
    code: 'over_request_rate_limit',
    message: 'Falha temporária de signOut'
  });
  const erroSignOut = await amb.chamar('POST', '/api/logout', { cookie: jogador.cookie });
  assert.equal(erroSignOut.status, 429);
  assert.ok(erroSignOut.setCookie.some((valor) => valor.startsWith('ra_session=;')));
  assert.doesNotMatch(erroSignOut.texto, /sessão inválida/i);

  amb.supabase.falharAuth('signOut', {
    status: 400,
    code: 'unexpected_auth_error',
    message: 'Falha inesperada de signOut'
  });
  const erroSignOutInesperado = await amb.chamar('POST', '/api/logout', { cookie: jogador.cookie });
  assert.equal(erroSignOutInesperado.status, 500);
  assert.ok(erroSignOutInesperado.setCookie.some((valor) => valor.startsWith('ra_session=;')));
  assert.doesNotMatch(erroSignOutInesperado.texto, /Sessão removida/);
});

test('logout com sessão inválida encerra no navegador sem reportar revogação remota', async (t) => {
  const amb = await criarAmbiente();
  t.after(amb.encerrar);
  const jogador = await amb.novoJogador('Logout Inválido');
  amb.supabase.falharAuth('setSession', {
    status: 400,
    code: 'refresh_token_not_found',
    message: 'Refresh token not found'
  });

  const logout = await amb.chamar('POST', '/api/logout', { cookie: jogador.cookie });
  assert.equal(logout.status, 200);
  assert.equal(logout.json.mensagem, 'Sessão removida deste navegador.');
  assert.ok(logout.setCookie.some((valor) => valor.startsWith('ra_session=;')));
  assert.deepEqual(amb.supabase.escoposSignOut, []);
});

test('cookie de sessão usa Secure em produção e falhas no limite de login continuam bloqueadas', async (t) => {
  const amb = await criarAmbiente({
    producao: true,
    limites: { login: { janelaMs: 60000, max: 2 } }
  });
  t.after(amb.encerrar);
  const usuario = await amb.cadastrar('Alvo');

  const login = await amb.chamar('POST', '/api/login', {
    corpo: { email: usuario.email, senha: usuario.senha }
  });
  const cookieSessao = login.setCookie.find((valor) => valor.startsWith('ra_session='));
  assert.match(cookieSessao, /Secure/i);
  assert.match(cookieSessao, /HttpOnly/i);
  assert.match(cookieSessao, /SameSite=Strict/i);

  const primeiroErro = await amb.chamar('POST', '/api/login', {
    corpo: { email: usuario.email, senha: 'senha-errada' }
  });
  assert.equal(primeiroErro.status, 401);
  const segundoErro = await amb.chamar('POST', '/api/login', {
    corpo: { email: usuario.email, senha: 'senha-errada' }
  });
  assert.equal(segundoErro.status, 401);
  const bloqueado = await amb.chamar('POST', '/api/login', {
    corpo: { email: usuario.email, senha: usuario.senha }
  });
  assert.equal(bloqueado.status, 429);

  const logout = await amb.chamar('POST', '/api/logout', {
    cookie: cookieSessao.split(';')[0]
  });
  const cookieRemovido = logout.setCookie.find((valor) => valor.startsWith('ra_session=;'));
  assert.ok(cookieRemovido);
  assert.match(cookieRemovido, /Secure/i);
  assert.match(cookieRemovido, /HttpOnly/i);
  assert.match(cookieRemovido, /SameSite=Strict/i);
});

test('requisições paralelas compartilham a renovação de um refresh token', async (t) => {
  const amb = await criarAmbiente();
  t.after(amb.encerrar);
  const jogador = await amb.novoJogador('Renovacao Paralela');
  const credencial = JSON.parse(decodeURIComponent(jogador.cookie.slice('ra_session='.length)));
  amb.supabase.tokensExpirados.add(credencial.access_token);
  const renovacoesAntes = amb.supabase.quantidadeRenovacoes;

  const respostas = await Promise.all([
    amb.chamar('GET', '/api/perfil', { cookie: jogador.cookie }),
    amb.chamar('GET', '/api/ranking', { cookie: jogador.cookie }),
    amb.chamar('GET', '/api/torneios', { cookie: jogador.cookie })
  ]);
  assert.deepEqual(
    respostas.map((resposta) => resposta.status),
    [200, 200, 200],
    JSON.stringify({ renovacoes: amb.supabase.quantidadeRenovacoes - renovacoesAntes, mensagens: respostas.map((resposta) => resposta.json) })
  );
  assert.equal(amb.supabase.quantidadeRenovacoes - renovacoesAntes, 1);
  assert.ok(respostas.every((resposta) =>
    resposta.setCookie.some((valor) => valor.startsWith('ra_session='))
  ));
});

test('rate limit temporário ao renovar preserva cookie e não encerra a sessão', async (t) => {
  const amb = await criarAmbiente();
  t.after(amb.encerrar);
  const jogador = await amb.novoJogador('Renovacao Limitada');
  const credencial = JSON.parse(decodeURIComponent(jogador.cookie.slice('ra_session='.length)));
  amb.supabase.tokensExpirados.add(credencial.access_token);
  amb.supabase.falharAuth('refreshSession', {
    status: 429,
    code: 'over_request_rate_limit',
    message: 'Detalhe interno do provedor'
  });

  const resposta = await amb.chamar('GET', '/api/perfil', { cookie: jogador.cookie });
  assert.equal(resposta.status, 429);
  assert.doesNotMatch(resposta.texto, /Detalhe interno/);
  assert.equal(resposta.setCookie.some((valor) => valor.startsWith('ra_session=;')), false);
});

test('perfil e ranking usam a view pública de ranking e mantêm a ordenação esperada', async (t) => {
  const amb = await criarAmbiente();
  t.after(amb.encerrar);
  const ana = await amb.novoJogador('Ana');
  const bia = await amb.novoJogador('Bia');
  const caio = await amb.novoJogador('Caio');
  Object.assign(amb.supabase.tabelas.usuarios.find((item) => item.id === ana.id), { pontos: 500, vitorias: 5, derrotas: 1 });
  Object.assign(amb.supabase.tabelas.usuarios.find((item) => item.id === bia.id), { pontos: 500, vitorias: 7, derrotas: 2 });
  Object.assign(amb.supabase.tabelas.usuarios.find((item) => item.id === caio.id), { pontos: 900, vitorias: 9, derrotas: 0 });

  const ranking = await amb.chamar('GET', '/api/ranking', { cookie: ana.cookie });
  assert.equal(ranking.status, 200);
  assert.deepEqual(ranking.json.ranking.map((item) => item.nome), ['Caio', 'Bia', 'Ana']);
  assert.deepEqual(ranking.json.ranking.map((item) => item.id), [caio.id, bia.id, ana.id]);
  assert.deepEqual(ranking.json.ranking.map((item) => item.posicao), [1, 2, 3]);
  assert.deepEqual(Object.keys(ranking.json.ranking[0]).sort(), [
    'derrotas', 'id', 'nome', 'pontos', 'posicao', 'vitorias'
  ]);

  const perfil = await amb.chamar('GET', '/api/perfil', { cookie: ana.cookie });
  assert.equal(perfil.status, 200);
  assert.equal(perfil.json.usuario.posicao, 3);
  assert.equal(perfil.json.usuario.nome, 'Ana');
  assert.equal(perfil.json.usuario.email, ana.email);
  assert.equal(perfil.json.usuario.perfil, 'jogador');
  assert.equal(perfil.json.usuario.nivel, 1);
  assert.equal(Object.hasOwn(perfil.json.usuario, 'senha'), false);
});

test('perfil inexistente retorna 404 sem encerrar a sessão autenticada', async (t) => {
  const amb = await criarAmbiente();
  t.after(amb.encerrar);
  const jogador = await amb.novoJogador('Perfil Ausente');
  const indice = amb.supabase.tabelas.usuarios.findIndex((item) => item.id === jogador.id);
  amb.supabase.tabelas.usuarios.splice(indice, 1);

  const perfil = await amb.chamar('GET', '/api/perfil', { cookie: jogador.cookie });

  assert.equal(perfil.status, 404);
  assert.match(perfil.json.mensagem, /perfil.*sessão continua ativa/i);
  assert.equal(perfil.setCookie.some((valor) => valor.startsWith('ra_session=;')), false);

  const ranking = await amb.chamar('GET', '/api/ranking', { cookie: jogador.cookie });
  assert.equal(ranking.status, 200);
});

test('PATCH de perfil altera somente o nome do jogador autenticado', async (t) => {
  const amb = await criarAmbiente();
  t.after(amb.encerrar);
  const jogador = await amb.novoJogador('Nome Original');
  const outro = await amb.novoJogador('Outro Jogador');
  const perfilAntes = { ...amb.supabase.tabelas.usuarios.find((item) => item.id === jogador.id) };
  const outroAntes = { ...amb.supabase.tabelas.usuarios.find((item) => item.id === outro.id) };

  const resposta = await amb.chamar('PATCH', '/api/perfil', {
    cookie: jogador.cookie,
    corpo: { nome: '  Novo   Nome  ' }
  });

  assert.equal(resposta.status, 200);
  assert.deepEqual(resposta.json.usuario, { id: jogador.id, nome: 'Novo Nome' });

  const perfilDepois = amb.supabase.tabelas.usuarios.find((item) => item.id === jogador.id);
  assert.equal(perfilDepois.nome, 'Novo Nome');
  for (const campo of ['id', 'email', 'perfil', 'nivel', 'pontos', 'vitorias', 'derrotas']) {
    assert.equal(perfilDepois[campo], perfilAntes[campo], `campo protegido ${campo} deve permanecer inalterado`);
  }
  assert.deepEqual(amb.supabase.tabelas.usuarios.find((item) => item.id === outro.id), outroAntes);
});

test('PATCH de perfil rejeita nomes inválidos e campos adicionais sem gravar alterações', async (t) => {
  const amb = await criarAmbiente();
  t.after(amb.encerrar);
  const jogador = await amb.novoJogador('Nome Original');
  const perfil = amb.supabase.tabelas.usuarios.find((item) => item.id === jogador.id);
  const nomeOriginal = perfil.nome;
  const invalidos = ['', 'A', 'x'.repeat(81), 42, null];

  for (const nome of invalidos) {
    const resposta = await amb.chamar('PATCH', '/api/perfil', {
      cookie: jogador.cookie,
      corpo: { nome }
    });
    assert.equal(resposta.status, 400);
    assert.equal(perfil.nome, nomeOriginal);
  }

  const camposProtegidos = await amb.chamar('PATCH', '/api/perfil', {
    cookie: jogador.cookie,
    corpo: {
      nome: 'Nome não permitido',
      id: UUID(),
      email: 'novo@example.com',
      senha: 'senha-nova',
      perfil: 'administrador',
      nivel: 99,
      pontos: 9999,
      vitorias: 99,
      derrotas: 0
    }
  });
  assert.equal(camposProtegidos.status, 400);
  assert.equal(perfil.nome, nomeOriginal);
  assert.equal(perfil.email, jogador.email);
  assert.equal(perfil.perfil, 'jogador');
  assert.equal(perfil.nivel, 1);
  assert.equal(perfil.pontos, 0);
  assert.equal(perfil.vitorias, 0);
  assert.equal(perfil.derrotas, 0);
});

test('PATCH de perfil exige autenticação', async (t) => {
  const amb = await criarAmbiente();
  t.after(amb.encerrar);

  const resposta = await amb.chamar('PATCH', '/api/perfil', {
    corpo: { nome: 'Novo Nome' }
  });

  assert.equal(resposta.status, 401);
});

test('PATCH de perfil retorna bloqueios RLS e falhas do banco sem salvar o nome', async (t) => {
  const amb = await criarAmbiente();
  t.after(amb.encerrar);
  const jogador = await amb.novoJogador('Nome Original');
  const perfil = amb.supabase.tabelas.usuarios.find((item) => item.id === jogador.id);

  amb.supabase.tabelasNegadas.add('usuarios');
  const bloqueado = await amb.chamar('PATCH', '/api/perfil', {
    cookie: jogador.cookie,
    corpo: { nome: 'Nome RLS' }
  });
  assert.equal(bloqueado.status, 403);
  assert.equal(perfil.nome, 'Nome Original');

  amb.supabase.tabelasNegadas.delete('usuarios');
  amb.supabase.falharTabela('usuarios', {
    code: 'XX000',
    message: 'Falha interna do banco',
    status: 500
  });
  const falhaBanco = await amb.chamar('PATCH', '/api/perfil', {
    cookie: jogador.cookie,
    corpo: { nome: 'Nome Banco' }
  });
  assert.equal(falhaBanco.status, 503);
  assert.match(falhaBanco.json.mensagem, /Supabase indisponível/i);
  assert.equal(perfil.nome, 'Nome Original');
});

test('falha no ranking não impede carregar o perfil e deixa posição nula', async (t) => {
  const amb = await criarAmbiente();
  t.after(amb.encerrar);
  const jogador = await amb.novoJogador('Ranking Indisponível');
  amb.supabase.falharTabela('vw_ranking_publico', {
    code: '42501',
    message: 'A view do ranking não está disponível.',
    status: 403
  });

  const perfil = await amb.chamar('GET', '/api/perfil', { cookie: jogador.cookie });

  assert.equal(perfil.status, 200);
  assert.equal(perfil.json.usuario.id, jogador.id);
  assert.equal(perfil.json.usuario.nome, 'Ranking Indisponível');
  assert.equal(perfil.json.usuario.posicao, null);
});

test('ranking retorna todos os jogadores disponíveis, sem limite fixo de 50', async (t) => {
  const amb = await criarAmbiente({ limiteMaximoLinhas: 7 });
  t.after(amb.encerrar);
  const jogador = await amb.novoJogador('Jogador 0');
  for (let indice = 1; indice < 61; indice += 1) {
    amb.supabase.seed('usuarios', {
      nome: `Jogador ${indice}`,
      pontos: 100 - indice,
      vitorias: 0,
      derrotas: 0
    });
  }

  const resposta = await amb.chamar('GET', '/api/ranking', { cookie: jogador.cookie });

  assert.equal(resposta.status, 200);
  assert.equal(resposta.json.ranking.length, 61);
  assert.deepEqual(resposta.json.ranking.map((item) => item.posicao), Array.from({ length: 61 }, (_, indice) => indice + 1));
});

test('posição do perfil considera páginas completas do ranking', async (t) => {
  const amb = await criarAmbiente();
  t.after(amb.encerrar);
  const jogador = await amb.novoJogador('Ultimo do Ranking');
  for (let indice = 0; indice < 500; indice += 1) {
    amb.supabase.seed('usuarios', {
      nome: `Combatente ${indice}`,
      email: `combatente${indice}@teste.com`,
      pontos: 10,
      vitorias: 1,
      derrotas: 0
    });
  }

  const perfil = await amb.chamar('GET', '/api/perfil', { cookie: jogador.cookie });
  assert.equal(perfil.status, 200);
  assert.equal(perfil.json.usuario.posicao, 501);
});

test('paginação mantém listagens e contagens corretas acima do limite de linhas', async (t) => {
  const amb = await criarAmbiente({ limiteMaximoLinhas: 2 });
  t.after(amb.encerrar);
  const ana = await amb.novoJogador('Ana');
  const bia = await amb.novoJogador('Bia');

  const campeonatos = Array.from({ length: 5 }, (_, indice) => UUID());
  campeonatos.forEach((id, indice) => {
    amb.supabase.seed('campeonatos', {
      id,
      nome: `Campeonato ${indice}`,
      status: 'aberto',
      max_participantes: 10
    });
  });
  amb.supabase.seed('inscricoes', { campeonato_id: campeonatos[0], jogador_id: ana.id, status: 'pendente' });
  amb.supabase.seed('inscricoes', { campeonato_id: campeonatos[1], jogador_id: ana.id, status: 'pendente' });
  amb.supabase.seed('inscricoes', { campeonato_id: campeonatos[2], jogador_id: bia.id, status: 'pendente' });

  const lista = await amb.chamar('GET', '/api/torneios', { cookie: ana.cookie });
  assert.equal(lista.status, 200);
  assert.equal(lista.json.torneios.length, 5);
  assert.equal(lista.json.torneios.find((item) => item.id === campeonatos[0]).inscritos, 1);
  assert.equal(lista.json.torneios.find((item) => item.id === campeonatos[0]).inscrito, true);

  const resumo = await amb.chamar('GET', '/api/resumo', { cookie: ana.cookie });
  assert.equal(resumo.status, 200);
  assert.deepEqual(resumo.json, {
    torneiosAbertos: 5,
    jogadoresInscritos: 2,
    partidasConcluidas: 0
  });
});

test('campeonatos, inscrições, resumo e partidas não fabricam placares', async (t) => {
  const amb = await criarAmbiente();
  t.after(amb.encerrar);
  const aberto = UUID();
  const emBreve = UUID();
  const ana = await amb.novoJogador('Ana');
  const bia = await amb.novoJogador('Bia');
  const caio = await amb.novoJogador('Caio');
  const torneio = (id, nome, status, vagas) => amb.supabase.seed('campeonatos', {
    id, nome, descricao: `Descrição de ${nome}`, formato: 'eliminação simples',
    max_participantes: vagas, inicio_em: '2026-12-01', premio: 'pontos', status
  });
  torneio(aberto, 'Torneio Aberto', 'aberto', 1);
  torneio(emBreve, 'Torneio Em Breve', 'em_breve', 8);

  const lista = await amb.chamar('GET', '/api/torneios', { cookie: ana.cookie });
  assert.deepEqual(lista.json.torneios.map((item) => item.nome), ['Torneio Aberto', 'Torneio Em Breve']);
  assert.equal(lista.json.torneios[0].vagas, 1);
  assert.equal(lista.json.torneios[0].inicio, '2026-12-01');
  assert.equal(lista.json.torneios[0].inscrito, false);

  assert.equal((await amb.chamar('POST', `/api/torneios/${aberto}/inscricao`, { cookie: ana.cookie })).status, 201);
  assert.equal((await amb.chamar('POST', `/api/torneios/${aberto}/inscricao`, { cookie: ana.cookie })).status, 409);
  assert.equal((await amb.chamar('POST', '/api/torneios/1/inscricao', { cookie: ana.cookie })).status, 400);
  assert.equal((await amb.chamar('POST', `/api/torneios/${UUID()}/inscricao`, { cookie: ana.cookie })).status, 404);
  assert.equal((await amb.chamar('POST', `/api/torneios/${emBreve}/inscricao`, { cookie: ana.cookie })).status, 409);
  assert.equal((await amb.chamar('POST', `/api/torneios/${aberto}/inscricao`, { cookie: bia.cookie })).status, 409);
  assert.equal((await amb.chamar('DELETE', `/api/torneios/${aberto}/inscricao`, { cookie: ana.cookie })).status, 200);
  assert.equal(amb.supabase.tabelas.inscricoes.length, 1);
  assert.equal(amb.supabase.tabelas.inscricoes[0].status, 'cancelada');
  assert.equal((await amb.chamar('DELETE', `/api/torneios/${aberto}/inscricao`, { cookie: ana.cookie })).status, 404);

  const partidaId = UUID();
  amb.supabase.seed('partidas', {
    id: partidaId, campeonato_id: aberto, jogador_1_id: ana.id, jogador_2_id: bia.id,
    vencedor_id: ana.id, fase: 'Final',
    resultado: '2 a 1', concluida_em: '2026-11-18T12:00:00Z'
  });
  amb.supabase.seed('partidas', {
    id: UUID(), campeonato_id: aberto, jogador_1_id: bia.id, jogador_2_id: caio.id,
    vencedor_id: caio.id, fase: 'Semifinal',
    resultado: '2 a 0', concluida_em: '2026-11-19T12:00:00Z'
  });
  const partidas = await amb.chamar('GET', '/api/partidas', { cookie: ana.cookie });
  assert.equal(partidas.status, 200);
  assert.equal(partidas.json.partidas.length, 1);
  assert.deepEqual(partidas.json.partidas[0], {
    id: partidaId,
    jogador1: 'Ana',
    jogador2: 'Bia',
    vencedor: 'Ana',
    perdedor: 'Bia',
    resultado: '2 a 1',
    fase: 'Final',
    torneio: 'Torneio Aberto'
  });

  const resumo = await amb.chamar('GET', '/api/resumo', { cookie: ana.cookie });
  assert.deepEqual(resumo.json, { torneiosAbertos: 1, jogadoresInscritos: 0, partidasConcluidas: 2 });
});

test('cancelamento preserva o histórico, restringe ao jogador e libera vaga e contagens', async (t) => {
  const amb = await criarAmbiente();
  t.after(amb.encerrar);
  const ana = await amb.novoJogador('Ana');
  const bia = await amb.novoJogador('Bia');
  const campeonatoId = UUID();
  amb.supabase.seed('campeonatos', {
    id: campeonatoId,
    nome: 'Torneio com uma vaga',
    status: 'aberto',
    max_participantes: 1
  });

  assert.equal((await amb.chamar('POST', `/api/torneios/${campeonatoId}/inscricao`, {
    cookie: ana.cookie
  })).status, 201);
  const inscricao = amb.supabase.tabelas.inscricoes[0];
  assert.equal(inscricao.status, 'pendente');

  const tentativaDeBia = await amb.chamar('DELETE', `/api/torneios/${campeonatoId}/inscricao`, {
    cookie: bia.cookie
  });
  assert.equal(tentativaDeBia.status, 404);
  assert.equal(inscricao.status, 'pendente');

  const cancelamento = await amb.chamar('DELETE', `/api/torneios/${campeonatoId}/inscricao`, {
    cookie: ana.cookie
  });
  assert.equal(cancelamento.status, 200);
  assert.equal(inscricao.status, 'cancelada');
  assert.equal(amb.supabase.tabelas.inscricoes.length, 1);

  const listaAposCancelamento = await amb.chamar('GET', '/api/torneios', { cookie: ana.cookie });
  assert.equal(listaAposCancelamento.json.torneios[0].inscritos, 0);
  assert.equal(listaAposCancelamento.json.torneios[0].inscrito, false);
  const resumoAposCancelamento = await amb.chamar('GET', '/api/resumo', { cookie: ana.cookie });
  assert.equal(resumoAposCancelamento.json.jogadoresInscritos, 0);

  const inscricaoBia = await amb.chamar('POST', `/api/torneios/${campeonatoId}/inscricao`, {
    cookie: bia.cookie
  });
  assert.equal(inscricaoBia.status, 201);
  const listaAposNovaInscricao = await amb.chamar('GET', '/api/torneios', { cookie: bia.cookie });
  assert.equal(listaAposNovaInscricao.json.torneios[0].inscritos, 1);
  const resumoAposNovaInscricao = await amb.chamar('GET', '/api/resumo', { cookie: bia.cookie });
  assert.equal(resumoAposNovaInscricao.json.jogadoresInscritos, 1);
});

test('histórico separa partidas e inscrições, inclui canceladas e isola por jogador', async (t) => {
  const amb = await criarAmbiente();
  t.after(amb.encerrar);
  const ana = await amb.novoJogador('Ana');
  const bia = await amb.novoJogador('Bia');
  const caio = await amb.novoJogador('Caio');
  const campeonatoAtual = UUID();
  const campeonatoAnterior = UUID();
  const inscricaoDaBia = UUID();
  const partidaId = UUID();

  amb.supabase.seed('campeonatos', {
    id: campeonatoAtual,
    nome: 'Arena Atual',
    modalidade: '1v1',
    formato: 'eliminacao_simples'
  });
  amb.supabase.seed('campeonatos', {
    id: campeonatoAnterior,
    nome: 'Arena Anterior',
    modalidade: 'dupla',
    formato: 'grupos'
  });
  amb.supabase.seed('inscricoes', {
    campeonato_id: campeonatoAtual,
    jogador_id: ana.id,
    status: 'pendente',
    inscrito_em: '2026-11-18T10:00:00.000Z'
  });
  amb.supabase.seed('inscricoes', {
    campeonato_id: campeonatoAnterior,
    jogador_id: ana.id,
    status: 'aprovada',
    inscrito_em: '2026-11-17T10:00:00.000Z'
  });
  amb.supabase.seed('inscricoes', {
    campeonato_id: campeonatoAtual,
    jogador_id: ana.id,
    status: 'cancelada',
    inscrito_em: '2026-11-16T10:00:00.000Z'
  });
  amb.supabase.seed('inscricoes', {
    id: inscricaoDaBia,
    campeonato_id: campeonatoAtual,
    jogador_id: bia.id,
    status: 'aprovada',
    inscrito_em: '2026-11-15T10:00:00.000Z'
  });
  amb.supabase.seed('partidas', {
    id: partidaId,
    campeonato_id: campeonatoAtual,
    jogador_1_id: ana.id,
    jogador_2_id: bia.id,
    vencedor_id: ana.id,
    fase: 'Final',
    resultado: '2 a 1',
    concluida_em: '2026-11-19T10:00:00.000Z'
  });

  const historicoInscricoes = await amb.chamar('GET', '/api/historico/inscricoes', { cookie: ana.cookie });
  assert.equal(historicoInscricoes.status, 200);
  assert.deepEqual(historicoInscricoes.json.inscricoes.map((inscricao) => inscricao.status), [
    'pendente',
    'aprovada',
    'cancelada'
  ]);
  assert.deepEqual(historicoInscricoes.json.inscricoes[0], {
    id: amb.supabase.tabelas.inscricoes[0].id,
    campeonato_id: campeonatoAtual,
    campeonato: 'Arena Atual',
    modalidade: '1v1',
    formato: 'eliminacao_simples',
    inscrito_em: '2026-11-18T10:00:00.000Z',
    status: 'pendente'
  });
  assert.equal(historicoInscricoes.json.inscricoes.some((inscricao) => inscricao.id === inscricaoDaBia), false);

  const historicoPartidas = await amb.chamar('GET', '/api/partidas', { cookie: ana.cookie });
  assert.equal(historicoPartidas.status, 200);
  assert.equal(historicoPartidas.json.partidas.length, 1);
  assert.equal(historicoPartidas.json.partidas[0].id, partidaId);
  assert.equal(Object.hasOwn(historicoPartidas.json, 'inscricoes'), false);

  const historicoVazio = await amb.chamar('GET', '/api/historico/inscricoes', { cookie: caio.cookie });
  assert.deepEqual(historicoVazio.json, { inscricoes: [] });
});

test('cria campeonato autenticado usando a identidade da sessão e os campos Supabase', async (t) => {
  const amb = await criarAmbiente();
  t.after(amb.encerrar);
  const ana = await amb.novoJogador('Ana');
  const bia = await amb.novoJogador('Bia');
  const resposta = await amb.chamar('POST', '/api/torneios', {
    cookie: ana.cookie,
    corpo: {
      nome: '  Arena de Teste  ',
      descricao: 'Chave de teste',
      modalidade: 'dupla',
      formato: 'grupos',
      max_participantes: 8,
      premio: 'Pontos no ranking',
      inicio_em: '2026-12-01T15:00:00-03:00',
      encerramento_em: '2026-12-02T18:00:00-03:00',
      status: 'encerrado',
      criador_id: bia.id
    }
  });

  assert.equal(resposta.status, 201);
  assert.equal(resposta.json.campeonato.nome, 'Arena de Teste');
  assert.equal(resposta.json.campeonato.modalidade, 'dupla');
  assert.equal(resposta.json.campeonato.formato, 'grupos');
  assert.equal(resposta.json.campeonato.max_participantes, 8);
  assert.equal(resposta.json.campeonato.status, 'aberto');
  assert.equal(resposta.json.campeonato.criador_id, ana.id);
  assert.equal(resposta.json.campeonato.inicio_em, '2026-12-01T18:00:00.000Z');
  assert.equal(resposta.json.campeonato.encerramento_em, '2026-12-02T21:00:00.000Z');
  assert.equal(amb.supabase.tabelas.campeonatos.length, 1);
});

test('criação de campeonato exige sessão autenticada', async (t) => {
  const amb = await criarAmbiente();
  t.after(amb.encerrar);
  const resposta = await amb.chamar('POST', '/api/torneios', {
    corpo: { nome: 'Sem sessão' }
  });

  assert.equal(resposta.status, 401);
  assert.equal(amb.supabase.tabelas.campeonatos.length, 0);
});

test('POST /api/torneios autenticado chega à validação sem criar campeonato', async (t) => {
  const amb = await criarAmbiente();
  t.after(amb.encerrar);
  const jogador = await amb.novoJogador('Validador de rota');
  const resposta = await amb.chamar('POST', '/api/torneios', {
    cookie: jogador.cookie,
    corpo: {}
  });

  assert.equal(resposta.status, 400);
  assert.equal(resposta.json.mensagem, 'O nome do campeonato é obrigatório.');
  assert.equal(amb.supabase.tabelas.campeonatos.length, 0);
});

test('valida campos, limites e datas de criação do campeonato', async (t) => {
  const amb = await criarAmbiente();
  t.after(amb.encerrar);
  const jogador = await amb.novoJogador('Validador');
  const dadosValidos = {
    nome: 'Campeonato válido',
    descricao: '',
    modalidade: '1v1',
    formato: 'eliminacao_simples',
    max_participantes: 16,
    premio: '',
    inicio_em: null,
    encerramento_em: null
  };
  const casosInvalidos = [
    [{ ...dadosValidos, nome: '   ' }, /nome.*obrigatório/i],
    [{ ...dadosValidos, nome: 'x'.repeat(151) }, /150 caracteres/i],
    [{ ...dadosValidos, modalidade: 'battle-royale' }, /modalidade/i],
    [{ ...dadosValidos, formato: 'mata_mata' }, /formato/i],
    [{ ...dadosValidos, max_participantes: 1 }, /participantes/i],
    [{ ...dadosValidos, max_participantes: 65 }, /participantes/i],
    [{ ...dadosValidos, inicio_em: '2026-02-30T12:00:00.000Z' }, /data de início/i],
    [{ ...dadosValidos, encerramento_em: 'data-inválida' }, /data de encerramento/i],
    [{
      ...dadosValidos,
      inicio_em: '2026-12-02T12:00:00.000Z',
      encerramento_em: '2026-12-01T12:00:00.000Z'
    }, /início.*posterior/i]
  ];

  for (const [corpo, mensagem] of casosInvalidos) {
    const resposta = await amb.chamar('POST', '/api/torneios', { cookie: jogador.cookie, corpo });
    assert.equal(resposta.status, 400, JSON.stringify(corpo));
    assert.match(resposta.json.mensagem, mensagem);
  }
  assert.equal(amb.supabase.tabelas.campeonatos.length, 0);
});

test('aceita todas as modalidades, formatos e limites definidos para campeonatos', async (t) => {
  const amb = await criarAmbiente();
  t.after(amb.encerrar);
  const jogador = await amb.novoJogador('Opções válidas');
  const combinacoes = [
    ['1v1', 'eliminacao_simples'],
    ['dupla', 'grupos'],
    ['equipes', 'pontos'],
    ['solo', 'eliminacao_simples']
  ];

  for (const [indice, [modalidade, formato]] of combinacoes.entries()) {
    const resposta = await amb.chamar('POST', '/api/torneios', {
      cookie: jogador.cookie,
      corpo: {
        nome: `Campeonato válido ${indice}`,
        modalidade,
        formato,
        max_participantes: indice % 2 === 0 ? 2 : 64
      }
    });
    assert.equal(resposta.status, 201);
    assert.equal(resposta.json.campeonato.modalidade, modalidade);
    assert.equal(resposta.json.campeonato.formato, formato);
  }
});

test('falhas de inserção e bloqueios RLS não expõem detalhes do Supabase', async (t) => {
  const amb = await criarAmbiente();
  t.after(amb.encerrar);
  const jogador = await amb.novoJogador('Proteção RLS');
  const corpo = {
    nome: 'Campeonato protegido',
    modalidade: 'solo',
    formato: 'pontos',
    max_participantes: 2
  };

  amb.supabase.tabelasNegadas.add('campeonatos');
  const bloqueado = await amb.chamar('POST', '/api/torneios', { cookie: jogador.cookie, corpo });
  assert.equal(bloqueado.status, 403);
  assert.match(bloqueado.json.mensagem, /políticas de acesso/i);
  assert.doesNotMatch(bloqueado.texto, /row-level security|42501/i);
  assert.equal(amb.supabase.tabelas.campeonatos.length, 0);

  amb.supabase.tabelasNegadas.delete('campeonatos');
  amb.supabase.falharTabela('campeonatos', {
    status: 500,
    code: 'XX000',
    message: 'Detalhe confidencial do provedor'
  });
  const falha = await amb.chamar('POST', '/api/torneios', { cookie: jogador.cookie, corpo });
  assert.equal(falha.status, 503);
  assert.doesNotMatch(falha.texto, /Detalhe confidencial|XX000/i);
  assert.equal(amb.supabase.tabelas.campeonatos.length, 0);
});

test('desafios usam IDs UUID e só o desafiado responde', async (t) => {
  const amb = await criarAmbiente();
  t.after(amb.encerrar);
  const ana = await amb.novoJogador('Ana');
  const bia = await amb.novoJogador('Bia');
  const caio = await amb.novoJogador('Caio');

  const desafiar = (jogador, oponente) => amb.chamar('POST', '/api/desafios', {
    cookie: jogador.cookie,
    corpo: { oponente }
  });
  assert.equal((await desafiar(ana, '')).status, 400);
  assert.equal((await desafiar(ana, 'Ninguém Aqui')).status, 404);
  assert.equal((await desafiar(ana, 'ana')).status, 400);

  const criado = await desafiar(ana, 'bIA');
  assert.equal(criado.status, 201);
  const desafioId = criado.json.desafio.id;
  assert.match(desafioId, /^[0-9a-f-]{36}$/i);
  assert.equal((await desafiar(ana, 'Bia')).status, 409);
  assert.equal((await desafiar(bia, 'Ana')).status, 409);

  const recebidos = await amb.chamar('GET', '/api/desafios', { cookie: bia.cookie });
  assert.deepEqual(
    [recebidos.json.desafios[0].desafiante, recebidos.json.desafios[0].desafiado, recebidos.json.desafios[0].direcao],
    ['Ana', 'Bia', 'recebido']
  );
  assert.equal((await amb.chamar('PATCH', `/api/desafios/${desafioId}`, {
    cookie: ana.cookie, corpo: { acao: 'aceitar' }
  })).status, 404);
  assert.equal((await amb.chamar('PATCH', `/api/desafios/${desafioId}`, {
    cookie: caio.cookie, corpo: { acao: 'aceitar' }
  })).status, 404);

  const aceito = await amb.chamar('PATCH', `/api/desafios/${desafioId}`, {
    cookie: bia.cookie, corpo: { acao: 'aceitar' }
  });
  assert.equal(aceito.status, 200);
  assert.equal(aceito.json.status, 'aceito');
  assert.equal((await amb.chamar('PATCH', `/api/desafios/${desafioId}`, {
    cookie: bia.cookie, corpo: { acao: 'recusar' }
  })).status, 409);
  assert.equal((await amb.chamar('PATCH', '/api/desafios/id-invalido', {
    cookie: bia.cookie, corpo: { acao: 'aceitar' }
  })).status, 400);

  await amb.cadastrar('Clone', 'clone1@teste.com');
  await amb.cadastrar('Clone', 'clone2@teste.com');
  assert.equal((await desafiar(ana, 'Clone')).status, 409);
});

test('limite de criação de desafios conta também tentativas recusadas', async (t) => {
  const amb = await criarAmbiente({ limites: { desafios: { janelaMs: 60000, max: 2 } } });
  t.after(amb.encerrar);
  const ana = await amb.novoJogador('Ana');
  await amb.cadastrar('Bia');
  const enviar = () => amb.chamar('POST', '/api/desafios', {
    cookie: ana.cookie,
    corpo: { oponente: 'Bia' }
  });

  assert.equal((await enviar()).status, 201);
  assert.equal((await enviar()).status, 409);
  assert.equal((await enviar()).status, 429);
});

test('origens externas são bloqueadas e /api/status verifica o Supabase', async (t) => {
  const amb = await criarAmbiente();
  t.after(amb.encerrar);
  assert.equal((await amb.chamar('GET', '/api/status')).status, 200);

  amb.supabase.falharTabela('vw_ranking_publico', {
    status: 503,
    code: 'PGRST000',
    message: 'Falha de consulta simulada'
  });
  const statusIndisponivel = await amb.chamar('GET', '/api/status');
  assert.equal(statusIndisponivel.status, 503);
  assert.match(statusIndisponivel.json.mensagem, /Supabase indisponível/i);
  assert.doesNotMatch(statusIndisponivel.texto, /PGRST000|Falha de consulta simulada/);

  const bloqueada = await amb.chamar('POST', '/api/usuarios', {
    corpo: { nome: 'Teste', email: 'teste@teste.com', senha: 'senha-forte-123' },
    headers: { Origin: 'https://site-malicioso.example' }
  });
  assert.equal(bloqueada.status, 403);
  assert.equal((await amb.chamar('GET', '/api/nao-existe')).status, 401);
});

test('a fonte Phoenix Gaming é opcional e o CSS é gerado quando ela existe', async (t) => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'rivals-arena-public-'));
  const pastaFontes = path.join(pasta, 'fonts');
  fs.mkdirSync(pastaFontes, { recursive: true });

  const amb = await criarAmbiente({ pastaPublica: pasta });
  t.after(async () => {
    await amb.encerrar();
    fs.rmSync(pasta, { recursive: true, force: true });
  });

  const semFonte = await amb.chamar('GET', '/css/fonte-titulos.css');
  assert.equal(semFonte.status, 200);
  assert.match(semFonte.headers.get('content-type'), /text\/css/);
  assert.doesNotMatch(semFonte.texto, /@font-face/);

  fs.writeFileSync(path.join(pastaFontes, 'PhoenixGaming.woff2'), 'fixture');
  const comFonte = await amb.chamar('GET', '/css/fonte-titulos.css');
  assert.equal(comFonte.status, 200);
  assert.match(comFonte.texto, /font-family:"Phoenix Gaming"/);
  assert.match(comFonte.texto, /PhoenixGaming\.woff2/);
});

test('recusa RLS é devolvida sem trocar para acesso privilegiado', async (t) => {
  const amb = await criarAmbiente();
  t.after(amb.encerrar);
  const jogador = await amb.novoJogador('Leitura Negada');
  amb.supabase.tabelasNegadas.add('campeonatos');

  const resposta = await amb.chamar('GET', '/api/torneios', { cookie: jogador.cookie });
  assert.equal(resposta.status, 403);
  assert.match(resposta.json.mensagem, /políticas de acesso/i);
});

test('limites Supabase são devolvidos como HTTP 429 sem expor detalhes internos', async (t) => {
  const amb = await criarAmbiente();
  t.after(amb.encerrar);
  const jogador = await amb.novoJogador('Limite Auth');
  amb.supabase.falharAuth('signInWithPassword', {
    status: 429,
    code: 'over_request_rate_limit',
    message: 'Detalhe interno do provedor'
  });

  const authLimitada = await amb.chamar('POST', '/api/login', {
    corpo: { email: jogador.email, senha: jogador.senha }
  });
  assert.equal(authLimitada.status, 429);
  assert.doesNotMatch(authLimitada.texto, /Detalhe interno/);

  amb.supabase.falharTabela('campeonatos', {
    status: 429,
    code: 'over_request_rate_limit',
    message: 'Detalhe interno do provedor'
  });
  const apiLimitada = await amb.chamar('GET', '/api/torneios', { cookie: jogador.cookie });
  assert.equal(apiLimitada.status, 429);
  assert.doesNotMatch(apiLimitada.texto, /Detalhe interno/);
});

test('erros 403 do Supabase Auth não são rotulados como falhas de RLS', async (t) => {
  const amb = await criarAmbiente();
  t.after(amb.encerrar);
  amb.supabase.falharAuth('signUp', {
    status: 403,
    code: 'signup_disabled',
    message: 'Signup disabled'
  });

  test('Times usa a identidade autenticada e oferece solicitação, aprovação, saída e transferência', async (t) => {
    const amb = await criarAmbiente();
    t.after(amb.encerrar);
    const lider = await amb.novoJogador('Líder');
    const membro = await amb.novoJogador('Integrante');
    const outro = await amb.novoJogador('Outro Jogador');

    const semSessao = await amb.chamar('POST', '/api/times', {
      corpo: { nome: 'Time sem sessão' }
    });
    assert.equal(semSessao.status, 401);

    const criado = await amb.chamar('POST', '/api/times', {
      cookie: lider.cookie,
      corpo: {
        nome: '  Equipe Arena  ',
        descricao: 'Formação de teste',
        max_integrantes: 3,
        lider_id: outro.id
      }
    });
    assert.equal(criado.status, 201);
    const timeId = criado.json.dados.id;
    assert.equal(criado.json.dados.nome, 'Equipe Arena');
    assert.equal(criado.json.dados.lider_id, lider.id);
    assert.equal(amb.supabase.tabelas.membros_time[0].jogador_id, lider.id);

    const solicitacao = await amb.chamar('POST', `/api/times/${timeId}/solicitacoes`, {
      cookie: membro.cookie,
      corpo: {}
    });
    assert.equal(solicitacao.status, 201);
    const pendentes = await amb.chamar('GET', `/api/times/${timeId}`, { cookie: lider.cookie });
    assert.equal(pendentes.json.time.solicitacoes[0].nome, 'Integrante');

    const aprovada = await amb.chamar('PATCH', `/api/times/solicitacoes/${solicitacao.json.dados.id}`, {
      cookie: lider.cookie,
      corpo: { aceitar: true }
    });
    assert.equal(aprovada.status, 200);
    assert.equal(aprovada.json.dados.status, 'aprovada');

    const outraSolicitacao = await amb.chamar('POST', `/api/times/${timeId}/solicitacoes`, {
      cookie: outro.cookie,
      corpo: {}
    });
    assert.equal(outraSolicitacao.status, 201);
    assert.equal((await amb.chamar('PATCH', `/api/times/solicitacoes/${outraSolicitacao.json.dados.id}`, {
      cookie: lider.cookie,
      corpo: { aceitar: true }
    })).status, 200);

    const proibida = await amb.chamar('PATCH', `/api/times/${timeId}`, {
      cookie: membro.cookie,
      corpo: { nome: 'Nome indevido', descricao: '', max_integrantes: 3 }
    });
    assert.equal(proibida.status, 403);

    const editado = await amb.chamar('PATCH', `/api/times/${timeId}`, {
      cookie: lider.cookie,
      corpo: { nome: 'Equipe Renomeada', descricao: 'Descrição editada', max_integrantes: 3 }
    });
    assert.equal(editado.status, 200);
    assert.equal(editado.json.dados.nome, 'Equipe Renomeada');

    const removido = await amb.chamar('DELETE', `/api/times/${timeId}/membros/${outro.id}`, {
      cookie: lider.cookie
    });
    assert.equal(removido.status, 200);
    assert.equal(amb.supabase.tabelas.membros_time.find((item) =>
      item.time_id === timeId && item.jogador_id === outro.id
    ).status, 'removido');

    const transferencia = await amb.chamar('POST', `/api/times/${timeId}/transferir-lideranca`, {
      cookie: lider.cookie,
      corpo: { novo_lider_id: membro.id }
    });
    assert.equal(transferencia.status, 200);
    assert.equal(transferencia.json.dados.lider_id, membro.id);

    const saida = await amb.chamar('POST', `/api/times/${timeId}/sair`, {
      cookie: lider.cookie,
      corpo: {}
    });
    assert.equal(saida.status, 200);
    assert.equal(amb.supabase.tabelas.membros_time.find((item) =>
      item.time_id === timeId && item.jogador_id === lider.id
    ).status, 'saiu');
  });

  test('Times valida o limite proposto e recusa solicitações quando o time está cheio', async (t) => {
    const amb = await criarAmbiente();
    t.after(amb.encerrar);
    const lider = await amb.novoJogador('Líder Vagas');
    const membro = await amb.novoJogador('Membro Vagas');
    const terceiro = await amb.novoJogador('Terceiro Vagas');

    const invalido = await amb.chamar('POST', '/api/times', {
      cookie: lider.cookie,
      corpo: { nome: 'Time inválido', max_integrantes: 6 }
    });
    assert.equal(invalido.status, 400);

    const criado = await amb.chamar('POST', '/api/times', {
      cookie: lider.cookie,
      corpo: { nome: 'Time Completo', max_integrantes: 2 }
    });
    const timeId = criado.json.dados.id;
    const solicitacao = await amb.chamar('POST', `/api/times/${timeId}/solicitacoes`, {
      cookie: membro.cookie, corpo: {}
    });
    assert.equal(solicitacao.status, 201);
    assert.equal((await amb.chamar('PATCH', `/api/times/solicitacoes/${solicitacao.json.dados.id}`, {
      cookie: lider.cookie, corpo: { aceitar: true }
    })).status, 200);

    const lotado = await amb.chamar('POST', `/api/times/${timeId}/solicitacoes`, {
      cookie: terceiro.cookie, corpo: {}
    });
    assert.equal(lotado.status, 409);
    assert.match(lotado.json.mensagem, /limite/i);
  });

  test('Times informa quando a migração ainda não existe no Supabase', async (t) => {
    const amb = await criarAmbiente();
    t.after(amb.encerrar);
    const jogador = await amb.novoJogador('Sem migração de time');
    amb.supabase.falharTabela('times', {
      code: 'PGRST205',
      message: 'table not found',
      status: 404
    });

    const resposta = await amb.chamar('GET', '/api/times', { cookie: jogador.cookie });
    assert.equal(resposta.status, 503);
    assert.match(resposta.json.mensagem, /schema do Supabase ainda não contém/i);
  });

  test('Arsenal apresenta somente itens publicados vindos do banco', async (t) => {
    const amb = await criarAmbiente();
    t.after(amb.encerrar);
    const jogador = await amb.novoJogador('Catálogo');

    const vazio = await amb.chamar('GET', '/api/arsenal', { cookie: jogador.cookie });
    assert.equal(vazio.status, 200);
    assert.deepEqual(vazio.json, { itens: [] });

    const slug = 'equipamento-real';
    amb.supabase.seed('arsenal_itens', {
      slug,
      nome: 'Equipamento publicado',
      categoria: 'Equipamento',
      descricao: 'Descrição registrada no catálogo.',
      detalhes: { fabricante: 'Equipe do jogo' },
      publicado: true
    });
    amb.supabase.seed('arsenal_itens', {
      slug: 'rascunho',
      nome: 'Rascunho',
      categoria: 'Equipamento',
      descricao: '',
      detalhes: {},
      publicado: false
    });

    const itens = await amb.chamar('GET', '/api/arsenal', { cookie: jogador.cookie });
    assert.deepEqual(itens.json.itens.map((item) => item.slug), [slug]);
    const detalheItem = await amb.chamar('GET', `/api/arsenal/${slug}`, { cookie: jogador.cookie });
    assert.equal(detalheItem.json.item.nome, 'Equipamento publicado');
    assert.equal((await amb.chamar('GET', '/api/arsenal/rascunho', {
      cookie: jogador.cookie
    })).status, 404);
  });

  test('reinscrição reutiliza a mesma linha e preserva ID e data original', async (t) => {
    const amb = await criarAmbiente();
    t.after(amb.encerrar);
    const jogador = await amb.novoJogador('Reinscrição');
    const campeonatoId = UUID();
    amb.supabase.seed('campeonatos', {
      id: campeonatoId,
      nome: 'Reinscrição permitida',
      max_participantes: 4,
      status: 'aberto'
    });

    assert.equal((await amb.chamar('POST', `/api/torneios/${campeonatoId}/inscricao`, {
      cookie: jogador.cookie, corpo: {}
    })).status, 201);
    const original = { ...amb.supabase.tabelas.inscricoes[0] };
    assert.equal((await amb.chamar('DELETE', `/api/torneios/${campeonatoId}/inscricao`, {
      cookie: jogador.cookie
    })).status, 200);
    const reinscricao = await amb.chamar('POST', `/api/torneios/${campeonatoId}/inscricao`, {
      cookie: jogador.cookie, corpo: {}
    });
    assert.equal(reinscricao.status, 201);
    assert.equal(amb.supabase.tabelas.inscricoes.length, 1);
    assert.equal(amb.supabase.tabelas.inscricoes[0].id, original.id);
    assert.equal(amb.supabase.tabelas.inscricoes[0].inscrito_em, original.inscrito_em);
    assert.equal(amb.supabase.tabelas.inscricoes[0].status, 'pendente');
  });

  test('inscrição atômica no banco deve proteger a última vaga contra requisições concorrentes', async (t) => {
    const amb = await criarAmbiente();
    t.after(amb.encerrar);
    const primeiro = await amb.novoJogador('Primeiro inscrito');
    const segundo = await amb.novoJogador('Concorrente um');
    const terceiro = await amb.novoJogador('Concorrente dois');
    const campeonatoId = UUID();
    amb.supabase.seed('campeonatos', {
      id: campeonatoId,
      nome: 'Última vaga',
      max_participantes: 2,
      status: 'aberto'
    });
    assert.equal((await amb.chamar('POST', `/api/torneios/${campeonatoId}/inscricao`, {
      cookie: primeiro.cookie, corpo: {}
    })).status, 201);

    const respostas = await Promise.all([
      amb.chamar('POST', `/api/torneios/${campeonatoId}/inscricao`, {
        cookie: segundo.cookie, corpo: {}
      }),
      amb.chamar('POST', `/api/torneios/${campeonatoId}/inscricao`, {
        cookie: terceiro.cookie, corpo: {}
      })
    ]);
    assert.deepEqual(respostas.map((resposta) => resposta.status).sort(), [201, 409]);
    assert.equal(amb.supabase.tabelas.inscricoes.filter((item) =>
      item.campeonato_id === campeonatoId && ['pendente', 'aprovada'].includes(item.status)
    ).length, 2);
  });

  test('resultado de partida exige participante, confirmação adversária e finaliza estatísticas uma vez', async (t) => {
    const amb = await criarAmbiente();
    t.after(amb.encerrar);
    const jogador1 = await amb.novoJogador('Jogador Um');
    const jogador2 = await amb.novoJogador('Jogador Dois');
    const terceiro = await amb.novoJogador('Não participante');
    const partidaId = UUID();
    amb.supabase.seed('partidas', {
      id: partidaId,
      jogador_1_id: jogador1.id,
      jogador_2_id: jogador2.id,
      status: 'em_andamento',
      concluida_em: null
    });
    assert.equal((await amb.chamar('GET', `/api/partidas/${partidaId}/resultado`, {
      cookie: terceiro.cookie
    })).status, 404);
    const corpo = {
      vencedor_id: jogador1.id,
      resultado: '2-1',
      chave_idempotencia: UUID()
    };

    assert.equal((await amb.chamar('POST', `/api/partidas/${partidaId}/resultado`, {
      cookie: jogador1.cookie,
      corpo: { ...corpo, resultado: '2 a 1' }
    })).status, 400);
    assert.equal((await amb.chamar('POST', `/api/partidas/${partidaId}/resultado`, {
      cookie: jogador1.cookie,
      corpo: { ...corpo, resultado: '1-2' }
    })).status, 400);
    assert.equal((await amb.chamar('POST', `/api/partidas/${partidaId}/resultado`, {
      cookie: terceiro.cookie, corpo
    })).status, 403);
    const relato = await amb.chamar('POST', `/api/partidas/${partidaId}/resultado`, {
      cookie: jogador1.cookie, corpo
    });
    assert.equal(relato.status, 200);
    assert.equal(relato.json.resultado.status, 'aguardando_confirmacao');

    const confirmarPeloMesmoJogador = await amb.chamar(
      'POST', `/api/partidas/${partidaId}/resultado/confirmar`,
      { cookie: jogador1.cookie, corpo: { chave_idempotencia: UUID() } }
    );
    assert.equal(confirmarPeloMesmoJogador.status, 403);

    const confirmarPorNaoParticipante = await amb.chamar(
      'POST', `/api/partidas/${partidaId}/resultado/confirmar`,
      { cookie: terceiro.cookie, corpo: { chave_idempotencia: UUID() } }
    );
    assert.equal(confirmarPorNaoParticipante.status, 403);

    const chaveConfirmacao = UUID();
    const confirmada = await amb.chamar('POST', `/api/partidas/${partidaId}/resultado/confirmar`, {
      cookie: jogador2.cookie,
      corpo: { chave_idempotencia: chaveConfirmacao }
    });
    assert.equal(confirmada.status, 200);
    assert.equal(confirmada.json.resultado.status, 'confirmada');
    assert.equal(amb.supabase.tabelas.partidas[0].status, 'concluida');
    assert.equal(amb.supabase.tabelas.partidas[0].resultado, corpo.resultado);
    assert.equal(amb.supabase.tabelas.partida_resultados.length, 0);
    assert.equal(amb.supabase.tabelas.usuarios.find((item) => item.id === jogador1.id).vitorias, 1);
    assert.equal(amb.supabase.tabelas.usuarios.find((item) => item.id === jogador2.id).derrotas, 1);

    const historico = await amb.chamar('GET', '/api/partidas', { cookie: jogador2.cookie });
    assert.equal(historico.status, 200);
    assert.equal(historico.json.partidas[0].resultado, corpo.resultado);
    const resultadoFinal = await amb.chamar('GET', `/api/partidas/${partidaId}/resultado`, {
      cookie: jogador2.cookie
    });
    assert.equal(resultadoFinal.json.resultado.resultado, corpo.resultado);
    assert.equal(resultadoFinal.json.resultado.status, 'confirmada');

    const repetida = await amb.chamar('POST', `/api/partidas/${partidaId}/resultado/confirmar`, {
      cookie: jogador2.cookie,
      corpo: { chave_idempotencia: chaveConfirmacao }
    });
    assert.equal(repetida.status, 200);
    assert.equal(amb.supabase.tabelas.usuarios.find((item) => item.id === jogador1.id).vitorias, 1);
    assert.equal((await amb.chamar('POST', `/api/partidas/${partidaId}/resultado`, {
      cookie: jogador1.cookie, corpo: { ...corpo, chave_idempotencia: UUID() }
    })).status, 409);
  });

  test('resultado divergente fica pendente de resolução e agenda só pode ser alterada pelo organizador', async (t) => {
    const amb = await criarAmbiente();
    t.after(amb.encerrar);
    const organizador = await amb.novoJogador('Organizador');
    const jogador1 = await amb.novoJogador('Participante A');
    const jogador2 = await amb.novoJogador('Participante B');
    const campeonatoId = UUID();
    const partidaId = UUID();
    amb.supabase.seed('campeonatos', {
      id: campeonatoId,
      nome: 'Partidas de teste',
      criador_id: organizador.id
    });
    amb.supabase.seed('partidas', {
      id: partidaId,
      campeonato_id: campeonatoId,
      jogador_1_id: jogador1.id,
      jogador_2_id: jogador2.id,
      status: 'agendada',
      agendada_para: null,
      concluida_em: null
    });

    const data = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    assert.equal((await amb.chamar('PATCH', `/api/partidas/${partidaId}/agendamento`, {
      cookie: jogador1.cookie, corpo: { agendada_para: data }
    })).status, 403);
    assert.equal((await amb.chamar('PATCH', `/api/partidas/${partidaId}/agendamento`, {
      cookie: organizador.cookie, corpo: { agendada_para: data }
    })).status, 200);
    assert.equal(amb.supabase.tabelas.partidas[0].agendada_para, data);

    const primeiroRelato = await amb.chamar('POST', `/api/partidas/${partidaId}/resultado`, {
      cookie: jogador1.cookie,
      corpo: {
        vencedor_id: jogador1.id,
        resultado: '2-1',
        chave_idempotencia: UUID()
      }
    });
    assert.equal(primeiroRelato.status, 200);
    const historicoPendente = await amb.chamar('GET', '/api/partidas', { cookie: jogador1.cookie });
    assert.equal(historicoPendente.status, 200);
    assert.equal(historicoPendente.json.partidas.length, 0);

    const divergente = await amb.chamar('POST', `/api/partidas/${partidaId}/resultado`, {
      cookie: jogador2.cookie,
      corpo: {
        vencedor_id: jogador2.id,
        resultado: '1-2',
        chave_idempotencia: UUID()
      }
    });
    assert.equal(divergente.status, 200);
    assert.equal(divergente.json.resultado.status, 'disputada');
    assert.equal((await amb.chamar('GET', '/api/partidas', {
      cookie: jogador2.cookie
    })).json.partidas.length, 0);
    assert.equal(amb.supabase.tabelas.usuarios.find((item) => item.id === jogador1.id).vitorias, 0);

    const decisaoSemAdmin = await amb.chamar('POST', `/api/partidas/${partidaId}/resultado/resolver`, {
      cookie: jogador1.cookie,
      corpo: {
        vencedor_id: jogador2.id,
        resultado: '1-2',
        justificativa: 'Decisão de teste',
        chave_idempotencia: UUID()
      }
    });
    assert.equal(decisaoSemAdmin.status, 403);

    amb.supabase.tabelas.usuarios.find((item) => item.id === organizador.id).perfil = 'admin';
    const chaveAdmin = UUID();
    const decisao = await amb.chamar('POST', `/api/partidas/${partidaId}/resultado/resolver`, {
      cookie: organizador.cookie,
      corpo: {
        vencedor_id: jogador2.id,
        resultado: '1-2',
        justificativa: 'O relato do segundo participante foi confirmado pelas evidências.',
        chave_idempotencia: chaveAdmin
      }
    });
    assert.equal(decisao.status, 200);
    assert.equal(decisao.json.resultado.status, 'confirmada');
    assert.equal(decisao.json.resultado.vencedor_id, jogador2.id);
    assert.equal(decisao.json.resultado.resolvido_por, organizador.id);
    assert.match(decisao.json.resultado.justificativa, /evidências/);
    assert.equal(amb.supabase.tabelas.partidas[0].status, 'concluida');
    assert.equal(amb.supabase.tabelas.partidas[0].resultado, '1-2');
    assert.equal(amb.supabase.tabelas.partida_resultados.length, 0);
    assert.equal(amb.supabase.tabelas.usuarios.find((item) => item.id === jogador2.id).vitorias, 1);
    assert.equal(amb.supabase.tabelas.usuarios.find((item) => item.id === jogador1.id).derrotas, 1);

    const repetida = await amb.chamar('POST', `/api/partidas/${partidaId}/resultado/resolver`, {
      cookie: organizador.cookie,
      corpo: {
        vencedor_id: jogador2.id,
        resultado: '1-2',
        justificativa: 'O relato do segundo participante foi confirmado pelas evidências.',
        chave_idempotencia: chaveAdmin
      }
    });
    assert.equal(repetida.status, 200);
  });
  const cadastro = await amb.chamar('POST', '/api/usuarios', {
    corpo: { nome: 'Teste Bloqueado', email: 'bloqueado@teste.com', senha: 'senha-forte-123' }
  });
  assert.equal(cadastro.status, 403);
  assert.doesNotMatch(cadastro.json.mensagem, /políticas de acesso/i);

  amb.supabase.falharAuth('signInWithPassword', {
    status: 403,
    code: 'user_banned',
    message: 'User is banned'
  });
  const login = await amb.chamar('POST', '/api/login', {
    corpo: { email: 'bloqueado@teste.com', senha: 'senha-forte-123' }
  });
  assert.equal(login.status, 403);
  assert.doesNotMatch(login.json.mensagem, /políticas de acesso/i);
});
