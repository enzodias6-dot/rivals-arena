'use strict';

/**
 * Testes de integração: sobem o servidor Express de verdade (porta aleatória) e fazem
 * requisições HTTP reais. O banco é um SQLite em memória (veja tests/helpers/bancoSqlite.js).
 * Requer Node 22.5+ (módulo node:sqlite). Rodar com: npm test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const jwt = require('jsonwebtoken');

let criarBancoSqlite;
try {
  ({ criarBancoSqlite } = require('./helpers/bancoSqlite'));
} catch (erro) {
  test('testes de API ignorados: Node 22.5+ é necessário (node:sqlite)', { skip: true }, () => {});
  return;
}

const { carregarConfig, validarSegredoJwt } = require('../src/config/env');
const { criarApp } = require('../src/app');

const SEGREDO = 'a'.repeat(16) + 'B'.repeat(16) + '0123456789abcdef0123456789abcdef';

async function criarAmbiente({ db, limites, pastaPublica } = {}) {
  const config = {
    ...carregarConfig({}),
    jwtSecret: SEGREDO,
    bcryptRounds: 4,
    limites: {
      login: { janelaMs: 60000, max: 1000 },
      cadastro: { janelaMs: 60000, max: 1000 },
      desafios: { janelaMs: 60000, max: 1000 },
      ...limites
    }
  };
  if (pastaPublica) config.pastaPublica = pastaPublica;

  const banco = db || criarBancoSqlite();
  const app = criarApp({ db: banco, config });
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
    try { json = JSON.parse(texto); } catch (erro) { /* resposta não é JSON */ }
    const setCookie = resposta.headers.getSetCookie ? resposta.headers.getSetCookie() : [];
    return { status: resposta.status, headers: resposta.headers, texto, json, setCookie };
  }

  async function cadastrar(nome, email = `${nome.toLowerCase().replace(/\s/g, '')}@teste.com`, senha = 'senha-forte-123') {
    const r = await chamar('POST', '/api/usuarios', { corpo: { nome, email, senha } });
    assert.equal(r.status, 201, `cadastro de ${nome} falhou: ${r.texto}`);
    return { ...r.json.usuario, email, senha };
  }

  async function entrar(email, senha = 'senha-forte-123') {
    const r = await chamar('POST', '/api/login', { corpo: { email, senha } });
    assert.equal(r.status, 200, `login de ${email} falhou: ${r.texto}`);
    const par = r.setCookie.map((c) => c.split(';')[0]).find((c) => c.startsWith('ra_session='));
    return { cookie: par, resposta: r };
  }

  async function novoJogador(nome) {
    const usuario = await cadastrar(nome);
    const { cookie } = await entrar(usuario.email);
    return { ...usuario, cookie };
  }

  const encerrar = () => new Promise((resolver) => servidor.close(resolver));
  return { chamar, cadastrar, entrar, novoJogador, encerrar, banco, config, base };
}

// ---------------------------------------------------------------- configuração
test('JWT_SECRET: rejeita ausente, curto e valor de exemplo; aceita segredo forte', () => {
  assert.ok(validarSegredoJwt(''));
  assert.ok(validarSegredoJwt('abc'));
  assert.ok(validarSegredoJwt('troque-esta-chave-por-uma-chave-bem-longa-123456'));
  assert.equal(validarSegredoJwt(SEGREDO), null);
});

