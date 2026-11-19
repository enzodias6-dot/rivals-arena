'use strict';

/**
 * Sobe o site completo com um banco SQLite em memória (sem MySQL), já com os torneios iniciais.
 * Útil para testar as telas no navegador: node tests/helpers/servidor-teste.js [porta]
 */
const { carregarConfig } = require('../../src/config/env');
const { criarApp } = require('../../src/app');
const { criarBancoSqlite } = require('./bancoSqlite');

const porta = Number(process.argv[2]) || 3100;
const db = criarBancoSqlite();
const config = {
  ...carregarConfig({}),
  jwtSecret: 'segredo-somente-para-testes-0123456789-abcdefghij',
  bcryptRounds: 4
};

db.bruto.exec(`
  INSERT INTO torneios (nome, descricao, formato, vagas, inicio, premiacao, status) VALUES
   ('Rivals Solo Open', 'O torneio principal para jogadores que querem conquistar seu lugar na arena.', 'eliminação simples', 16, '2026-11-02', 'pontos no ranking', 'aberto'),
   ('Zombie Trials 1V1', 'Uma disputa rápida para testar habilidade, estratégia e consistência.', 'eliminação simples', 8, '2026-11-05', 'destaque no perfil', 'aberto'),
   ('Arena Night Clash', 'Uma nova chave individual será aberta quando as inscrições forem liberadas.', 'eliminação simples', 32, NULL, NULL, 'em_breve');
`);

criarApp({ db, config }).listen(porta, () => console.log(`Servidor de teste em http://localhost:${porta}`));
