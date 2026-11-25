'use strict';

const { createClient } = require('@supabase/supabase-js');

function criarClienteSupabase(config, accessToken) {
  const opcoes = {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false
    }
  };

  if (accessToken) {
    opcoes.global = { headers: { Authorization: `Bearer ${accessToken}` } };
  }

  return createClient(config.supabaseUrl, config.supabaseAnonKey, opcoes);
}

function chaveAdminValida(chave) {
  if (typeof chave !== 'string' || !chave) return false;
  if (/^sb_secret_[A-Za-z0-9_-]+$/.test(chave)) return true;
  const partes = chave.split('.');
  if (partes.length !== 3) return false;
  try {
    const payload = JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'));
    return payload.role === 'service_role';
  } catch (erro) {
    return false;
  }
}

/**
 * Cliente administrativo exclusivamente do backend.
 * A chave privada nunca é enviada ao navegador nem usada no cliente autenticado do jogador.
 */
function criarClienteSupabaseAdmin(config) {
  if (!chaveAdminValida(config.supabaseServiceRoleKey)) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY ausente ou inválida.');
  }
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false
    }
  });
}

module.exports = { criarClienteSupabase, criarClienteSupabaseAdmin, chaveAdminValida };