// ---------------------------------------------------------------- páginas e proteção
test('páginas e arquivos estáticos', async (t) => {
  const amb = await criarAmbiente();
  t.after(amb.encerrar);

  await t.test('visitante é redirecionado para a tela de acesso', async () => {
    for (const rota of ['/', '/central.html', '/index.html', '/pages/ranking.html', '/pages/perfil.html', '/qualquer-coisa']) {
      const r = await amb.chamar('GET', rota);
      assert.equal(r.status, 302, rota);
      assert.equal(r.headers.get('location'), '/acesso.html', rota);
    }
  });

  await t.test('tela de acesso, CSS, JS, imagens e fontes são públicos', async () => {
    for (const rota of ['/acesso.html', '/css/styles.css', '/css/campeonatos.css', '/js/comum.js', '/js/auth.js', '/img/logo.png', '/fonts/Montserrat-Variable.woff2']) {
      const r = await amb.chamar('GET', rota);
      assert.equal(r.status, 200, rota);
    }
  });

  await t.test('arquivo público inexistente devolve 404 (não redireciona)', async () => {
    const r = await amb.chamar('GET', '/js/nao-existe.js');
    assert.equal(r.status, 404);
  });

  await t.test('favicon redireciona para o logo', async () => {
    const r = await amb.chamar('GET', '/favicon.ico');
    assert.equal(r.status, 301);
    assert.equal(r.headers.get('location'), '/img/logo.png');
  });

  await t.test('CSS da fonte opcional não quebra quando o arquivo não existe', async () => {
    const r = await amb.chamar('GET', '/css/fonte-titulos.css');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/css/);
    assert.ok(!r.texto.includes('@font-face'));
  });

  await t.test('cabeçalhos de segurança presentes', async () => {
    const r = await amb.chamar('GET', '/acesso.html');
    assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('x-frame-options'), 'DENY');
    assert.equal(r.headers.get('x-powered-by'), null);
  });

  await t.test('usuário logado acessa todas as páginas e vê 404 para rota desconhecida', async () => {
    const jogador = await amb.novoJogador('Pagina Teste');
    for (const rota of ['/', '/central.html', '/pages/campeonatos.html', '/pages/ranking.html', '/pages/arsenal.html', '/pages/times.html', '/pages/perfil.html']) {
      const r = await amb.chamar('GET', rota, { cookie: jogador.cookie });
      assert.equal(r.status, 200, rota);
      assert.match(r.headers.get('content-type'), /text\/html/, rota);
      assert.equal(r.headers.get('cache-control'), 'no-store', rota);
    }
    const desconhecida = await amb.chamar('GET', '/pagina-que-nao-existe', { cookie: jogador.cookie });
    assert.equal(desconhecida.status, 404);
    assert.match(desconhecida.texto, /não encontrada/i);
    const arquivo = await amb.chamar('GET', '/pages/nao-existe.html', { cookie: jogador.cookie });
    assert.equal(arquivo.status, 404);
  });

  await t.test('quem já está logado é levado da tela de acesso para a central', async () => {
    const jogador = await amb.novoJogador('Ja Logado');
    const r = await amb.chamar('GET', '/acesso.html', { cookie: jogador.cookie });
    assert.equal(r.status, 302);
    assert.equal(r.headers.get('location'), '/');
  });
});

// ---------------------------------------------------------------- cadastro
test('cadastro', async (t) => {
  const amb = await criarAmbiente();
  t.after(amb.encerrar);
  const cadastro = (corpo) => amb.chamar('POST', '/api/usuarios', { corpo });

  await t.test('rejeita dados inválidos', async () => {
    assert.equal((await cadastro({})).status, 400);
    assert.equal((await cadastro({ nome: 'A', email: 'a@a.com', senha: '12345678' })).status, 400);
    assert.equal((await cadastro({ nome: 'Valido', email: 'sem-arroba', senha: '12345678' })).status, 400);
    assert.equal((await cadastro({ nome: 'Valido', email: 'v@v.com', senha: '1234567' })).status, 400);
    assert.equal((await cadastro({ nome: 'Valido', email: 'v@v.com', senha: 'ç'.repeat(40) })).status, 400, 'mais de 72 bytes');
    assert.equal((await cadastro({ nome: 'Bad\u0000Nome', email: 'v@v.com', senha: '12345678' })).status, 400);
    assert.equal((await cadastro({ nome: ['x'], email: 'v@v.com', senha: '12345678' })).status, 400);
    assert.equal((await cadastro({ nome: 'Valido', email: { $ne: 1 }, senha: '12345678' })).status, 400);
  });

  await t.test('cria conta, guarda senha com hash e não devolve a senha', async () => {
    const r = await cadastro({ nome: '  Maria   Silva ', email: 'Maria@Teste.com ', senha: 'senha-forte-123' });
    assert.equal(r.status, 201);
    assert.equal(r.json.usuario.nome, 'Maria Silva');
    assert.equal(r.json.usuario.email, 'maria@teste.com');
    assert.ok(!('senha' in r.json.usuario));
    const [[linha]] = await amb.banco.query('SELECT senha, pontos, vitorias, derrotas FROM usuarios WHERE id = ' + r.json.usuario.id);
    assert.match(linha.senha, /^\$2[aby]\$/);
    assert.notEqual(linha.senha, 'senha-forte-123');
    assert.deepEqual([linha.pontos, linha.vitorias, linha.derrotas], [0, 0, 0]);
  });

  await t.test('email repetido (mesmo com maiúsculas) → 409', async () => {
    const r = await cadastro({ nome: 'Outra Maria', email: 'MARIA@teste.com', senha: 'senha-forte-123' });
    assert.equal(r.status, 409);
  });

  await t.test('JSON inválido → 400 em JSON; corpo ausente → 400', async () => {
    const quebrado = await amb.chamar('POST', '/api/usuarios', { bruto: '{nome:' });
    assert.equal(quebrado.status, 400);
    assert.ok(quebrado.json.mensagem);
    const vazio = await amb.chamar('POST', '/api/usuarios');
    assert.equal(vazio.status, 400);
  });
});

