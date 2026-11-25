'use strict';

const express = require('express');
const { executar } = require('../utils/supabase');

function criarRotasConta({ auth, criarClienteAdmin }) {
  const router = express.Router();

  router.delete('/conta', async (req, res) => {
    if (typeof criarClienteAdmin !== 'function') {
      return res.status(503).json({
        mensagem: 'A exclusão de conta está temporariamente indisponível porque a configuração administrativa segura ainda não foi concluída. Entre em contato com o responsável pelo sistema.'
      });
    }

    const usuarioId = req.usuario?.id;
    if (!usuarioId || !req.supabase) {
      return res.status(401).json({ mensagem: 'Sua sessão não é válida. Entre novamente.' });
    }

    // Lê somente o perfil do próprio usuário com o token autenticado.
    const { data: perfil } = await executar(
      req.supabase.from('usuarios')
        .select('id,nome,email')
        .eq('id', usuarioId)
        .maybeSingle()
    );
    if (!perfil) {
      return res.status(404).json({ mensagem: 'Não foi possível localizar seu perfil para exclusão.' });
    }

    const admin = criarClienteAdmin();
    const emailAnonimizado = `conta-excluida+${usuarioId}@anon.invalid`;

    // Mantém a linha e o UUID de usuarios: FKs de partidas, campeonatos e times
    // continuam válidas. Somente nome e email identificáveis são anonimizados.
    const { data: perfilAnonimizado, error: erroAnonimizacao } = await admin.from('usuarios')
      .update({ nome: 'Conta excluída', email: emailAnonimizado })
      .eq('id', usuarioId)
      .select('id')
      .maybeSingle();

    if (erroAnonimizacao) throw erroAnonimizacao;
    if (!perfilAnonimizado?.id) {
      return res.status(503).json({
        mensagem: 'Não foi possível anonimizar o perfil. Nenhuma exclusão foi concluída.'
      });
    }

    // A exclusão do Auth é administrativa e ocorre somente no servidor.
    // Erros retornados ou exceções tentam compensar a anonimização anterior.
    let erroExclusao = null;
    try {
      const resultado = await admin.auth.admin.deleteUser(usuarioId);
      erroExclusao = resultado.error || null;
    } catch (erro) {
      erroExclusao = erro;
    }

    if (erroExclusao) {
      const { error: erroRestauracao } = await admin.from('usuarios')
        .update({ nome: perfil.nome, email: perfil.email })
        .eq('id', usuarioId);

      if (erroRestauracao) {
        console.error('Falha ao restaurar perfil após erro de exclusão Auth:', erroRestauracao.code || erroRestauracao.name);
      }
      return res.status(503).json({
        mensagem: 'Não foi possível confirmar a exclusão da conta. Se o serviço estiver instável, entre em contato com o suporte antes de tentar novamente.'
      });
    }

    // Excluir o usuário no Auth invalida suas credenciais; também removemos o cookie local.
    auth.encerrarSessao(req, res);
    return res.json({
      mensagem: 'Conta excluída e dados pessoais anonimizados. O histórico competitivo foi preservado.'
    });
  });

  return router;
}

module.exports = { criarRotasConta };
