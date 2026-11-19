'use strict';

const path = require('node:path');

const RAIZ = path.join(__dirname, '..', '..');
require('dotenv').config({ path: path.join(RAIZ, '.env'), quiet: true });

const TERMOS_DE_EXEMPLO = ['troque-esta-chave', 'troque', 'changeme', 'change-me', 'cole-aqui'];

/** Retorna uma mensagem de erro se o segredo do JWT não for seguro; null se estiver ok. */
function validarSegredoJwt(segredo) {
  if (!segredo) return 'JWT_SECRET não está definido no arquivo .env.';
  if (segredo.length < 32) {
    return `JWT_SECRET tem apenas ${segredo.length} caracteres. Use pelo menos 32 (rode "npm run segredo").`;
  }
  const minusculo = segredo.toLowerCase();
  if (TERMOS_DE_EXEMPLO.some((termo) => minusculo.includes(termo))) {
    return 'JWT_SECRET ainda está com o valor de exemplo. Gere um novo com "npm run segredo".';
  }
  return null;
}

function lerInteiroPositivo(valor, padrao) {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? numero : padrao;
}

function lerProxy(valor) {
  if (!valor) return false;
  if (valor === 'true') return true;
  const numero = Number(valor);
  return Number.isInteger(numero) ? numero : valor;
}

function carregarConfig(env = process.env) {
  return {
    raiz: RAIZ,
    pastaPublica: path.join(RAIZ, 'public'),
    producao: env.NODE_ENV === 'production',
    porta: lerInteiroPositivo(env.PORT, 3000),
    confiarProxy: lerProxy(env.TRUST_PROXY),
    jwtSecret: env.JWT_SECRET || '',
    nomeCookie: 'ra_session',
    sessaoHoras: 2,
    bcryptRounds: lerInteiroPositivo(env.BCRYPT_ROUNDS, 12),
    limites: {
      login: { janelaMs: 15 * 60 * 1000, max: 10 },
      cadastro: { janelaMs: 60 * 60 * 1000, max: 10 },
      desafios: { janelaMs: 60 * 1000, max: 20 }
    },
    banco: {
      host: env.DB_HOST || '127.0.0.1',
      port: lerInteiroPositivo(env.DB_PORT, 3306),
      user: env.DB_USER || 'root',
      password: env.DB_PASSWORD || '',
      database: env.DB_NAME || 'rivals_arena'
    }
  };
}

module.exports = { carregarConfig, validarSegredoJwt };
