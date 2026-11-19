'use strict';

const { carregarConfig, validarConfigSupabase } = require('./src/config/env');
const { criarApp } = require('./src/app');

const config = carregarConfig();
const erroConfig = validarConfigSupabase(config.supabaseUrl, config.supabaseAnonKey);
if (erroConfig) {
  console.error(`\n[ERRO DE CONFIGURAÇÃO] ${erroConfig}`);
  console.error('Configure SUPABASE_URL e uma chave anon/publicável no arquivo .env.\n');
  process.exit(1);
}

const app = criarApp({ config });
const servidor = app.listen(config.porta, () => {
  console.log(`Rivals Arena disponível em http://localhost:${config.porta}`);
});

function encerrar() {
  servidor.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
