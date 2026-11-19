'use strict';

/**
 * Sobe a aplicação com um Supabase em memória para revisar a interface sem credenciais reais.
 * Uso: node tests/helpers/servidor-teste.js [porta]
 */
const { randomUUID } = require('node:crypto');
const { carregarConfig } = require('../../src/config/env');
const { criarApp } = require('../../src/app');
const { criarSupabaseFake } = require('./supabaseFake');

const porta = Number(process.argv[2]) || 3100;
const supabase = criarSupabaseFake();
const config = {
  ...carregarConfig({}),
  supabaseUrl: 'https://rivals-arena.test.supabase.co',
  supabaseAnonKey: 'sb_publishable_fake-key-for-local-ui',
  limites: {
    login: { janelaMs: 60000, max: 1000 },
    cadastro: { janelaMs: 60000, max: 1000 },
    desafios: { janelaMs: 60000, max: 1000 }
  }
};

supabase.seed('campeonatos', {
  id: randomUUID(),
  nome: 'Rivals Solo Open',
  descricao: 'O torneio principal para jogadores que querem conquistar seu lugar na arena.',
  formato: 'eliminação simples',
  max_participantes: 16,
  inicio_em: '2026-12-02',
  premio: 'pontos no ranking',
  status: 'aberto'
});
supabase.seed('campeonatos', {
  id: randomUUID(),
  nome: 'Arena Night Clash',
  descricao: 'Uma nova chave individual será aberta quando as inscrições forem liberadas.',
  formato: 'eliminação simples',
  max_participantes: 32,
  inicio_em: null,
  premio: null,
  status: 'em_breve'
});

criarApp({ config, criarCliente: supabase.criarCliente })
  .listen(porta, () => console.log(`Servidor de teste em http://localhost:${porta}`));
