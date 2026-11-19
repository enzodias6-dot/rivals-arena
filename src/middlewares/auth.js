'use strict';

function criarAuth(config, criarCliente) {
  // Compartilhado apenas dentro deste processo; instâncias serverless distintas não coordenam refresh.
  const renovacoesEmAndamento = new Map();

  function lerSessao(req) {
    const cookie = (req.headers.cookie || '').split(';').map((parte) => parte.trim())
      .find((parte) => parte.startsWith(`${config.nomeCookie}=`));
    if (!cookie) return null;

    try {
      const valor = decodeURIComponent(cookie.slice(config.nomeCookie.length + 1));
      if (valor.length > 8192) return null;
      const sessao = JSON.parse(valor);
      if (typeof sessao.access_token !== 'string' || typeof sessao.refresh_token !== 'string') return null;
      return sessao;
    } catch (erro) {
      return null;
    }
  }

  const opcoesCookie = (req) => ({
    httpOnly: true,
    sameSite: 'strict',
    secure: config.producao || req.secure,
    path: '/'
  });

  function salvarSessao(req, res, sessao) {
    res.cookie(config.nomeCookie, JSON.stringify({
      access_token: sessao.access_token,
      refresh_token: sessao.refresh_token
    }), {
      ...opcoesCookie(req),
      maxAge: 30 * 24 * 60 * 60 * 1000
    });
  }

  function encerrarSessao(req, res) {
    res.clearCookie(config.nomeCookie, opcoesCookie(req));
  }

  async function revogarSessao(req) {
    const sessao = lerSessao(req);
    if (!sessao) return;

    const cliente = criarCliente();
    const { data: sessaoDefinida, error: erroSessao } = await cliente.auth.setSession({
      access_token: sessao.access_token,
      refresh_token: sessao.refresh_token
    });
    if (erroSessao) {
      if (erroTransitorio(erroSessao)) throw erroSessao;
      if (erroDeSessaoInvalida(erroSessao)) return;
      throw erroSessao;
    }
    if (!sessaoDefinida?.session || !sessaoDefinida.user) return;

    // "local" revoga o refresh token desta sessão, não os JWTs de acesso já emitidos.
    const { error } = await cliente.auth.signOut({ scope: 'local' });
    if (error) {
      if (erroTransitorio(error)) throw error;
      if (erroDeSessaoInvalida(error)) return;
      throw error;
    }
  }

  function erroTransitorio(erro) {
    return erro?.name === 'AuthRetryableFetchError' ||
      erro?.name === 'TypeError' ||
      [408, 425, 429].includes(erro?.status) ||
      (Number.isInteger(erro?.status) && erro.status >= 500);
  }

  function erroDeSessaoInvalida(erro) {
    return ['AuthSessionMissingError', 'AuthInvalidJwtError'].includes(erro?.name) ||
      ['refresh_token_not_found', 'session_not_found', 'invalid_grant'].includes(erro?.code) ||
      [401, 403, 404].includes(erro?.status);
  }

  async function renovarSessao(cliente, refreshToken) {
    let entrada = renovacoesEmAndamento.get(refreshToken);
    if (entrada && entrada.expiraEm <= Date.now()) {
      renovacoesEmAndamento.delete(refreshToken);
      entrada = null;
    }

    if (!entrada) {
      const promessa = cliente.auth.refreshSession({ refresh_token: refreshToken });
      entrada = { promessa, expiraEm: Infinity };
      renovacoesEmAndamento.set(refreshToken, entrada);
      promessa.then(({ error }) => {
        if (error) {
          if (renovacoesEmAndamento.get(refreshToken) === entrada) {
            renovacoesEmAndamento.delete(refreshToken);
          }
          return;
        }

        entrada.expiraEm = Date.now() + 5000;
        const temporizador = setTimeout(() => {
          if (renovacoesEmAndamento.get(refreshToken) === entrada) {
            renovacoesEmAndamento.delete(refreshToken);
          }
        }, 5000);
        temporizador.unref();
      }, () => {
        if (renovacoesEmAndamento.get(refreshToken) === entrada) {
          renovacoesEmAndamento.delete(refreshToken);
        }
      });
    }

    return entrada.promessa;
  }

  async function validarSessao(req, res) {
    const sessao = lerSessao(req);
    if (!sessao) {
      const possuiCookie = (req.headers.cookie || '').split(';')
        .some((parte) => parte.trim().startsWith(`${config.nomeCookie}=`));
      if (possuiCookie) encerrarSessao(req, res);
      return null;
    }

    const cliente = criarCliente();
    const { data: verificado, error: erroVerificacao } = await cliente.auth.getUser(sessao.access_token);
    if (!erroVerificacao && verificado.user) {
      req.supabase = criarCliente(sessao.access_token);
      return verificado.user;
    }

    if (erroTransitorio(erroVerificacao)) throw erroVerificacao;

    const { data: renovada, error: erroRenovacao } = await renovarSessao(cliente, sessao.refresh_token);
    if (erroRenovacao) {
      if (erroTransitorio(erroRenovacao)) throw erroRenovacao;
      encerrarSessao(req, res);
      return null;
    }
    if (!renovada.session || !renovada.user) {
      encerrarSessao(req, res);
      return null;
    }

    salvarSessao(req, res, renovada.session);
    req.supabase = criarCliente(renovada.session.access_token);
    return renovada.user;
  }

  async function sessaoValida(req, res) {
    return Boolean(await validarSessao(req, res));
  }

  async function autenticar(req, res, next) {
    try {
      const usuario = await validarSessao(req, res);
      if (!usuario) {
        return res.status(401).json({ mensagem: 'Sessão inválida ou expirada. Entre novamente.' });
      }

      req.usuario = {
        id: usuario.id,
        email: usuario.email,
        nome: usuario.user_metadata?.nome || ''
      };
      return next();
    } catch (erro) {
      return next(erro);
    }
  }

  function iniciarSessao(req, res, sessao) {
    salvarSessao(req, res, sessao);
  }

  return { sessaoValida, autenticar, iniciarSessao, encerrarSessao, revogarSessao };
}

module.exports = { criarAuth };
