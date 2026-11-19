/** Página de arsenal: catálogo de equipamentos (conteúdo fixo, apenas visual por enquanto). */
(() => {
  'use strict';

  const { $, criarElemento } = window.RA;

  const equipamentos = [
    ['Pistola P-09', 'Comum', 'Arma inicial confiável.', true],
    ['Faca tática', 'Comum', 'Silenciosa e sempre à mão.', true],
    ['Fuzil AR-12', 'Incomum', 'Equilíbrio entre alcance e cadência.', false],
    ['Escopeta S-870', 'Incomum', 'Letal em curta distância.', false],
    ['Rifle de precisão', 'Raro', 'Um tiro, uma decisão.', false],
    ['Lançador Apocalipse', 'Lendário', 'Reservado aos melhores da arena.', false]
  ];

  const container = $('#arsenal');

  equipamentos.forEach(([nome, raridade, descricao, liberado]) => {
    const cartao = criarElemento('article', `panel item${liberado ? '' : ' locked'}`);
    cartao.dataset.rar = raridade;
    cartao.append(
      criarElemento('span', 'rar', raridade.toUpperCase()),
      criarElemento('h3', '', nome),
      criarElemento('p', '', descricao),
      criarElemento('p', 'meta', liberado ? '✔ Equipamento inicial' : 'Em breve')
    );
    container.append(cartao);
  });
})();
