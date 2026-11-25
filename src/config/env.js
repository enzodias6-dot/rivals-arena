'use strict';

const path = require('node:path');

const RAIZ = path.join(__dirname, '..', '..');
require('dotenv').config({ path: path.join(RAIZ, '.env'), quiet: true });

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
    supabaseUrl: env.SUPABASE_URL || '',
    supabaseAnonKey: env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || '',
    // Segredo exclusivo do servidor; nunca deve ser usado no navegador.
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY || '',
    banco: {
      host: env.DB_HOST || '127.0.0.1',
      port: lerInteiroPositivo(env.DB_PORT, 3306),
      user: env.DB_USER || 'root',
      password: env.DB_PASSWORD || '',
      database: env.DB_NAME || 'rivals_arena'
    },
    nomeCookie: 'ra_session',
    limites: {
      login: { janelaMs: 15 * 60 * 1000, max: 10 },
      cadastro: { janelaMs: 60 * 60 * 1000, max: 10 },
      desafios: { janelaMs: 60 * 1000, max: 20 }
    }
  };
}

function validarConfigSupabase(url, chave) {
  if (!url) return 'SUPABASE_URL não está definido no arquivo .env.';
  if (!chave) return 'Defina SUPABASE_ANON_KEY ou SUPABASE_PUBLISHABLE_KEY no arquivo .env.';

  let endereco;
  try {
    endereco = new URL(url);
  } catch (erro) {
    return 'SUPABASE_URL não é uma URL válida.';
  }

  if (!['https:', 'http:'].includes(endereco.protocol) ||
      (endereco.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(endereco.hostname))) {
    return 'SUPABASE_URL deve usar HTTPS (HTTP só é permitido em localhost).';
  }

  if (/^(sb_secret(?:_|-|$)|service_role)/i.test(chave)) {
    return 'A chave configurada parece ser privada. Use somente uma chave anon/publicável.';
  }

  if (chave.startsWith('sb_publishable_')) {
    return /^sb_publishable_[A-Za-z0-9_-]+$/.test(chave)
      ? null
      : 'A chave publicável do Supabase está incompleta ou inválida.';
  }

  const partes = chave.split('.');
  if (partes.length !== 3) {
    return 'Use uma chave anon legada ou uma chave sb_publishable_ do Supabase.';
  }

  try {
    const payload = JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'));
    if (payload.role === 'service_role') {
      return 'A chave service_role não pode ser usada pelo aplicativo.';
    }
    if (payload.role !== 'anon') {
      return 'A chave configurada não é uma chave anon/publicável.';
    }
  } catch (erro) {
    return 'A chave Supabase JWT não é válida.';
  }

  return null;
}

module.exports = { carregarConfig, validarConfigSupabase };
