'use strict';

const jwt = require('jsonwebtoken');

const EMISSOR = 'rivals-arena';

function criarAuth(config) {
  function lerCookie(req, nome) {
    for (const parte of (req.headers.cookie || '').split(';')) {
      const [chave, ...valor] = parte.trim().split('=');
      if (chave !== nome) continue;
      try {
        return decodeURIComponent(valor.join('='));
      } catch (erro) {
        return null; // cookie malformado: trata como sem sessão (antes gerava erro 500)
      }
    }
    return null;
  }

  const opcoesCookie = (req) => ({
    httpOnly: true,
    sameSite: 'strict',
    secure: req.secure,
    path: '/'
  });

  /** Devolve os dados da sessão (payload do JWT) ou null. */
  function sessaoValida(req) {
    const token = lerCookie(req, config.nomeCookie);
    if (!token || !config.jwtSecret) return null;

    try {
      return jwt.verify(token, config.jwtSecret, { issuer: EMISSOR, algorithms: ['HS256'] });
    } catch (erro) {
      return null;
    }
  }

  function autenticar(req, res, next) {
    const sessao = sessaoValida(req);
    if (!sessao) {
      return res.status(401).json({ mensagem: 'Sessão inválida ou expirada. Entre novamente.' });
    }
    req.usuario = sessao;
    return next();
  }

  function iniciarSessao(req, res, usuario) {
    const token = jwt.sign({ id: usuario.id, email: usuario.email }, config.jwtSecret, {
      algorithm: 'HS256',
      expiresIn: `${config.sessaoHoras}h`,
      issuer: EMISSOR
    });

    res.cookie(config.nomeCookie, token, {
      ...opcoesCookie(req),
      maxAge: config.sessaoHoras * 60 * 60 * 1000
    });
  }

  function encerrarSessao(req, res) {
    res.clearCookie(config.nomeCookie, opcoesCookie(req));
  }

  return { sessaoValida, autenticar, iniciarSessao, encerrarSessao };
}

module.exports = { criarAuth };
