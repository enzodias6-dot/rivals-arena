'use strict';

const mysql = require('mysql2/promise');

/**
 * Cria o pool de conexões MySQL.
 * dateStrings evita que colunas DATE virem objetos Date (e mudem de dia por fuso horário).
 */
function criarPool(banco) {
  return mysql.createPool({
    host: banco.host,
    port: banco.port,
    user: banco.user,
    password: banco.password,
    database: banco.database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 10000,
    dateStrings: ['DATE']
  });
}

module.exports = { criarPool };