// ---------------------------------------------------------------- login / sessão / logout
test('login, sessão e logout', async (t) => {
  const amb = await criarAmbiente();
  t.after(amb.encerrar);
  const usuario = await amb.cadastrar('Sessao Teste');

  await t.test('senha errada e email inexistente dão a mesma resposta 401', async () => {
    const errada = await amb.chamar('POST', '/api/login', { corpo: { email: usuario.email, senha: 'errada-errada' } });
    const inexistente = await amb.chamar('POST', '/api/login', { corpo: { email: 'ninguem@teste.com', senha: 'errada-errada' } });
    assert.equal(errada.status, 401);
    assert.equal(inexistente.status, 401);
    assert.equal(errada.json.mensagem, inexistente.json.mensagem);
    assert.equal(errada.setCookie.length, 0);
  });

  await t.test('campos ausentes → 400', async () => {
    assert.equal((await amb.chamar('POST', '/api/login', { corpo: {} })).status, 400);
    assert.equal((await amb.chamar('POST', '/api/login', { corpo: { email: 'a@a.com' } })).status, 400);
  });

  await t.test('login correto cria cookie HttpOnly + SameSite=Strict e libera a API', async () => {
    const { cookie, resposta } = await amb.entrar(usuario.email);
    assert.equal(resposta.json.usuario.nome, 'Sessao Teste');
    const bruto = resposta.setCookie.find((c) => c.startsWith('ra_session='));
    assert.match(bruto, /HttpOnly/i);
    assert.match(bruto, /SameSite=Strict/i);
    const perfil = await amb.chamar('GET', '/api/perfil', { cookie });
    assert.equal(perfil.status, 200);
    assert.equal(perfil.json.usuario.email, usuario.email);
    assert.ok(!('senha' in perfil.json.usuario));
  });

  await t.test('email no login é case-insensitive', async () => {
    const r = await amb.chamar('POST', '/api/login', { corpo: { email: usuario.email.toUpperCase(), senha: usuario.senha } });
    assert.equal(r.status, 200);
  });

  await t.test('API protegida recusa visitante, token forjado, token "alg none" e cookie malformado', async () => {
    assert.equal((await amb.chamar('GET', '/api/perfil')).status, 401);
    assert.equal((await amb.chamar('GET', '/api/ranking')).status, 401);

    const forjado = jwt.sign({ id: 1, email: 'x@x.com' }, 'outro-segredo-qualquer-com-mais-de-32-caracteres', { issuer: 'rivals-arena' });
    assert.equal((await amb.chamar('GET', '/api/perfil', { cookie: `ra_session=${forjado}` })).status, 401);

    const semAssinatura = jwt.sign({ id: 1, email: 'x@x.com' }, '', { algorithm: 'none', issuer: 'rivals-arena' });
    assert.equal((await amb.chamar('GET', '/api/perfil', { cookie: `ra_session=${semAssinatura}` })).status, 401);

    const emissorErrado = jwt.sign({ id: 1, email: 'x@x.com' }, SEGREDO, { issuer: 'outro' });
    assert.equal((await amb.chamar('GET', '/api/perfil', { cookie: `ra_session=${emissorErrado}` })).status, 401);

    const expirado = jwt.sign({ id: 1, email: 'x@x.com' }, SEGREDO, { issuer: 'rivals-arena', expiresIn: -10 });
    assert.equal((await amb.chamar('GET', '/api/perfil', { cookie: `ra_session=${expirado}` })).status, 401);

    const malformado = await amb.chamar('GET', '/', { cookie: 'ra_session=%E0%A4%A' });
    assert.equal(malformado.status, 302, 'cookie malformado não pode causar erro 500');
  });

  await t.test('logout limpa o cookie', async () => {
    const { cookie } = await amb.entrar(usuario.email);
    const r = await amb.chamar('POST', '/api/logout', { cookie });
    assert.equal(r.status, 200);
    const limpo = r.setCookie.find((c) => c.startsWith('ra_session='));
    assert.ok(limpo, 'servidor deve enviar Set-Cookie para expirar a sessão');
    assert.match(limpo, /ra_session=;/);
    assert.match(limpo, /Expires=Thu, 01 Jan 1970/i);
  });

  await t.test('conta apagada com cookie ainda válido → 401 e cookie limpo', async () => {
    const fantasma = await amb.novoJogador('Fantasma');
    await amb.banco.execute('DELETE FROM usuarios WHERE id = ?', [fantasma.id]);
    const r = await amb.chamar('GET', '/api/perfil', { cookie: fantasma.cookie });
    assert.equal(r.status, 401);
    assert.ok(r.setCookie.some((c) => c.startsWith('ra_session=;')));
  });

  await t.test('requisição de outra origem é bloqueada (proteção CSRF)', async () => {
    const r = await amb.chamar('POST', '/api/login', {
      corpo: { email: usuario.email, senha: usuario.senha },
      headers: { Origin: 'http://site-malicioso.example' }
    });
    assert.equal(r.status, 403);
    const mesma = await amb.chamar('POST', '/api/login', {
      corpo: { email: usuario.email, senha: usuario.senha },
      headers: { Origin: amb.base }
    });
    assert.equal(mesma.status, 200);
  });
});

