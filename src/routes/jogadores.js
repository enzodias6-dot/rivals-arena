'use strict';

const express = require('express');

function criarRotasJogadores({ db, auth }) {
  const router = express.Router();

  router.get('/perfil', async (req, res) => {
    const [linhas] = await db.execute(
      'SELECT id, nome, email, pontos, vitorias, derrotas FROM usuarios WHERE id = ? LIMIT 1',
      [req.usuario.id]
    );

    if (!linhas.length) {
      // Conta removida enquanto o cookie ainda era válido: encerra a sessão.
      auth.encerrarSessao(req, res);
      return res.status(401).json({ mensagem: 'Sessão inválida ou expirada. Entre novamente.' });
    }

    const jogador = linhas[0];

    // Mesmo critério de ordenação do ranking (pontos, vitórias, antiguidade),
    // para que a posição do perfil sempre bata com a da tabela.
    const [[posicao]] = await db.execute(
      `SELECT COUNT(*) + 1 AS posicao FROM usuarios
       WHERE pontos > ?
          OR (pontos = ? AND vitorias > ?)
          OR (pontos = ? AND vitorias = ? AND id < ?)`,
      [jogador.pontos, jogador.pontos, jogador.vitorias, jogador.pontos, jogador.vitorias, jogador.id]
    );

    return res.json({ usuario: { ...jogador, posicao: Number(posicao.posicao) } });
  });

  router.get('/ranking', async (req, res) => {
    const [linhas] = await db.query(
      'SELECT nome, pontos, vitorias, derrotas FROM usuarios ORDER BY pontos DESC, vitorias DESC, id ASC LIMIT 50'
    );
    return res.json({ ranking: linhas.map((linha, indice) => ({ posicao: indice + 1, ...linha })) });
  });

  return router;
}

module.exports = { criarRotasJogadores };
