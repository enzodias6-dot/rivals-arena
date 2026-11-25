(() => {
  'use strict';

  const { $, api, criarElemento } = window.RA;
  const lista = $('#team-list');
  const detalhe = $('#team-detail');
  const status = $('#team-status');
  const busca = $('#team-search');
  const atualizar = $('#refresh-teams');
  let times = [];

  function definirStatus(mensagem) {
    status.textContent = mensagem;
  }

  function botao(texto, acao) {
    const elemento = criarElemento('button', 'button-primary compact', texto);
    elemento.type = 'button';
    elemento.addEventListener('click', acao);
    return elemento;
  }

  function renderizar() {
    const termo = (busca.value || '').trim().toLocaleLowerCase('pt-BR');
    const filtrados = times.filter((time) =>
      `${time.nome || ''} ${time.descricao || ''}`.toLocaleLowerCase('pt-BR').includes(termo)
    );
    if (!filtrados.length) {
      lista.replaceChildren(criarElemento('p', 'empty-state',
        times.length ? 'Nenhum time corresponde à sua busca.' : 'Nenhum time ativo encontrado.'));
      return;
    }
    lista.replaceChildren(...filtrados.map((time) => {
      const cartao = criarElemento('article', 'content-card team-card');
      cartao.append(
        criarElemento('h3', '', time.nome),
        criarElemento('p', '', time.descricao || 'Sem descrição.'),
        criarElemento('p', 'meta', `Integrantes ativos: ${time.integrantes}`),
        criarElemento('p', 'team-role', time.meuPapel === 'lider'
          ? 'Você é responsável por este time.'
          : time.meuPapel === 'membro' ? 'Você participa deste time.' : 'Time público')
      );
      cartao.append(botao('Ver integrantes', () => carregarDetalhe(time.id)));
      return cartao;
    }));
  }

  async function carregarTimes() {
    atualizar.disabled = true;
    definirStatus('Carregando times...');
    try {
      const resposta = await api('times');
      times = Array.isArray(resposta.times) ? resposta.times : [];
      renderizar();
      definirStatus(`${times.length} time(s) ativo(s) encontrado(s).`);
    } catch (erro) {
      lista.replaceChildren(criarElemento('p', 'empty-state', erro.message));
      definirStatus(erro.message);
    } finally {
      atualizar.disabled = false;
    }
  }

  async function carregarDetalhe(id) {
    detalhe.hidden = false;
    detalhe.replaceChildren(criarElemento('p', 'meta', 'Carregando integrantes...'));
    try {
      const { time } = await api(`times/${encodeURIComponent(id)}`);
      detalhe.replaceChildren(
        criarElemento('h2', '', time.nome),
        criarElemento('p', '', time.descricao || 'Sem descrição.'),
        criarElemento('p', 'meta', `Responsável: ${time.lider.nome || 'Jogador'}`),
        criarElemento('h3', '', 'Integrantes')
      );
      const ul = criarElemento('ul');
      for (const membro of time.membros) {
        ul.append(criarElemento('li', '', `${membro.nome || 'Jogador'}${membro.funcao ? ` — ${membro.funcao}` : ''}`));
      }
      if (!time.membros.length) ul.append(criarElemento('li', '', 'Nenhum integrante ativo listado.'));
      detalhe.append(ul, botao('Fechar detalhes', () => {
        detalhe.hidden = true;
        detalhe.replaceChildren();
      }));
    } catch (erro) {
      detalhe.replaceChildren(criarElemento('p', 'meta', erro.message));
    }
  }

  busca.addEventListener('input', renderizar);
  atualizar.addEventListener('click', carregarTimes);
  carregarTimes();
})();