test('limite de tentativas de login (força bruta)', async (t) => {
  const amb = await criarAmbiente({ limites: { login: { janelaMs: 60000, max: 3 } } });
  t.after(amb.encerrar);
  const usuario = await amb.cadastrar('Alvo Forca');

  for (let i = 0; i < 3; i += 1) {
    const r = await amb.chamar('POST', '/api/login', { corpo: { email: usuario.email, senha: 'errada-errada' } });
    assert.equal(r.status, 401);
  }
  const bloqueada = await amb.chamar('POST', '/api/login', { corpo: { email: usuario.email, senha: usuario.senha } });
  assert.equal(bloqueada.status, 429);
  assert.ok(bloqueada.headers.get('retry-after'));
});

// ---------------------------------------------------------------- perfil e ranking
test('perfil e ranking', async (t) => {
  const amb = await criarAmbiente();
  t.after(amb.encerrar);

  const ana = await amb.novoJogador('Ana');
  const bia = await amb.novoJogador('Bia');
  const caio = await amb.novoJogador('Caio');
  const duda = await amb.novoJogador('Duda');
  await amb.banco.execute('UPDATE usuarios SET pontos = 500, vitorias = 5, derrotas = 1 WHERE id = ?', [ana.id]);
  await amb.banco.execute('UPDATE usuarios SET pontos = 500, vitorias = 7, derrotas = 2 WHERE id = ?', [bia.id]);
  await amb.banco.execute('UPDATE usuarios SET pontos = 900, vitorias = 9, derrotas = 0 WHERE id = ?', [caio.id]);

  await t.test('ranking ordenado por pontos, depois vitórias, depois antiguidade; sem dados sensíveis', async () => {
    const r = await amb.chamar('GET', '/api/ranking', { cookie: ana.cookie });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.ranking.map((j) => j.nome), ['Caio', 'Bia', 'Ana', 'Duda']);
    assert.deepEqual(r.json.ranking.map((j) => j.posicao), [1, 2, 3, 4]);
    for (const jogador of r.json.ranking) {
      assert.deepEqual(Object.keys(jogador).sort(), ['derrotas', 'nome', 'pontos', 'posicao', 'vitorias']);
    }
  });

  await t.test('posição do perfil bate com a posição no ranking (inclusive em empates)', async () => {
    const ranking = (await amb.chamar('GET', '/api/ranking', { cookie: ana.cookie })).json.ranking;
    for (const jogador of [ana, bia, caio, duda]) {
      const perfil = (await amb.chamar('GET', '/api/perfil', { cookie: jogador.cookie })).json.usuario;
      const noRanking = ranking.find((r) => r.nome === jogador.nome);
      assert.equal(perfil.posicao, noRanking.posicao, jogador.nome);
    }
  });
});

