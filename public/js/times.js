(() => {
  'use strict';

  const { $, api, criarElemento } = window.RA;
  const lista = $('#team-list');
  const detalhe = $('#team-detail');
  const status = $('#team-status');
  const busca = $('#team-search');
  const atualizar = $('#refresh-teams');
  const formulario = $('#team-create-form');
  const botaoCriar = $('#create-team-submit');
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

    const contador = criarElemento('p', 'team-results-count',
      termo
        ? `${filtrados.length} de ${times.length} equipe(s) encontrada(s).`
        : `${times.length} equipe(s) disponível(is).`
    );
    const titulo = document.querySelector('.team-list-heading > div');
    const contadorAtual = document.querySelector('.team-results-count');
    if (contadorAtual) contadorAtual.replaceWith(contador);
    else if (titulo) titulo.append(contador);

    if (!filtrados.length) {
      const vazio = criarElemento('div', 'empty-state team-empty-state');
      vazio.append(
        criarElemento('span', 'team-empty-icon', '⚔'),
        criarElemento('h3', '', times.length ? 'Nenhuma equipe encontrada' : 'Ainda não há equipes ativas'),
        criarElemento('p', '', times.length
          ? 'Tente pesquisar por outro nome ou descrição.'
          : 'Crie a primeira equipe da comunidade e reúna seus combatentes.')
      );
      if (times.length && termo) {
        vazio.append(botao('Limpar pesquisa', () => {
          busca.value = '';
          renderizar();
          busca.focus();
        }));
      }
      lista.replaceChildren(vazio);
      return;
    }

    lista.replaceChildren(...filtrados.map((time) => {
      const cartao = criarElemento('article', 'content-card team-card');
      const papel = time.meuPapel === 'lider'
        ? 'Responsável pelo time'
        : time.meuPapel === 'membro' ? 'Você participa deste time' : 'Time público';
      cartao.append(
        criarElemento('span', 'team-card-tag', 'EQUIPE ATIVA'),
        criarElemento('h3', '', time.nome),
        criarElemento('p', 'team-card-description', time.descricao || 'Sem descrição informada.'),
        criarElemento('p', 'team-card-members', `Integrantes ativos: ${time.integrantes}`),
        criarElemento('p', 'team-role', papel)
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
      const cabecalho = criarElemento('div', 'team-detail-header');
      cabecalho.append(
        criarElemento('div', 'team-detail-kicker', 'DETALHES DA EQUIPE'),
        criarElemento('h2', '', time.nome),
        criarElemento('p', '', time.descricao || 'Sem descrição informada.'),
        criarElemento('p', 'team-detail-leader', `Responsável: ${time.lider.nome || 'Jogador'}`)
      );
      const tituloIntegrantes = criarElemento('h3', 'team-members-title', 'Integrantes');
      const ul = criarElemento('ul', 'team-members-list');
      for (const membro of time.membros) {
        const item = criarElemento('li', 'team-member-item');
        item.append(
          criarElemento('span', 'team-member-name', membro.nome || 'Jogador'),
          criarElemento('span', 'team-member-role', membro.usuario_id === time.responsavel_id ? 'Responsável' : membro.funcao || 'Integrante')
        );
        ul.append(item);
      }
      if (!time.membros.length) {
        ul.append(criarElemento('li', 'team-member-empty', 'Nenhum integrante ativo listado.'));
      }
      detalhe.replaceChildren(
        cabecalho,
        tituloIntegrantes,
        ul,
        botao('Fechar detalhes', () => {
          detalhe.hidden = true;
          detalhe.replaceChildren();
        })
      );
    } catch (erro) {
      detalhe.replaceChildren(criarElemento('p', 'meta', erro.message));
    }
  }

  async function criarTime(evento) {
    evento.preventDefault();
    if (!formulario.reportValidity()) return;

    const dados = new FormData(formulario);
    const nome = String(dados.get('nome') || '').trim();
    const descricao = String(dados.get('descricao') || '').trim();
    botaoCriar.disabled = true;
    definirStatus('Criando seu time...');
    try {
      const resposta = await api('times', {
        metodo: 'POST',
        corpo: { nome, descricao }
      });
      formulario.reset();
      definirStatus(resposta.mensagem || 'Time criado com sucesso.');
      await carregarTimes();
      if (resposta.time?.id) await carregarDetalhe(resposta.time.id);
    } catch (erro) {
      definirStatus(erro.message);
    } finally {
      botaoCriar.disabled = false;
    }
  }

  busca.addEventListener('input', renderizar);
  atualizar.addEventListener('click', carregarTimes);
  formulario.addEventListener('submit', criarTime);
  carregarTimes();
})();
