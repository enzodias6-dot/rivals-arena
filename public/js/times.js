(() => {
  'use strict';

  const { $, api, criarElemento, notificar } = window.RA;
  const lista = $('#team-list');
  const detalhe = $('#team-detail');
  const status = $('#team-status');
  const formularioCriacao = $('#team-create-form');
  let timeSelecionadoId = null;

  function definirStatus(mensagem) {
    status.textContent = mensagem;
  }

  function botao(rotulo, acao, classe = 'button-secondary compact') {
    const elemento = criarElemento('button', classe, rotulo);
    elemento.type = 'button';
    elemento.addEventListener('click', acao);
    return elemento;
  }

  async function executarAcao(mensagem, acao, recarregar = true) {
    definirStatus('Processando...');
    try {
      await acao();
      notificar(mensagem);
      if (recarregar) {
        await carregarTimes();
        if (timeSelecionadoId) await carregarDetalhe(timeSelecionadoId);
      }
      definirStatus(mensagem);
    } catch (erro) {
      definirStatus(erro.message);
    }
  }

  async function carregarTimes() {
    definirStatus('Carregando times...');
    const { times } = await api('times');
    if (!times.length) {
      lista.replaceChildren(criarElemento('p', 'meta', 'Nenhum time cadastrado.'));
      definirStatus('');
      return;
    }
    lista.replaceChildren(...times.map((time) => {
      const cartao = criarElemento('article', 'content-card');
      cartao.append(
        criarElemento('h3', '', time.nome),
        criarElemento('p', '', time.descricao || 'Sem descrição.'),
        criarElemento('p', 'meta', `Integrantes: ${time.integrantes}/${time.max_integrantes}`),
        criarElemento('p', 'meta', time.meuPapel === 'lider'
          ? 'Você é líder deste time.'
          : time.meuPapel === 'membro' ? 'Você participa deste time.' : 'Você ainda não participa deste time.')
      );
      if (time.solicitacaoPendente) {
        cartao.append(criarElemento('p', 'meta', 'Sua solicitação está pendente.'));
      }
      cartao.append(botao('Ver detalhes', () => carregarDetalhe(time.id)));
      return cartao;
    }));
    definirStatus('');
  }

  function montarFormularioEdicao(time) {
    const formulario = criarElemento('form', 'team-edit-form');
    const nomeLabel = criarElemento('label', '', 'Nome');
    nomeLabel.htmlFor = `team-edit-name-${time.id}`;
    const nome = criarElemento('input');
    nome.id = nomeLabel.htmlFor;
    nome.name = 'nome';
    nome.maxLength = 80;
    nome.required = true;
    nome.value = time.nome;

    const descricaoLabel = criarElemento('label', '', 'Descrição');
    descricaoLabel.htmlFor = `team-edit-description-${time.id}`;
    const descricao = criarElemento('textarea');
    descricao.id = descricaoLabel.htmlFor;
    descricao.name = 'descricao';
    descricao.maxLength = 1000;
    descricao.rows = 3;
    descricao.value = time.descricao || '';

    const capacidadeLabel = criarElemento('label', '', 'Limite proposto de integrantes');
    capacidadeLabel.htmlFor = `team-edit-capacity-${time.id}`;
    const capacidade = criarElemento('select');
    capacidade.id = capacidadeLabel.htmlFor;
    capacidade.name = 'max_integrantes';
    for (let valor = 2; valor <= 5; valor += 1) {
      const opcao = criarElemento('option', '', String(valor));
      opcao.value = String(valor);
      opcao.selected = valor === time.max_integrantes;
      capacidade.append(opcao);
    }

    const salvar = criarElemento('button', 'button-primary', 'Salvar alterações');
    salvar.type = 'submit';
    formulario.append(nomeLabel, nome, descricaoLabel, descricao, capacidadeLabel, capacidade, salvar);
    formulario.addEventListener('submit', (evento) => {
      evento.preventDefault();
      executarAcao('Informações do time atualizadas.', async () => {
        await api(`times/${encodeURIComponent(time.id)}`, {
          metodo: 'PATCH',
          corpo: {
            nome: nome.value,
            descricao: descricao.value,
            max_integrantes: Number(capacidade.value)
          }
        });
      });
    });
    return formulario;
  }

  function montarMembros(time, container) {
    const listaMembros = criarElemento('ul');
    for (const membro of time.membros) {
      const linha = criarElemento('li', '', `${membro.nome || 'Jogador'}${membro.jogador_id === time.lider_id ? ' — líder' : ''}`);
      if (time.meuPapel === 'lider' && membro.jogador_id !== time.lider_id) {
        linha.append(' ', botao('Remover', () => executarAcao('Integrante removido.', async () => {
          await api(`times/${encodeURIComponent(time.id)}/membros/${encodeURIComponent(membro.jogador_id)}`, {
            metodo: 'DELETE'
          });
        })));
      }
      listaMembros.append(linha);
    }
    container.append(listaMembros);
  }

  function montarSolicitacoes(time, container) {
    if (time.meuPapel !== 'lider' || !time.solicitacoes.length) return;
    container.append(criarElemento('h3', '', 'Solicitações de entrada'));
    const listaSolicitacoes = criarElemento('ul');
    for (const solicitacao of time.solicitacoes) {
      const linha = criarElemento('li', '', solicitacao.nome || 'Jogador');
      linha.append(' ',
        botao('Aprovar', () => responderSolicitacao(solicitacao.id, true)),
        ' ',
        botao('Recusar', () => responderSolicitacao(solicitacao.id, false))
      );
      listaSolicitacoes.append(linha);
    }
    container.append(listaSolicitacoes);
  }

  function montarTransferencia(time, container) {
    if (time.meuPapel !== 'lider') return;
    const integrantesElegiveis = time.membros.filter((membro) => membro.jogador_id !== time.lider_id);
    if (!integrantesElegiveis.length) return;
    const area = criarElemento('div', 'team-transfer');
    const label = criarElemento('label', '', 'Transferir liderança para');
    const seletor = criarElemento('select');
    seletor.setAttribute('aria-label', 'Novo líder');
    for (const membro of integrantesElegiveis) {
      const opcao = criarElemento('option', '', membro.nome || 'Jogador');
      opcao.value = membro.jogador_id;
      seletor.append(opcao);
    }
    area.append(label, seletor, botao('Transferir liderança', () => executarAcao(
      'Liderança transferida.',
      async () => api(`times/${encodeURIComponent(time.id)}/transferir-lideranca`, {
        metodo: 'POST',
        corpo: { novo_lider_id: seletor.value }
      })
    )));
    container.append(area);
  }

  async function responderSolicitacao(id, aceitar) {
    await executarAcao(aceitar ? 'Solicitação aprovada.' : 'Solicitação recusada.', async () => {
      await api(`times/solicitacoes/${encodeURIComponent(id)}`, {
        metodo: 'PATCH',
        corpo: { aceitar }
      });
    });
  }

  async function carregarDetalhe(id) {
    timeSelecionadoId = id;
    detalhe.hidden = false;
    detalhe.replaceChildren(criarElemento('p', 'meta', 'Carregando detalhes...'));
    try {
      const { time } = await api(`times/${encodeURIComponent(id)}`);
      detalhe.replaceChildren();
      detalhe.append(
        criarElemento('h2', '', time.nome),
        criarElemento('p', '', time.descricao || 'Sem descrição.'),
        criarElemento('p', 'meta', `Líder: ${time.lider.nome || 'Jogador'} • Integrantes: ${time.membros.length}/${time.max_integrantes}`),
        criarElemento('h3', '', 'Integrantes')
      );
      montarMembros(time, detalhe);
      montarSolicitacoes(time, detalhe);

      if (time.meuPapel === 'lider') {
        detalhe.append(criarElemento('h3', '', 'Editar informações'));
        detalhe.append(montarFormularioEdicao(time));
        montarTransferencia(time, detalhe);
      } else if (time.meuPapel === 'membro') {
        detalhe.append(botao('Sair do time', () => executarAcao('Você saiu do time.', async () => {
          await api(`times/${encodeURIComponent(time.id)}/sair`, { metodo: 'POST' });
        })));
      } else if (time.solicitacaoPendente) {
        detalhe.append(criarElemento('p', 'meta', 'Sua solicitação está aguardando resposta da liderança.'));
      } else if (time.membros.length < time.max_integrantes) {
        detalhe.append(botao('Solicitar entrada', () => executarAcao('Solicitação enviada.', async () => {
          await api(`times/${encodeURIComponent(time.id)}/solicitacoes`, { metodo: 'POST', corpo: {} });
        })));
      } else {
        detalhe.append(criarElemento('p', 'meta', 'Este time está completo.'));
      }
      detalhe.append(botao('Fechar detalhes', () => {
        detalhe.hidden = true;
        timeSelecionadoId = null;
      }));
    } catch (erro) {
      detalhe.replaceChildren(criarElemento('p', 'meta', erro.message));
    }
  }

  formularioCriacao.addEventListener('submit', (evento) => {
    evento.preventDefault();
    const dados = new FormData(formularioCriacao);
    executarAcao('Time criado.', async () => {
      await api('times', {
        metodo: 'POST',
        corpo: {
          nome: dados.get('nome'),
          descricao: dados.get('descricao'),
          max_integrantes: Number(dados.get('max_integrantes'))
        }
      });
      formularioCriacao.reset();
      $('#team-capacity').value = '5';
    });
  });

  carregarTimes().catch((erro) => definirStatus(erro.message));
})();