// ---------------------------------------------------------------- torneios
test('torneios, inscrições, resumo e histórico', async (t) => {
  const amb = await criarAmbiente();
  t.after(amb.encerrar);
  const inserir = (nome, vagas, status = 'aberto', inicio = null) =>
    amb.banco.execute(
      'INSERT INTO torneios (nome, descricao, vagas, inicio, premiacao, status) VALUES (?, ?, ?, ?, ?, ?)',
      [nome, `Descrição de ${nome}`, vagas, inicio, 'pontos', status]
    ).then(([r]) => r.insertId);

  const aberto = await inserir('Torneio Aberto', 2, 'aberto', '2026-12-01');
  const pequeno = await inserir('Torneio Pequeno', 1, 'aberto');
  const embreve = await inserir('Torneio Em Breve', 8, 'em_breve');
  const fechado = await inserir('Torneio Encerrado', 8, 'encerrado');

  const ana = await amb.novoJogador('Ana');
  const bia = await amb.novoJogador('Bia');
  const caio = await amb.novoJogador('Caio');

  await t.test('lista torneios com contagem de inscritos, ordenados por status', async () => {
    const r = await amb.chamar('GET', '/api/torneios', { cookie: ana.cookie });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.torneios.map((x) => x.nome), ['Torneio Aberto', 'Torneio Pequeno', 'Torneio Em Breve', 'Torneio Encerrado']);
    assert.equal(r.json.torneios[0].inicio, '2026-12-01');
    assert.equal(r.json.torneios[0].inscritos, 0);
    assert.equal(r.json.torneios[0].inscrito, false);
  });

  await t.test('inscrição: sucesso, repetida, inválida, inexistente, fechada', async () => {
    const ok = await amb.chamar('POST', `/api/torneios/${aberto}/inscricao`, { cookie: ana.cookie });
    assert.equal(ok.status, 201);
    assert.equal(ok.json.inscritos, 1);

    assert.equal((await amb.chamar('POST', `/api/torneios/${aberto}/inscricao`, { cookie: ana.cookie })).status, 409);
    assert.equal((await amb.chamar('POST', '/api/torneios/abc/inscricao', { cookie: ana.cookie })).status, 400);
    assert.equal((await amb.chamar('POST', '/api/torneios/0/inscricao', { cookie: ana.cookie })).status, 400);
    assert.equal((await amb.chamar('POST', '/api/torneios/9999/inscricao', { cookie: ana.cookie })).status, 404);
    assert.equal((await amb.chamar('POST', `/api/torneios/${embreve}/inscricao`, { cookie: ana.cookie })).status, 409);
    assert.equal((await amb.chamar('POST', `/api/torneios/${fechado}/inscricao`, { cookie: ana.cookie })).status, 409);
    assert.equal((await amb.chamar('POST', `/api/torneios/${aberto}/inscricao`)).status, 401);

    const lista = (await amb.chamar('GET', '/api/torneios', { cookie: ana.cookie })).json.torneios;
    const doAberto = lista.find((x) => x.id === aberto);
    assert.equal(doAberto.inscritos, 1);
    assert.equal(doAberto.inscrito, true);
    const paraBia = (await amb.chamar('GET', '/api/torneios', { cookie: bia.cookie })).json.torneios.find((x) => x.id === aberto);
    assert.equal(paraBia.inscrito, false);
  });

  await t.test('não passa do limite de vagas', async () => {
    assert.equal((await amb.chamar('POST', `/api/torneios/${pequeno}/inscricao`, { cookie: ana.cookie })).status, 201);
    const cheio = await amb.chamar('POST', `/api/torneios/${pequeno}/inscricao`, { cookie: bia.cookie });
    assert.equal(cheio.status, 409);
    assert.match(cheio.json.mensagem, /vagas/i);

    await amb.chamar('POST', `/api/torneios/${aberto}/inscricao`, { cookie: bia.cookie }); // 2/2
    const lotado = await amb.chamar('POST', `/api/torneios/${aberto}/inscricao`, { cookie: caio.cookie });
    assert.equal(lotado.status, 409);
  });

  await t.test('cancelar inscrição libera a vaga; cancelar sem estar inscrito → 404', async () => {
    assert.equal((await amb.chamar('DELETE', `/api/torneios/${aberto}/inscricao`, { cookie: bia.cookie })).status, 200);
    assert.equal((await amb.chamar('DELETE', `/api/torneios/${aberto}/inscricao`, { cookie: bia.cookie })).status, 404);
    assert.equal((await amb.chamar('POST', `/api/torneios/${aberto}/inscricao`, { cookie: caio.cookie })).status, 201);
    assert.equal((await amb.chamar('DELETE', `/api/torneios/${embreve}/inscricao`, { cookie: ana.cookie })).status, 409);
    assert.equal((await amb.chamar('DELETE', '/api/torneios/9999/inscricao', { cookie: ana.cookie })).status, 404);
  });

  await t.test('resumo e histórico de partidas refletem o banco', async () => {
    let resumo = (await amb.chamar('GET', '/api/resumo', { cookie: ana.cookie })).json;
    assert.equal(resumo.torneiosAbertos, 2);
    assert.equal(resumo.jogadoresInscritos, 2); // Ana e Caio
    assert.equal(resumo.partidasConcluidas, 0);
    assert.deepEqual((await amb.chamar('GET', '/api/partidas', { cookie: ana.cookie })).json.partidas, []);

    await amb.banco.execute(
      'INSERT INTO partidas (torneio_id, vencedor_id, perdedor_id, placar_vencedor, placar_perdedor, fase) VALUES (?, ?, ?, 2, 1, ?)',
      [aberto, ana.id, bia.id, 'Final']
    );
    resumo = (await amb.chamar('GET', '/api/resumo', { cookie: ana.cookie })).json;
    assert.equal(resumo.partidasConcluidas, 1);
    const partidas = (await amb.chamar('GET', '/api/partidas', { cookie: ana.cookie })).json.partidas;
    assert.deepEqual(partidas[0], {
      id: partidas[0].id, vencedor: 'Ana', perdedor: 'Bia', placarVencedor: 2, placarPerdedor: 1, fase: 'Final', torneio: 'Torneio Aberto'
    });
  });
});

