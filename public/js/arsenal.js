(() => {
  'use strict';

  const { $, api, criarElemento } = window.RA;
  const container = $('#arsenal');
  const status = $('#arsenal-status');
  const busca = $('#arsenal-search');
  const categoria = $('#arsenal-category');
  const detalhe = $('#arsenal-detail');
  let itens = [];

  function renderizar() {
    const termo = busca.value.trim().toLocaleLowerCase('pt-BR');
    const categoriaSelecionada = categoria.value;
    const filtrados = itens.filter((item) =>
      (!categoriaSelecionada || item.categoria === categoriaSelecionada) &&
      `${item.nome} ${item.categoria} ${item.descricao}`.toLocaleLowerCase('pt-BR').includes(termo)
    );

    if (!filtrados.length) {
      container.replaceChildren(criarElemento('p', 'meta',
        itens.length ? 'Nenhum item corresponde aos filtros.' : 'Nenhum item foi publicado no catálogo.'));
      return;
    }

    container.replaceChildren(...filtrados.map((item) => {
      const cartao = criarElemento('article', 'panel item');
      cartao.append(
        criarElemento('span', 'rar', item.categoria),
        criarElemento('h2', '', item.nome),
        criarElemento('p', '', item.descricao || 'Sem descrição.'),
        criarElemento('button', 'button-secondary compact', 'Ver detalhes')
      );
      const acao = cartao.querySelector('button');
      acao.type = 'button';
      acao.addEventListener('click', () => mostrarDetalhes(item));
      return cartao;
    }));
  }

  function mostrarDetalhes(item) {
    detalhe.hidden = false;
    detalhe.replaceChildren(
      criarElemento('h2', '', item.nome),
      criarElemento('p', 'meta', `Categoria: ${item.categoria}`),
      criarElemento('p', '', item.descricao || 'Sem descrição.')
    );
    const campos = Object.entries(item.detalhes || {});
    if (campos.length) {
      const lista = criarElemento('dl');
      for (const [chave, valor] of campos) {
        lista.append(
          criarElemento('dt', '', chave),
          criarElemento('dd', '', typeof valor === 'string' ? valor : JSON.stringify(valor))
        );
      }
      detalhe.append(lista);
    }
    const fechar = criarElemento('button', 'button-secondary compact', 'Fechar');
    fechar.type = 'button';
    fechar.addEventListener('click', () => { detalhe.hidden = true; });
    detalhe.append(fechar);
  }

  async function carregar() {
    try {
      const resposta = await api('arsenal');
      itens = resposta.itens;
      const categorias = [...new Set(itens.map((item) => item.categoria))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
      categoria.replaceChildren(criarElemento('option', '', 'Todas'));
      categoria.options[0].value = '';
      for (const nome of categorias) {
        const opcao = criarElemento('option', '', nome);
        opcao.value = nome;
        categoria.append(opcao);
      }
      status.textContent = itens.length
        ? `${itens.length} item(ns) publicado(s).`
        : 'Catálogo vazio: aguarda publicação de conteúdo real pela equipe responsável.';
      renderizar();
    } catch (erro) {
      status.textContent = erro.message;
      container.replaceChildren();
    }
  }

  busca.addEventListener('input', renderizar);
  categoria.addEventListener('change', renderizar);
  carregar();
})();
