'use strict';

// Gera um valor aleatório e seguro para o JWT_SECRET do arquivo .env.
const crypto = require('node:crypto');

console.log(crypto.randomBytes(48).toString('hex'));
