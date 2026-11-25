'use strict';

const fs = require('node:fs');
const path = require('node:path');
const express = require('express');

const { criarClienteSupabase, criarClienteSupabaseAdmin } = require('./config/supabase');
const { criarAuth } = require('./middlewares/auth');
const { cabecalhosSeguranca } = require('./middlewares/seguranca');
const { criarRotasApi } = require('./routes');

const FONTES_TITULOS = [
  ['PhoenixGaming.woff2', 'woff2'],
  ['PhoenixGaming.woff', 'woff'],
  ['PhoenixGaming.ttf', 'truetype'],
  ['PhoenixGaming.otf', 'opentype']
];

/**
 * Recebe a fábrica do cliente para que a aplicação possa ser testada sem Supabase.
 */
function criarApp({
  config,
  criarCliente = (accessToken) => criarClienteSupabase(config, accessToken),
  criarClienteAdmin = config.supabaseServiceRoleKey
    ? () => criarClienteSupabaseAdmin(config)
    : null
}) {
  const app = express();
  const auth = criarAuth(config, criarCliente);
  const pasta = config.pastaPublica;
  // "root" evita que o Express recuse (404) o arquivo quando o projeto está dentro de uma pasta oculta (nome iniciado por ".").
  const enviarPagina = (res, arquivo, status = 200) => res.status(status).sendFile(arquivo, { root: pasta });

  app.disable('x-powered-by');
  if (config.confiarProxy) app.set('trust proxy', config.confiarProxy);

  app.use(cabecalhosSeguranca);
  app.use(express.json({ limit: '20kb' }));

  // ---- API ----
  app.use('/api', criarRotasApi({ config, auth, criarCliente, criarClienteAdmin }));

  // ---- Arquivos públicos (necessários para a tela de acesso) ----
  // A fonte Phoenix Gaming é opcional: o CSS dela só é gerado se o arquivo existir em public/fonts.
  app.get('/css/fonte-titulos.css', (req, res) => {
    const fonte = FONTES_TITULOS.find(([arquivo]) => fs.existsSync(path.join(pasta, 'fonts', arquivo)));
    res.type('text/css').set('Cache-Control', 'no-cache');
    res.send(fonte
      ? `@font-face{font-family:"Phoenix Gaming";src:url("../fonts/${fonte[0]}") format("${fonte[1]}");font-weight:100 900;font-display:swap}`
      : '/* Phoenix Gaming não encontrada em public/fonts: os títulos usam Montserrat. */');
  });

  app.use('/css', express.static(path.join(pasta, 'css'), { index: false }));
  app.use('/js', express.static(path.join(pasta, 'js'), { index: false }));
  app.use('/img', express.static(path.join(pasta, 'img'), { index: false, maxAge: '7d' }));
  app.use('/fonts', express.static(path.join(pasta, 'fonts'), { index: false, maxAge: '7d' }));
  app.get('/favicon.ico', (req, res) => res.redirect(301, '/img/logo.png'));

  // Arquivo público que não existe: 404 de verdade (antes redirecionava para uma página HTML).
  app.use(['/css', '/js', '/img', '/fonts'], (req, res) => {
    res.status(404).type('text/plain').send('Arquivo não encontrado.');
  });

  app.get(['/acesso.html', '/acesso', '/login'], (req, res, next) => {
    auth.sessaoValida(req, res).then((valida) => {
      if (valida) return res.redirect('/');
      return enviarPagina(res, 'acesso.html');
    }).catch(next);
  });

  // ---- Área protegida: tudo abaixo exige sessão ----
  app.use((req, res, next) => {
    auth.sessaoValida(req, res).then((valida) => {
      if (!valida) return res.redirect('/acesso.html');
      res.set('Cache-Control', 'no-store');
      return next();
    }).catch(next);
  });

  app.get(['/', '/central.html', '/index.html'], (req, res) => enviarPagina(res, 'index.html'));
  app.use('/pages', express.static(path.join(pasta, 'pages'), { index: false }));

  // ---- Rotas não encontradas ----
  app.use((req, res) => {
    const extensao = path.extname(req.path);
    if (extensao && extensao !== '.html') return res.status(404).type('text/plain').send('Arquivo não encontrado.');
    return enviarPagina(res, '404.html', 404);
  });

  // ---- Tratamento central de erros ----
  // eslint-disable-next-line no-unused-vars
  app.use((erro, req, res, next) => {
    if (res.headersSent) return next(erro);

    let status = 500;
    let mensagem = 'Erro interno do servidor. Tente novamente em instantes.';

    if (erro.type === 'entity.parse.failed') {
      status = 400;
      mensagem = 'O corpo da requisição não é um JSON válido.';
    } else if (erro.type === 'entity.too.large') {
      status = 413;
      mensagem = 'Requisição grande demais.';
    } else if (erro.code === '42501' || erro.status === 403) {
      status = 403;
      mensagem = 'A operação foi bloqueada pelas políticas de acesso do Supabase.';
    } else if (['42P01', '42703', '42883', 'PGRST202', 'PGRST205'].includes(erro.code)) {
      status = 503;
      mensagem = 'O schema do Supabase ainda não contém uma estrutura necessária para esta funcionalidade.';
    } else if (erro.status === 429) {
      status = 429;
      mensagem = 'Supabase limitou temporariamente as requisições. Aguarde e tente novamente.';
    } else if (erro.name === 'AuthRetryableFetchError' ||
               (erro.name === 'TypeError' && /fetch failed|network/i.test(erro.message || '')) ||
               (Number.isInteger(erro.status) && erro.status >= 500) ||
               ['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT'].includes(erro.code)) {
      status = 503;
      mensagem = 'Supabase indisponível. Confira a conexão e as variáveis de ambiente.';
    } else {
      console.error(`Erro em ${req.method} ${req.path}:`, erro.code || erro.message || erro.name || 'erro desconhecido');
    }

    if (status === 503) console.error(`Supabase: ${erro.code || erro.name || 'erro de conexão'}`);

    if (req.path.startsWith('/api')) return res.status(status).json({ mensagem });
    return res.status(status).type('text/plain').send(mensagem);
  });

  return app;
}

module.exports = { criarApp };
