'use strict';

const express = require('express');

const { verificarOrigem } = require('../middlewares/seguranca');
const { criarRotasAutenticacao } = require('./autenticacao');
const { criarRotasJogadores } = require('./jogadores');
const { criarRotasTorneios } = require('./torneios');
const { criarRotasDesafios } = require('./desafios');

/** Monta toda a API (/api). Rotas abaixo de "auth.autenticar" exigem sessão. */
function criarRotasApi(contexto) {
  const { db, auth } = contexto;
  const router = express.Router();

  router.use(verificarOrigem);

  router.get('/status', async (req, res) => {
    try {
      await db.query('SELECT 1');
      return res.json({ status: 'ok', mensagem: 'API do Rivals Arena funcionando e banco acessível.' });
    } catch (erro) {
      console.error('Banco indisponível:', erro.code || erro.message);
      return res.status(503).json({
        status: 'parcial',
        mensagem: 'API funcionando, mas o banco de dados não está acessível.'
      });
    }
  });

  router.use(criarRotasAutenticacao(contexto));

  router.use(auth.autenticar);
  router.use(criarRotasJogadores(contexto));
  router.use(criarRotasTorneios(contexto));
  router.use(criarRotasDesafios(contexto));

  router.use((req, res) => res.status(404).json({ mensagem: 'Rota da API não encontrada.' }));

  return router;
}

module.exports = { criarRotasApi };
