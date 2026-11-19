'use strict';

/**
 * Limitador de requisições em memória, por IP.
 * contar: 'falhas' conta só respostas de erro (ex.: logins errados); 'todas' conta tudo.
 * Obs.: com várias instâncias do servidor é preciso um armazenamento compartilhado (ex.: Redis).
 */
function criarLimitador({ janelaMs, max, contar = 'todas', mensagem }) {
  const registros = new Map();

  setInterval(() => {
    const agora = Date.now();
    for (const [chave, registro] of registros) {
      if (registro.expiraEm <= agora) registros.delete(chave);
    }
  }, Math.min(janelaMs, 60 * 1000)).unref();

  return function limitar(req, res, next) {
    const chave = req.ip || 'desconhecido';
    const agora = Date.now();
    let registro = registros.get(chave);

    if (!registro || registro.expiraEm <= agora) {
      registro = { total: 0, expiraEm: agora + janelaMs };
      registros.set(chave, registro);
    }

    if (registro.total >= max) {
      res.set('Retry-After', String(Math.ceil((registro.expiraEm - agora) / 1000)));
      return res.status(429).json({
        mensagem: mensagem || 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'
      });
    }

    res.on('finish', () => {
      const falhou = res.statusCode >= 400 && res.statusCode !== 429;
      if (contar === 'todas' || falhou) registro.total += 1;
    });

    return next();
  };
}

module.exports = { criarLimitador };
