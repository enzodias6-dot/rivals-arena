(() => {
  'use strict';

  const { $, api, criarElemento } = window.RA;
  const container = $('#arsenal');
  const status = $('#arsenal-status');
  const armas = [
    { slug: 'pistola', nome: 'PISTOLA', subtitulo: 'PRECISÃO E AGILIDADE', dano: 25, cadencia: '214,3 tiros/min', tipo: 'pistola', categoria: 'PISTOLA' },
    { slug: 'sniper', nome: 'SNIPER', subtitulo: 'UM TIRO, UMA ELIMINAÇÃO', dano: 80, cadencia: '50 tiros/min', tipo: 'sniper', categoria: 'SNIPER' },
    { slug: 'fuzil', nome: 'FUZIL', subtitulo: 'CONTROLE E ALTA CADÊNCIA', dano: 20, cadencia: '500 tiros/min', tipo: 'fuzil', categoria: 'FUZIL' }
  ];

  function desenhoArma(tipo) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 360 150');
    svg.setAttribute('class', 'arsenal-weapon-art');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Ilustração estilizada da arma');
    const paths = {
      pistola: '<path d="M76 54h190l18 13-18 13H180l-7 38h-42l-8-38H76z"/><path d="M92 45h142v9H92z"/><path d="M218 80h24v8h-24z"/>',
      sniper: '<path d="M28 68h282l18 8-18 8H28z"/><path d="M90 58h92v10H90z"/><path d="M145 84h36l-8 18h-22z"/><path d="M205 54h68v10h-68z"/><path d="M232 42h18v12h-18z"/>',
      fuzil: '<path d="M34 62h274l18 9-18 9H34z"/><path d="M76 50h82v12H76z"/><path d="M155 80h36l-8 35h-20z"/><path d="M216 48h54v14h-54z"/><path d="M280 57h24v5h-24z"/>'
    };
    svg.innerHTML = '<g fill="#7c8794" stroke="#c0c8d1" stroke-width="2" stroke-linejoin="round">' + paths[tipo] + '</g><g fill="#252b34"><circle cx="100" cy="70" r="4"/><circle cx="260" cy="70" r="4"/></g>';
    return svg;
  }

  function criarCartao(arma) {
    const card = criarElemento('article', 'arsenal-weapon-card');
    card.append(
      criarElemento('div', 'arsenal-card-topline', ''),
      criarElemento('h2', 'arsenal-card-title', arma.nome),
      criarElemento('p', 'arsenal-card-subtitle', arma.subtitulo)
    );
    const palco = criarElemento('div', 'arsenal-weapon-stage');
    palco.append(desenhoArma(arma.tipo));
    card.append(palco);
    const stats = criarElemento('div', 'arsenal-weapon-stats');
    const dano = criarElemento('div', 'arsenal-stat');
    dano.append(criarElemento('span', '', 'DANO'), criarElemento('strong', '', String(arma.dano)));
    const cadencia = criarElemento('div', 'arsenal-stat');
    cadencia.append(criarElemento('span', '', 'CADÊNCIA'), criarElemento('strong', '', arma.cadencia));
    stats.append(dano, cadencia);
    card.append(stats);
    return card;
  }

  async function carregar() {
    try {
      const resposta = await api('arsenal');
      const publicados = new Set((resposta.itens || []).map((item) => item.slug));
      const disponiveis = armas.filter((arma) => publicados.has(arma.slug));
      status.remove();
      if (!disponiveis.length) {
        container.append(criarElemento('p', 'arsenal-empty', 'As três armas ainda aguardam cadastro e publicação no catálogo.'));
        return;
      }
      container.replaceChildren(...disponiveis.map(criarCartao));
    } catch (erro) {
      status.textContent = erro.message || 'Não foi possível carregar o arsenal.';
    }
  }

  carregar();
})();