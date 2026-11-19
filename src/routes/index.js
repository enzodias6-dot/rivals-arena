'use strict';

const express = require('express');

const { verificarOrigem } = require('../middlewares/seguranca');
const { executar } = require('../utils/supabase');
const { criarRotasAutenticacao } = require('./autenticacao');
const { criarRotasJogadores } = require('./jogadores');
const { criarRotasTorneios } = require('./torneios');
const { criarRotasDesafios } = require('./desafios');
const { criarRotasTimes } = require('./times');
const { criarRotasArsenal } = require('./arsenal');
const { criarRotasPartidas } = require('./partidas');

function criarRotasApi(contexto) {
  const { config, auth, criarCliente } = contexto;
  const router = express.Router();

  router.use(verificarOrigem);

  router.get('/status', async (req, res) => {
    await executar(criarCliente().from('vw_ranking_publico').select('nome').limit(1));
    return res.json({ status: 'ok', mensagem: 'API do Rivals Arena funcionando e Supabase acessível.' });
  });

  router.use(criarRotasAutenticacao(contexto));

  router.use(auth.autenticar);
  router.use(criarRotasJogadores());
  router.use(criarRotasTorneios(contexto));
  router.use(criarRotasDesafios(contexto));
  router.use(criarRotasTimes());
  router.use(criarRotasArsenal());
  router.use(criarRotasPartidas());

  router.use((req, res) => res.status(404).json({ mensagem: 'Rota da API não encontrada.' }));

  return router;
}

module.exports = { criarRotasApi };
