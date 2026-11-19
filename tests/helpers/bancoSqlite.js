'use strict';

/**
 * Banco SQLite em memória que imita a interface do pool do mysql2 (execute, query, getConnection).
 * Serve apenas para os testes automatizados rodarem sem um servidor MySQL.
 * A estrutura abaixo espelha database/schema.sql (sem os detalhes específicos do MySQL).
 */
const { DatabaseSync } = require('node:sqlite');

const ESTRUTURA = `
PRAGMA foreign_keys = ON;
CREATE TABLE usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  senha TEXT NOT NULL,
  pontos INTEGER NOT NULL DEFAULT 0,
  vitorias INTEGER NOT NULL DEFAULT 0,
  derrotas INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE torneios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE,
  descricao TEXT NOT NULL,
  formato TEXT NOT NULL DEFAULT 'eliminação simples',
  vagas INTEGER NOT NULL,
  inicio TEXT NULL,
  premiacao TEXT NULL,
  status TEXT NOT NULL DEFAULT 'aberto'
);
CREATE TABLE inscricoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  torneio_id INTEGER NOT NULL REFERENCES torneios (id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (torneio_id, usuario_id)
);
CREATE TABLE desafios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  desafiante_id INTEGER NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  desafiado_id INTEGER NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pendente',
  criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  respondido_em TEXT NULL
);
CREATE TABLE partidas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  torneio_id INTEGER NULL REFERENCES torneios (id) ON DELETE SET NULL,
  vencedor_id INTEGER NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  perdedor_id INTEGER NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  placar_vencedor INTEGER NOT NULL DEFAULT 0,
  placar_perdedor INTEGER NOT NULL DEFAULT 0,
  fase TEXT NULL,
  criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`;

function traduzirErro(erro) {
  const mensagem = String(erro.message || '');
  if (mensagem.includes('UNIQUE constraint failed')) erro.code = 'ER_DUP_ENTRY';
  else if (mensagem.includes('FOREIGN KEY constraint failed')) erro.code = 'ER_NO_REFERENCED_ROW_2';
  return erro;
}

function criarBancoSqlite() {
  const banco = new DatabaseSync(':memory:');
  banco.exec(ESTRUTURA);

  function rodar(sql, parametros = []) {
    const consulta = sql.replace(/\s+FOR UPDATE\b/i, ''); // SQLite não tem FOR UPDATE
    try {
      const comando = banco.prepare(consulta);
      if (/^\s*(select|with)\b/i.test(consulta)) return [comando.all(...parametros)];
      const resultado = comando.run(...parametros);
      return [{ insertId: Number(resultado.lastInsertRowid), affectedRows: Number(resultado.changes) }];
    } catch (erro) {
      throw traduzirErro(erro);
    }
  }

  const api = {
    execute: async (sql, parametros) => rodar(sql, parametros),
    query: async (sql, parametros) => rodar(sql, parametros),
    getConnection: async () => ({
      execute: api.execute,
      query: api.query,
      beginTransaction: async () => banco.exec('BEGIN'),
      commit: async () => banco.exec('COMMIT'),
      rollback: async () => banco.exec('ROLLBACK'),
      release: () => {}
    }),
    end: async () => banco.close(),
    bruto: banco
  };

  return api;
}

module.exports = { criarBancoSqlite };
