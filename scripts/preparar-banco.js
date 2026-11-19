'use strict';

/**
 * Cria/atualiza o banco do Rivals Arena usando as credenciais do .env.
 * Seguro para rodar mais de uma vez: só cria o que falta e nunca apaga dados.
 *
 * Uso: npm run db:preparar
 */
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');

const { carregarConfig } = require('../src/config/env');

const config = carregarConfig();
const { database, ...conexaoSemBanco } = config.banco;
const lerSql = (nome) => fs.readFileSync(path.join(config.raiz, 'database', nome), 'utf8');

const COLUNAS_DE_USUARIOS = [
  ['pontos', 'INT NOT NULL DEFAULT 0'],
  ['vitorias', 'INT UNSIGNED NOT NULL DEFAULT 0'],
  ['derrotas', 'INT UNSIGNED NOT NULL DEFAULT 0']
];

async function principal() {
  if (!/^[A-Za-z0-9_]+$/.test(database)) {
    throw new Error(`DB_NAME inválido: "${database}". Use apenas letras, números e "_".`);
  }

  console.log(`Conectando ao MySQL em ${conexaoSemBanco.host}:${conexaoSemBanco.port} como "${conexaoSemBanco.user}"...`);
  const servidor = await mysql.createConnection(conexaoSemBanco);
  await servidor.query(
    `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await servidor.end();

  const conexao = await mysql.createConnection({ ...config.banco, multipleStatements: true });

  try {
    // Em bancos antigos, as chaves estrangeiras precisam do mesmo tipo da coluna usuarios.id.
    let tipoIdUsuario = 'INT UNSIGNED';
    const [existente] = await conexao.query(
      `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'id'`,
      [database]
    );
    if (existente.length) tipoIdUsuario = existente[0].COLUMN_TYPE;

    const schema = lerSql('schema.sql')
      .split('\n')
      .map((linha) => (linha.includes('fk_usuario') ? linha.replace('INT UNSIGNED', tipoIdUsuario) : linha))
      .join('\n');
    await conexao.query(schema);
    console.log('Tabelas verificadas/criadas.');

    for (const [coluna, definicao] of COLUNAS_DE_USUARIOS) {
      const [achou] = await conexao.query(
        `SELECT 1 FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = ?`,
        [database, coluna]
      );
      if (!achou.length) {
        await conexao.query(`ALTER TABLE usuarios ADD COLUMN \`${coluna}\` ${definicao}`);
        console.log(`Coluna usuarios.${coluna} adicionada.`);
      }
    }

    const [[contagem]] = await conexao.query('SELECT COUNT(*) AS total FROM torneios');
    if (Number(contagem.total) === 0) {
      await conexao.query(lerSql('dados-iniciais.sql'));
      console.log('Torneios iniciais inseridos (revise as datas em database/dados-iniciais.sql).');
    }
  } finally {
    await conexao.end();
  }

  console.log(`Banco "${database}" pronto. Agora rode: npm start`);
}

principal().catch((erro) => {
  console.error(`\nNão foi possível preparar o banco: ${erro.code || ''} ${erro.message}`);
  console.error('Confira DB_HOST, DB_PORT, DB_USER e DB_PASSWORD no arquivo .env e se o MySQL está em execução.');
  process.exit(1);
});
