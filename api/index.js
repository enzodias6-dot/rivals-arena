'use strict';

const { carregarConfig, validarConfigSupabase } = require('../src/config/env');
const { criarApp } = require('../src/app');

const config = carregarConfig();
const erroConfig = validarConfigSupabase(config.supabaseUrl, config.supabaseAnonKey);
if (erroConfig) throw new Error(erroConfig);

module.exports = criarApp({ config });
