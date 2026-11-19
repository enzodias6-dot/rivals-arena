/** Página de perfil: estatísticas da conta e botão de sair. */
(() => {
  'use strict';

  const { $, criarElemento, formatarNumero, obterUsuario, raiz, sair } = window.RA;

  const caixa = $('#profile');

  obterUsuario()
    .then((usuario) => {
      const partidas = usuario.vitorias + usuario.derrotas;
      const estatisticas = criarElemento('div', 'profile-stats');

      [
        ['Vitórias', usuario.vitorias],
        ['Derrotas', usuario.derrotas],
        ['Partidas', partidas],
        ['Pontos', formatarNumero(usuario.pontos)],
        ['Posição', `#${usuario.posicao}`],
        ['Aproveitamento', partidas ? `${Math.round((usuario.vitorias / partidas) * 100)}%` : '—']
      ].forEach(([rotulo, valor]) => {
        const item = criarElemento('div', 'stat');
        item.append(criarElemento('strong', '', valor), criarElemento('span', '', rotulo));
        estatisticas.append(item);
      });

      const avatar = criarElemento('div', 'profile-avatar');
      const imagem = document.createElement('img');
      imagem.src = `${raiz}img/logo.png`;
      imagem.alt = 'Rivals Arena';
      avatar.append(imagem);

      const botaoSair = criarElemento('button', 'button-secondary', 'Sair da conta');
      botaoSair.type = 'button';
      botaoSair.addEventListener('click', sair);

      caixa.replaceChildren(avatar, criarElemento('h2', '', usuario.nome), criarElemento('p', 'meta', usuario.email), estatisticas, botaoSair);
    })
    .catch((erro) => {
      caixa.replaceChildren(criarElemento('p', 'meta', erro.message));
    });
})();
