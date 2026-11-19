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

module.exports = { criarClienteSupabase };
