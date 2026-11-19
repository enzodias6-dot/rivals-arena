'use strict';

const express = require('express');

const { executar, buscarTodasAsPaginas, clienteDaRequisicao } = require('../utils/supabase');
const { validarNome } = require('../utils/validacao');

function ordenarRanking(jogadores) {
  return jogadores.sort((a, b) =>
    Number(b.pontos) - Number(a.pontos) ||
    Number(b.vitorias) - Number(a.vitorias) ||
    String(a.id).localeCompare(String(b.id))
  );
}

async function carregarRankingCompleto(cliente) {
  return buscarTodasAsPaginas(() =>
    cliente.from('vw_ranking_publico')
        .select('id,nome,pontos,vitorias,derrotas', { count: 'exact' })
        .order('pontos', { ascending: false })
        .order('vitorias', { ascending: false })
        .order('id', { ascending: true })
  );
}

function mapearRanking(jogadores) {
  return jogadores.map((jogador, indice) => ({
    posicao: indice + 1,
    id: jogador.id,
    nome: jogador.nome,
    pontos: Number(jogador.pontos),
    vitorias: Number(jogador.vitorias),
    derrotas: Number(jogador.derrotas)
  }));
}

function criarRotasJogadores() {
  const router = express.Router();

  router.get('/perfil', async (req, res) => {
    const cliente = clienteDaRequisicao(req);
    const { data: jogador } = await executar(
      cliente.from('usuarios')
        .select('id,nome,email,perfil,nivel,pontos,vitorias,derrotas')
        .eq('id', req.usuario.id)
        .maybeSingle()
    );

    if (!jogador) {
      return res.status(404).json({
        mensagem: 'Não foi possível localizar os dados do seu perfil. Sua sessão continua ativa; tente novamente mais tarde ou contate o suporte.'
      });
    }

    let posicao = null;
    try {
      const ordenado = ordenarRanking(await carregarRankingCompleto(cliente));
      const indice = ordenado.findIndex((entrada) => entrada.id === req.usuario.id);
      posicao = indice >= 0 ? indice + 1 : null;
    } catch (erro) {
      const detalhe = erro?.code || erro?.status || erro?.name || 'erro desconhecido';
      console.error(`Falha ao consultar posição no ranking do perfil: ${detalhe}`);
    }

    return res.json({
      usuario: {
        ...jogador,
        pontos: Number(jogador.pontos),
        vitorias: Number(jogador.vitorias),
        derrotas: Number(jogador.derrotas),
        posicao
      }
    });
  });

  router.patch('/perfil', async (req, res) => {
    const corpo = req.body;
    if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) {
      return res.status(400).json({ mensagem: 'Envie somente o campo nome.' });
    }

    const campos = Object.keys(corpo);
    if (campos.length !== 1 || campos[0] !== 'nome') {
      return res.status(400).json({ mensagem: 'Envie somente o campo nome.' });
    }

    const nome = validarNome(corpo.nome, 'O nome');
    if (nome.erro) return res.status(400).json({ mensagem: nome.erro });

    const { data: usuario } = await executar(
      clienteDaRequisicao(req).from('usuarios')
        .update({ nome: nome.valor })
        .eq('id', req.usuario.id)
        .select('id,nome')
        .maybeSingle()
    );

    if (!usuario) {
      return res.status(404).json({ mensagem: 'Seu perfil não foi encontrado ou não está disponível para atualização.' });
    }

    return res.json({ usuario });
  });

  router.get('/ranking', async (req, res) => {
    const data = await carregarRankingCompleto(clienteDaRequisicao(req));
    return res.json({ ranking: mapearRanking(ordenarRanking(data)) });
  });

  return router;
}

module.exports = { criarRotasJogadores };
