'use strict';

const express = require('express');

const { executar, buscarTodasAsPaginas, clienteDaRequisicao } = require('../utils/supabase');

function criarRotasArsenal() {
  const router = express.Router();

  router.get('/arsenal', async (req, res) => {
    const cliente = clienteDaRequisicao(req);
    const itens = await buscarTodasAsPaginas(() => cliente.from('arsenal_itens')
      .select('id,slug,nome,categoria,descricao,detalhes', { count: 'exact' })
      .eq('publicado', true)
      .order('categoria', { ascending: true })
      .order('nome', { ascending: true }));
    return res.json({ itens });
  });

  router.get('/arsenal/:slug', async (req, res) => {
    const slug = typeof req.params.slug === 'string' ? req.params.slug : '';
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return res.status(400).json({ mensagem: 'Item do arsenal inválido.' });
    }
    const cliente = clienteDaRequisicao(req);
    const { data: item } = await executar(cliente.from('arsenal_itens')
      .select('id,slug,nome,categoria,descricao,detalhes')
      .eq('slug', slug)
      .eq('publicado', true)
      .maybeSingle());
    if (!item) return res.status(404).json({ mensagem: 'Item do arsenal não encontrado.' });
    return res.json({ item });
  });

  return router;
}

module.exports = { criarRotasArsenal };