// ---------------------------------------------------------------- desafios
test('desafios entre jogadores', async (t) => {
  const amb = await criarAmbiente();
  t.after(amb.encerrar);
  const ana = await amb.novoJogador('Ana');
  const bia = await amb.novoJogador('Bia');
  const caio = await amb.novoJogador('Caio');
  const desafiar = (jogador, oponente) => amb.chamar('POST', '/api/desafios', { cookie: jogador.cookie, corpo: { oponente } });
  let desafioId;

  await t.test('validações: vazio, inexistente, a si mesmo, sem login', async () => {
    assert.equal((await desafiar(ana, '')).status, 400);
    assert.equal((await desafiar(ana, 'Ninguém Aqui')).status, 404);
    assert.equal((await desafiar(ana, 'ana')).status, 400);
    assert.equal((await amb.chamar('POST', '/api/desafios', { corpo: { oponente: 'Bia' } })).status, 401);
  });

  await t.test('cria desafio (nome sem diferenciar maiúsculas) e bloqueia duplicado pendente nos dois sentidos', async () => {
    const r = await desafiar(ana, 'bIA');
    assert.equal(r.status, 201);
    desafioId = r.json.desafio.id;
    assert.equal((await desafiar(ana, 'Bia')).status, 409);
    assert.equal((await desafiar(bia, 'Ana')).status, 409);
  });

  await t.test('lista mostra direção enviado/recebido e não vaza desafios de terceiros', async () => {
    const deAna = (await amb.chamar('GET', '/api/desafios', { cookie: ana.cookie })).json.desafios;
    const deBia = (await amb.chamar('GET', '/api/desafios', { cookie: bia.cookie })).json.desafios;
    const deCaio = (await amb.chamar('GET', '/api/desafios', { cookie: caio.cookie })).json.desafios;
    assert.equal(deAna[0].direcao, 'enviado');
    assert.equal(deBia[0].direcao, 'recebido');
    assert.deepEqual([deAna[0].desafiante, deAna[0].desafiado, deAna[0].status], ['Ana', 'Bia', 'pendente']);
    assert.equal(deCaio.length, 0);
  });

  await t.test('só o desafiado responde, uma única vez, com ação válida', async () => {
    const patch = (jogador, acao) => amb.chamar('PATCH', `/api/desafios/${desafioId}`, { cookie: jogador.cookie, corpo: { acao } });
    assert.equal((await patch(bia, 'talvez')).status, 400);
    assert.equal((await patch(ana, 'aceitar')).status, 404, 'quem desafiou não pode aceitar');
    assert.equal((await patch(caio, 'aceitar')).status, 404, 'terceiro não pode aceitar');
    const ok = await patch(bia, 'aceitar');
    assert.equal(ok.status, 200);
    assert.equal(ok.json.status, 'aceito');
    assert.equal((await patch(bia, 'recusar')).status, 409);
    assert.equal((await amb.chamar('PATCH', '/api/desafios/abc', { cookie: bia.cookie, corpo: { acao: 'aceitar' } })).status, 400);
  });

  await t.test('depois de respondido, é possível desafiar de novo', async () => {
    assert.equal((await desafiar(bia, 'Ana')).status, 201);
  });

  await t.test('nome repetido entre jogadores → 409 (ambíguo)', async () => {
    await amb.cadastrar('Clone', 'clone1@teste.com');
    await amb.cadastrar('Clone', 'clone2@teste.com');
    const r = await desafiar(ana, 'Clone');
    assert.equal(r.status, 409);
  });
});

