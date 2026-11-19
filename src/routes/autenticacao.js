'use strict';

const express = require('express');

const { criarLimitador } = require('../middlewares/limitador');
const { validarCadastro, validarLogin } = require('../utils/validacao');

function criarRotasAutenticacao({ config, auth, criarCliente }) {
  const router = express.Router();
  const limitarLogin = criarLimitador({ ...config.limites.login, contar: 'falhas' });
  const limitarCadastro = criarLimitador({ ...config.limites.cadastro, contar: 'todas' });

  router.post('/usuarios', limitarCadastro, async (req, res) => {
    const dados = validarCadastro(req.body);
    if (dados.erro) return res.status(400).json({ mensagem: dados.erro });

    const { data, error } = await criarCliente().auth.signUp({
      email: dados.email,
      password: dados.senha,
      options: { data: { nome: dados.nome } }
    });

    if (error) {
      if (error.status === 429) {
        return res.status(429).json({ mensagem: 'Muitas tentativas de cadastro. Aguarde antes de tentar novamente.' });
      }
      if (error.status === 403) {
        return res.status(403).json({ mensagem: 'O Supabase não permitiu o cadastro. Confira as configurações de autenticação.' });
      }
      if (error.code === 'user_already_exists' || /already registered/i.test(error.message || '')) {
        return res.status(409).json({ mensagem: 'Este email já está cadastrado.' });
      }
      if (error.status === 422 || error.status === 400) {
        return res.status(400).json({ mensagem: 'Não foi possível criar a conta com esses dados.' });
      }
      throw error;
    }

    if (!data.user) throw new Error('Supabase Auth não retornou o usuário após o cadastro.');
    if (data.session) auth.iniciarSessao(req, res, data.session);

    return res.status(201).json({
      mensagem: data.session
        ? 'Cadastro realizado com sucesso!'
        : 'Cadastro realizado. Confira seu email para confirmar a conta antes de entrar.',
      confirmacaoEmailPendente: !data.session,
      sessaoIniciada: Boolean(data.session),
      usuario: {
        id: data.user.id,
        nome: data.user.user_metadata?.nome || dados.nome,
        email: data.user.email || dados.email
      }
    });
  });

  router.post('/login', limitarLogin, async (req, res) => {
    const dados = validarLogin(req.body);
    if (dados.erro) return res.status(400).json({ mensagem: dados.erro });

    const { data, error } = await criarCliente().auth.signInWithPassword({
      email: dados.email,
      password: dados.senha
    });

    if (error) {
      if (error.code === 'email_not_confirmed' || /email not confirmed/i.test(error.message || '')) {
        return res.status(403).json({ mensagem: 'Confirme seu email antes de entrar.' });
      }
      if (error.status === 429) {
        return res.status(429).json({ mensagem: 'Muitas tentativas de login. Aguarde antes de tentar novamente.' });
      }
      if ([400, 401].includes(error.status)) {
        return res.status(401).json({ mensagem: 'Email ou senha incorretos.' });
      }
      if (error.status === 403) {
        return res.status(403).json({ mensagem: 'O Supabase não permitiu esta autenticação.' });
      }
      throw error;
    }
    if (!data.user || !data.session) {
      throw new Error('Supabase Auth não retornou uma sessão após o login.');
    }

    auth.iniciarSessao(req, res, data.session);
    return res.json({
      mensagem: 'Login realizado com sucesso!',
      usuario: {
        id: data.user.id,
        nome: data.user.user_metadata?.nome || '',
        email: data.user.email || dados.email
      }
    });
  });

  router.post('/logout', async (req, res) => {
    try {
      await auth.revogarSessao(req);
    } finally {
      auth.encerrarSessao(req, res);
    }
    return res.json({ mensagem: 'Sessão removida deste navegador.' });
  });

  return router;
}

module.exports = { criarRotasAutenticacao };
