'use strict';

const express = require('express');
const bcrypt = require('bcrypt');

const { criarLimitador } = require('../middlewares/limitador');
const { validarCadastro, validarLogin } = require('../utils/validacao');

function criarRotasAutenticacao({ db, config, auth }) {
  const router = express.Router();

  const limitarLogin = criarLimitador({ ...config.limites.login, contar: 'falhas' });
  const limitarCadastro = criarLimitador({ ...config.limites.cadastro, contar: 'todas' });

  // Hash "falso" usado quando o email não existe, para que o tempo de resposta seja parecido
  // nos dois casos e não revele quais emails estão cadastrados.
  const hashFalso = bcrypt.hashSync('rivals-arena-hash-falso', config.bcryptRounds);

  router.post('/usuarios', limitarCadastro, async (req, res) => {
    const dados = validarCadastro(req.body);
    if (dados.erro) return res.status(400).json({ mensagem: dados.erro });

    const [existentes] = await db.execute('SELECT id FROM usuarios WHERE email = ? LIMIT 1', [dados.email]);
    if (existentes.length) return res.status(409).json({ mensagem: 'Este email já está cadastrado.' });

    const senhaCriptografada = await bcrypt.hash(dados.senha, config.bcryptRounds);

    try {
      const [resultado] = await db.execute(
        'INSERT INTO usuarios (nome, email, senha) VALUES (?, ?, ?)',
        [dados.nome, dados.email, senhaCriptografada]
      );

      return res.status(201).json({
        mensagem: 'Cadastro realizado com sucesso! Agora você pode entrar.',
        usuario: { id: Number(resultado.insertId), nome: dados.nome, email: dados.email }
      });
    } catch (erro) {
      if (erro.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ mensagem: 'Este email já está cadastrado.' });
      }
      throw erro;
    }
  });

  router.post('/login', limitarLogin, async (req, res) => {
    const dados = validarLogin(req.body);
    if (dados.erro) return res.status(400).json({ mensagem: dados.erro });

    const [linhas] = await db.execute(
      'SELECT id, nome, email, senha FROM usuarios WHERE email = ? LIMIT 1',
      [dados.email]
    );
    const usuario = linhas[0];

    const senhaCorreta = await bcrypt.compare(dados.senha, usuario ? usuario.senha : hashFalso);
    if (!usuario || !senhaCorreta) {
      return res.status(401).json({ mensagem: 'Email ou senha incorretos.' });
    }

    auth.iniciarSessao(req, res, usuario);
    return res.json({
      mensagem: 'Login realizado com sucesso!',
      usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email }
    });
  });

  router.post('/logout', (req, res) => {
    auth.encerrarSessao(req, res);
    return res.json({ mensagem: 'Sessão encerrada.' });
  });

  return router;
}

module.exports = { criarRotasAutenticacao };
