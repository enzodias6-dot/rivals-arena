'use strict';

const { carregarConfig, validarSegredoJwt } = require('./src/config/env');
const { criarPool } = require('./src/config/db');
const { criarApp } = require('./src/app');

const config = carregarConfig();

const erroSegredo = validarSegredoJwt(config.jwtSecret);
if (erroSegredo) {
  console.error(`\n[ERRO DE CONFIGURAÇÃO] ${erroSegredo}`);
  console.error('Copie .env.example para .env e preencha os valores (veja o README.md).\n');
  process.exit(1);
}

const db = criarPool(config.banco);
const app = criarApp({ db, config });

async function verificarBanco() {
  try {
    await db.query('SELECT 1');
  } catch (erro) {
    console.warn(`Banco de dados indisponível (${erro.code || erro.message}).`);
    console.warn('O site abre, mas cadastro, login e ranking só funcionam com o MySQL conectado. Confira o .env.');
    return;
  }

  try {
    await db.query('SELECT id, nome, email, senha, pontos, vitorias, derrotas FROM usuarios LIMIT 1');
    await db.query('SELECT 1 FROM torneios, inscricoes, desafios, partidas LIMIT 1');
    console.log('Banco de dados conectado.');
  } catch (erro) {
    console.warn(`Banco conectado, mas a estrutura está incompleta (${erro.code || erro.message}).`);
    console.warn('Rode "npm run db:preparar" para criar/atualizar as tabelas.');
  }
}

const servidor = app.listen(config.porta, () => {
  console.log(`Rivals Arena disponível em http://localhost:${config.porta}`);
  verificarBanco();
});

function encerrar() {
  servidor.close(() => db.end().finally(() => process.exit(0)));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
