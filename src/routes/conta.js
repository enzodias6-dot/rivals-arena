'use strict';

const express = require('express');

function criarRotasConta() {
  const router = express.Router();

  // Exclusão permanece bloqueada até existir uma política de retenção e anonimização
  // homologada. Não chamar RPC nem alterar dados enquanto o schema não suportar isso.
  router.delete('/conta', (req, res) => res.status(503).json({
    mensagem: 'A exclusão de conta está temporariamente indisponível. O projeto ainda precisa definir uma forma segura de preservar o histórico competitivo e tratar os dados pessoais.'
  })));

  return router;
}

module.exports = { criarRotasConta };
