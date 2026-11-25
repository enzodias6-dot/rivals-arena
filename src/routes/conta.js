'use strict';

const express = require('express');

function criarRotasConta({ auth }) {
  const router = express.Router();

  // A função SQL usa auth.uid(), portanto a conta removida é sempre a do token autenticado.
  router.delete('/conta', async (req, res) => {
    const { error } = await req.supabase.rpc('excluir_minha_conta');
    if (error) {
      if (error.code === '42501' || error.status === 403) {
        return res.status(403).json({ mensagem: 'O banco não autorizou a exclusão desta conta.' });
      }
      if (['42883', 'PGRST202', 'PGRST205', '42P01'].includes(error.code)) {
        return res.status(503).json({
          mensagem: 'A exclusão ainda não está habilitada no banco. A migração de exclusão de conta precisa ser revisada e aplicada no Supabase.'
        });
      }
      throw error;
    }

    // Só encerra a sessão depois de o banco confirmar a exclusão.
    auth.encerrarSessao(req, res);
    return res.json({ mensagem: 'Sua conta foi excluída com sucesso.' });
  });

  return router;
}

module.exports = { criarRotasConta };