test('limite de criação de desafios', async (t) => {
  const amb = await criarAmbiente({ limites: { desafios: { janelaMs: 60000, max: 2 } } });
  t.after(amb.encerrar);
  const ana = await amb.novoJogador('Ana');
  await amb.cadastrar('Bia');
  const enviar = () => amb.chamar('POST', '/api/desafios', { cookie: ana.cookie, corpo: { oponente: 'Bia' } });
  assert.equal((await enviar()).status, 201);
  assert.equal((await enviar()).status, 409);
  assert.equal((await enviar()).status, 429);
});

// ---------------------------------------------------------------- banco indisponível / desatualizado
test('falhas do banco viram respostas 503 claras (sem derrubar o servidor)', async (t) => {
  const falha = (code) => async () => { const e = new Error(`falha ${code}`); e.code = code; throw e; };
  const ambFora = await criarAmbiente({ db: { execute: falha('ECONNREFUSED'), query: falha('ECONNREFUSED'), getConnection: falha('ECONNREFUSED') } });
  const ambAntigo = await criarAmbiente({ db: { execute: falha('ER_NO_SUCH_TABLE'), query: falha('ER_NO_SUCH_TABLE'), getConnection: falha('ER_NO_SUCH_TABLE') } });
  t.after(async () => { await ambFora.encerrar(); await ambAntigo.encerrar(); });

  const status = await ambFora.chamar('GET', '/api/status');
  assert.equal(status.status, 503);
  assert.equal(status.json.status, 'parcial');

  const login = await ambFora.chamar('POST', '/api/login', { corpo: { email: 'a@a.com', senha: '12345678' } });
  assert.equal(login.status, 503);
  assert.match(login.json.mensagem, /indispon/i);

  const cadastro = await ambAntigo.chamar('POST', '/api/usuarios', { corpo: { nome: 'Teste', email: 'a@a.com', senha: '12345678' } });
  assert.equal(cadastro.status, 503);
  assert.match(cadastro.json.mensagem, /db:preparar/);
});

test('/api/status com banco ok e rota inexistente da API', async (t) => {
  const amb = await criarAmbiente();
  t.after(amb.encerrar);
  assert.equal((await amb.chamar('GET', '/api/status')).status, 200);
  const jogador = await amb.novoJogador('Rota');
  const r = await amb.chamar('GET', '/api/nao-existe', { cookie: jogador.cookie });
  assert.equal(r.status, 404);
  assert.ok(r.json.mensagem);
});

test('fonte Phoenix Gaming opcional: CSS é gerado quando o arquivo existe', async (t) => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'ra-public-'));
  for (const sub of ['css', 'js', 'img', 'fonts', 'pages']) fs.mkdirSync(path.join(pasta, sub));
  fs.writeFileSync(path.join(pasta, 'fonts', 'PhoenixGaming.woff2'), 'x');
  const amb = await criarAmbiente({ pastaPublica: pasta });
  t.after(async () => { await amb.encerrar(); fs.rmSync(pasta, { recursive: true, force: true }); });

  const r = await amb.chamar('GET', '/css/fonte-titulos.css');
  assert.match(r.texto, /font-family:"Phoenix Gaming"/);
  assert.match(r.texto, /PhoenixGaming\.woff2/);
});
