'use strict';

const METODOS_QUE_ALTERAM = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Cabeçalhos de segurança. O site não usa scripts, estilos ou fontes de terceiros. */
function cabecalhosSeguranca(req, res, next) {
  res.set({
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'"
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin'
  });

  if (req.secure) res.set('Strict-Transport-Security', 'max-age=15552000');
  next();
}

/**
 * Defesa extra contra CSRF (além do cookie SameSite=Strict):
 * requisições que alteram dados só são aceitas se o Origin, quando enviado, for o próprio site.
 */
function verificarOrigem(req, res, next) {
  const origem = req.get('origin');
  if (!METODOS_QUE_ALTERAM.has(req.method) || !origem) return next();

  let hostOrigem = null;
  try {
    hostOrigem = new URL(origem).host;
  } catch (erro) {
    hostOrigem = null;
  }

  if (hostOrigem !== req.host) {
    return res.status(403).json({ mensagem: 'Origem da requisição não permitida.' });
  }
  return next();
}

module.exports = { cabecalhosSeguranca, verificarOrigem };
