/**
 * Página 1V1: torneios, inscrições, desafios, ranking e histórico — tudo vindo do banco de dados.
 */
(() => {
  'use strict';

  const { $, api, criarElemento, formatarNumero, notificar, obterUsuario } = window.RA;

  const ROTULO_STATUS = { aberto: 'Inscrições abertas', em_breve: 'Próxima temporada', encerrado: 'Encerrado' };
  const COR_STATUS = { aberto: 'green', em_breve: 'gray', encerrado: 'gray' };
  const ROTULO_MODALIDADE = { '1v1': '1v1', dupla: 'Dupla', equipes: 'Equipes', solo: 'Solo' };
  const ROTULO_FORMATO = {
    eliminacao_simples: 'Eliminação simples',
    grupos: 'Fase de grupos',
    pontos: 'Pontos corridos',
    'eliminação simples': 'Eliminação simples'
  };
  const ROTULO_STATUS_INSCRICAO = { pendente: 'Pendente', aprovada: 'Aprovada', cancelada: 'Cancelada' };
  const ROTULO_DESAFIO = { pendente: 'Pendente', aceito: 'Aceito', recusado: 'Recusado' };
  const COR_DESAFIO = { pendente: 'gray', aceito: 'green', recusado: '' };

  const FILTROS = [['todos', 'Todos'], ['aberto', 'Abertos'], ['em_breve', 'Em breve'], ['encerrado', 'Encerrados']];

  const estado = { torneios: [], usuario: null, filtro: 'todos' };

  // ---------- utilidades ----------
  function formatarData(texto) {
    const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto || '');
    return partes ? `${partes[3]}/${partes[2]}/${partes[1]}` : 'A definir';
  }

  function formatarDataHora(texto) {
    if (!texto) return 'Data não informada';
    const data = new Date(texto);
    return Number.isNaN(data.getTime())
      ? 'Data não informada'
      : data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }

  const iniciais = (nome) => nome.trim().split(/\s+/).slice(0, 2).map((parte) => parte[0]).join('').toUpperCase();

  function mostrarVazio(container, texto) {
    container.replaceChildren(criarElemento('p', 'empty-state', texto));
  }

  function detalhe(paragrafo, rotulo, valor, ultimo = false) {
    paragrafo.append(criarElemento('strong', '', `${rotulo}: `), document.createTextNode(valor));
    if (!ultimo) paragrafo.append(document.createElement('br'));
  }

  // ---------- resumo ----------
  async function carregarResumo() {
    try {
      const resumo = await api('resumo');
      $('#open-count').textContent = formatarNumero(resumo.torneiosAbertos).padStart(2, '0');
      $('#player-count').textContent = formatarNumero(resumo.jogadoresInscritos);
      $('#match-count').textContent = formatarNumero(resumo.partidasConcluidas);
    } catch (erro) {
      ['#open-count', '#player-count', '#match-count'].forEach((seletor) => { $(seletor).textContent = '—'; });
      notificar(`Não foi possível carregar o resumo: ${erro.message}`);
    }
  }

  // ---------- torneios ----------
  function criarCartaoTorneio(torneio) {
    const lotado = torneio.inscritos >= torneio.vagas;
    const cartao = criarElemento('article', 'duel-card');

    cartao.append(criarElemento('span', `pill ${COR_STATUS[torneio.status] || 'gray'}`, ROTULO_STATUS[torneio.status] || torneio.status));
    cartao.append(criarElemento('h3', '', torneio.nome), criarElemento('p', '', torneio.descricao));

    const info = criarElemento('p');
    if (torneio.modalidade) detalhe(info, 'Modalidade', ROTULO_MODALIDADE[torneio.modalidade] || torneio.modalidade);
    detalhe(info, 'Formato', ROTULO_FORMATO[torneio.formato] || torneio.formato);
    detalhe(info, 'Vagas', `${torneio.vagas} jogadores (${torneio.inscritos} inscrito${torneio.inscritos === 1 ? '' : 's'})`);
    detalhe(info, 'Início', formatarData(torneio.inicio));
    detalhe(info, 'Encerramento', formatarData(torneio.encerramento), true);
    cartao.append(info);

    if (torneio.vagas > 0) {
      const ocupacao = criarElemento('progress', 'capacity');
      ocupacao.max = torneio.vagas;
      ocupacao.value = Math.min(torneio.inscritos, torneio.vagas);
      ocupacao.setAttribute('aria-label', `Vagas preenchidas: ${torneio.inscritos} de ${torneio.vagas}`);
      cartao.append(ocupacao);
    }

    const rodape = criarElemento('div', 'card-bottom');
    const legenda = torneio.status === 'aberto'
      ? (torneio.premiacao ? `Premiação: ${torneio.premiacao}` : 'Inscrições abertas')
      : torneio.status === 'em_breve' ? 'Inscrições ainda fechadas' : 'Torneio encerrado';
    rodape.append(criarElemento('span', 'muted-label', legenda));

    let botao;
    if (torneio.status === 'aberto' && torneio.inscrito) {
      botao = criarElemento('button', 'button-secondary', 'Cancelar inscrição');
      botao.addEventListener('click', () => cancelarInscricao(torneio, botao));
    } else if (torneio.status === 'aberto' && !lotado) {
      botao = criarElemento('button', 'button-primary', 'Inscrever-se');
      botao.addEventListener('click', () => abrirModal('torneio', botao, torneio.id));
    } else {
      botao = criarElemento('button', 'button-secondary', torneio.status === 'aberto' ? 'Vagas esgotadas' : torneio.status === 'em_breve' ? 'Em breve' : 'Encerrado');
      botao.disabled = true;
    }
    botao.type = 'button';
    rodape.append(botao);

    if (torneio.inscrito) cartao.prepend(criarElemento('span', 'pill green', 'Você está inscrito'));
    cartao.append(rodape);
    return cartao;
  }

  // Chips de filtro criados uma única vez (o foco do teclado não se perde ao filtrar).
  const chipsFiltro = FILTROS.map(([valor, rotulo]) => {
    const chip = criarElemento('button', 'chip', rotulo);
    const total = criarElemento('small');
    chip.type = 'button';
    chip.append(total);
    chip.addEventListener('click', () => {
      estado.filtro = valor;
      renderizarTorneios();
    });
    return { valor, chip, total };
  });
  $('#tournament-filters').append(...chipsFiltro.map(({ chip }) => chip));

  function renderizarTorneios() {
    const lista = $('#tournament-list');
    chipsFiltro.forEach(({ valor, chip, total }) => {
      total.textContent = String(valor === 'todos' ? estado.torneios.length : estado.torneios.filter((t) => t.status === valor).length);
      chip.setAttribute('aria-pressed', String(estado.filtro === valor));
    });

    const visiveis = estado.filtro === 'todos' ? estado.torneios : estado.torneios.filter((t) => t.status === estado.filtro);
    if (!visiveis.length) {
      mostrarVazio(lista, estado.torneios.length ? 'Nenhum torneio nesta situação.' : 'Nenhum torneio cadastrado ainda.');
      return;
    }
    lista.replaceChildren(...visiveis.map(criarCartaoTorneio));
  }

  async function carregarTorneios() {
    const lista = $('#tournament-list');
    try {
      const { torneios } = await api('torneios');
      estado.torneios = torneios;
      renderizarTorneios();
    } catch (erro) {
      mostrarVazio(lista, erro.message);
    }
  }

  const painelCriacao = $('#create-tournament-panel');
  const formularioCriacao = $('#create-tournament-form');
  const feedbackCriacao = $('#create-tournament-feedback');
  const botaoAbrirCriacao = $('#open-create-tournament');
  const botaoEnviarCriacao = $('#submit-create-tournament');

  function mostrarFeedbackCriacao(texto) {
    feedbackCriacao.textContent = texto;
    feedbackCriacao.hidden = !texto;
  }

  function alternarPainelCriacao(aberto) {
    painelCriacao.hidden = !aberto;
    botaoAbrirCriacao.setAttribute('aria-expanded', String(aberto));
    if (aberto) $('#create-name').focus();
    else botaoAbrirCriacao.focus();
  }

  function timestampDoFormulario(valor) {
    if (!valor) return null;
    const timestamp = new Date(valor);
    return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
  }

  botaoAbrirCriacao.addEventListener('click', () => alternarPainelCriacao(painelCriacao.hidden));
  $('#close-create-tournament').addEventListener('click', () => alternarPainelCriacao(false));

  formularioCriacao.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    mostrarFeedbackCriacao('');

    const inicio = timestampDoFormulario($('#create-start').value);
    const encerramento = timestampDoFormulario($('#create-end').value);
    if ($('#create-start').value && !inicio) {
      mostrarFeedbackCriacao('Informe uma data de início válida.');
      $('#create-start').focus();
      return;
    }
    if ($('#create-end').value && !encerramento) {
      mostrarFeedbackCriacao('Informe uma data de encerramento válida.');
      $('#create-end').focus();
      return;
    }
    if (inicio && encerramento && Date.parse(inicio) > Date.parse(encerramento)) {
      mostrarFeedbackCriacao('A data de início não pode ser posterior à data de encerramento.');
      $('#create-end').focus();
      return;
    }

    botaoEnviarCriacao.disabled = true;
    try {
      const { mensagem, campeonato } = await api('torneios', {
        metodo: 'POST',
        corpo: {
          nome: $('#create-name').value,
          descricao: $('#create-description').value,
          modalidade: $('#create-modality').value,
          formato: $('#create-format').value,
          max_participantes: Number($('#create-capacity').value),
          premio: $('#create-prize').value,
          inicio_em: inicio,
          encerramento_em: encerramento
        }
      });
      formularioCriacao.reset();
      alternarPainelCriacao(false);
      notificar(mensagem || `Campeonato "${campeonato.nome}" criado.`);
      await Promise.all([carregarTorneios(), carregarResumo()]);
    } catch (erro) {
      mostrarFeedbackCriacao(erro.message);
    } finally {
      botaoEnviarCriacao.disabled = false;
    }
  });

  async function cancelarInscricao(torneio, botao) {
    if (!window.confirm(`Cancelar sua inscrição em "${torneio.nome}"?`)) return;
    botao.disabled = true;
    try {
      const { mensagem } = await api(`torneios/${torneio.id}/inscricao`, { metodo: 'DELETE' });
      notificar(mensagem);
    } catch (erro) {
      notificar(erro.message);
    }
    await Promise.all([carregarTorneios(), carregarResumo()]);
  }

  // ---------- ranking e histórico ----------
  async function carregarRanking() {
    const container = $('#leaderboard');
    try {
      const { ranking } = await api('ranking');
      if (!ranking.length) {
        mostrarVazio(container, 'Nenhum combatente no ranking ainda.');
        return;
      }

      container.replaceChildren(...ranking.slice(0, 3).map((jogador) => {
        const linha = criarElemento('div', 'leader-row');
        const identificacao = criarElemento('div', 'player-line');
        const nome = criarElemento('div');
        nome.append(
          criarElemento('strong', '', jogador.nome),
          criarElemento('small', '', `${jogador.vitorias} vitória${jogador.vitorias === 1 ? '' : 's'} • ${jogador.derrotas} derrota${jogador.derrotas === 1 ? '' : 's'}`)
        );
        identificacao.append(criarElemento('div', 'player-avatar', iniciais(jogador.nome)), nome);

        const pontos = criarElemento('div', 'rank-points', formatarNumero(jogador.pontos));
        pontos.append(criarElemento('small', '', 'pontos'));

        linha.append(criarElemento('span', 'rank-number', String(jogador.posicao).padStart(2, '0')), identificacao, pontos);
        return linha;
      }));
    } catch (erro) {
      mostrarVazio(container, erro.message);
    }
  }

  async function carregarHistorico() {
    const container = $('#match-history');
    try {
      const { partidas } = await api('partidas');
      if (!partidas.length) {
        mostrarVazio(container, 'Nenhuma partida concluída ainda.');
        return;
      }

      container.replaceChildren(...partidas.map((partida) => {
        const linha = criarElemento('article', 'history-row');
        const primeiroNome = partida.vencedor || partida.jogador1 || 'Jogador não informado';
        const segundoNome = partida.perdedor || partida.jogador2 || 'Jogador não informado';
        const esquerda = criarElemento('div', 'history-player');
        esquerda.append(
          criarElemento('strong', '', primeiroNome),
          criarElemento('small', '', partida.vencedor ? 'Vencedor' : 'Participante')
        );

        const direita = criarElemento('div', 'history-player');
        const contexto = [partida.fase, partida.torneio].filter(Boolean).join(' • ');
        direita.append(
          criarElemento('strong', '', segundoNome),
          criarElemento('small', '', contexto || 'Partida')
        );

        const resultado = partida.resultado && typeof partida.resultado === 'object'
          ? JSON.stringify(partida.resultado)
          : partida.resultado || '—';
        linha.append(esquerda, criarElemento('div', 'history-score', resultado), direita);
        return linha;
      }));
    } catch (erro) {
      mostrarVazio(container, erro.message);
    }
  }

  function criarChaveIdempotencia() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    if (!window.crypto?.getRandomValues) throw new Error('Este navegador não oferece geração segura de identificadores.');
    const bytes = window.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hexadecimal = [...bytes].map((valor) => valor.toString(16).padStart(2, '0')).join('');
    return `${hexadecimal.slice(0, 8)}-${hexadecimal.slice(8, 12)}-${hexadecimal.slice(12, 16)}-${hexadecimal.slice(16, 20)}-${hexadecimal.slice(20)}`;
  }

  function criarSeletorVencedor(partida) {
    const seletor = criarElemento('select');
    seletor.setAttribute('aria-label', 'Vencedor informado');
    for (const [id, nome] of [
      [partida.jogador_1_id, partida.jogador1],
      [partida.jogador_2_id, partida.jogador2]
    ]) {
      const opcao = criarElemento('option', '', nome || 'Jogador');
      opcao.value = id;
      seletor.append(opcao);
    }
    const opcaoEmpate = criarElemento('option', '', 'Empate');
    opcaoEmpate.value = '';
    seletor.append(opcaoEmpate);
    return seletor;
  }

  async function enviarAcaoResultado(caminho, corpo) {
    try {
      await api(caminho, { metodo: 'POST', corpo });
      notificar('Resultado atualizado.');
      await Promise.all([carregarAgendaPartidas(), carregarHistorico(), carregarResumo()]);
    } catch (erro) {
      notificar(erro.message);
    }
  }

  function criarFormularioResultado(partida, caminho, textoBotao) {
    const formularioResultado = criarElemento('form', 'match-result-form');
    const vencedor = criarSeletorVencedor(partida);
    const placar = criarElemento('input');
    placar.type = 'text';
    placar.maxLength = 63;
    placar.required = true;
    placar.placeholder = 'Ex.: 2-1';
    placar.setAttribute('aria-label', 'Placar informado');
    const enviar = criarElemento('button', 'button-primary compact', textoBotao);
    enviar.type = 'submit';
    formularioResultado.append(vencedor, placar, enviar);
    formularioResultado.addEventListener('submit', (evento) => {
      evento.preventDefault();
      enviar.disabled = true;
      let chave;
      try {
        chave = criarChaveIdempotencia();
      } catch (erro) {
        notificar(erro.message);
        enviar.disabled = false;
        return;
      }
      enviarAcaoResultado(caminho, {
        vencedor_id: vencedor.value || null,
        resultado: placar.value.trim(),
        chave_idempotencia: chave
      }).finally(() => { enviar.disabled = false; });
    });
    return formularioResultado;
  }

  function criarFormularioResolucaoAdmin(partida) {
    const formulario = criarElemento('form', 'match-result-form');
    const vencedor = criarSeletorVencedor(partida);
    const placar = criarElemento('input');
    placar.type = 'text';
    placar.maxLength = 63;
    placar.required = true;
    placar.placeholder = 'Placar final (ex.: 2-1 ou 1-1)';
    placar.setAttribute('aria-label', 'Placar definido pelo administrador');

    const justificativa = criarElemento('textarea');
    justificativa.maxLength = 1000;
    justificativa.required = true;
    justificativa.rows = 3;
    justificativa.placeholder = 'Justifique a decisão administrativa';
    justificativa.setAttribute('aria-label', 'Justificativa obrigatória da decisão');

    const enviar = criarElemento('button', 'button-primary compact', 'Resolver contestação');
    enviar.type = 'submit';
    formulario.append(vencedor, placar, justificativa, enviar);
    formulario.addEventListener('submit', (evento) => {
      evento.preventDefault();
      enviar.disabled = true;
      let chave;
      try {
        chave = criarChaveIdempotencia();
      } catch (erro) {
        notificar(erro.message);
        enviar.disabled = false;
        return;
      }
      enviarAcaoResultado(`partidas/${encodeURIComponent(partida.id)}/resultado/resolver`, {
        vencedor_id: vencedor.value || null,
        resultado: placar.value.trim(),
        justificativa: justificativa.value.trim(),
        chave_idempotencia: chave
      }).finally(() => { enviar.disabled = false; });
    });
    return formulario;
  }

  async function carregarAgendaPartidas() {
    const container = $('#match-agenda');
    try {
      const { partidas } = await api('partidas/agenda');
      if (!partidas.length) {
        mostrarVazio(container, 'Nenhuma partida vinculada à sua conta.');
        return;
      }

      container.replaceChildren(...partidas.map((partida) => {
        const cartao = criarElemento('article', 'match-agenda-card');
        const nomes = `${partida.jogador1 || 'Jogador'} × ${partida.jogador2 || 'Jogador'}`;
        cartao.append(
          criarElemento('h3', '', nomes),
          criarElemento('p', 'meta', [
            partida.campeonato,
            partida.fase,
            partida.agendada_para ? formatarDataHora(partida.agendada_para) : null,
            partida.status
          ].filter(Boolean).join(' • '))
        );

        const resultado = partida.resultado;
        if (resultado?.status === 'confirmada') {
          if (resultado.vencedor_id === null) {
            cartao.append(criarElemento('p', '', 'Partida confirmada como empate.'));
          } else {
            const vencedor = resultado.vencedor_id === partida.jogador_1_id
              ? partida.jogador1
              : partida.jogador2;
            cartao.append(criarElemento('p', '', `Resultado confirmado. Vencedor: ${vencedor || 'participante'}.`));
          }
          cartao.append(criarElemento('p', 'meta', resultado.resultado || 'Placar indisponível.'));
        } else if (resultado?.status === 'disputada') {
          const nomeRelator = resultado.reportado_por === partida.jogador_1_id
            ? partida.jogador1 : partida.jogador2;
          const nomeContestador = resultado.contestado_por === partida.jogador_1_id
            ? partida.jogador1 : partida.jogador2;
          cartao.append(
            criarElemento('p', 'form-error', 'Resultado divergente: aguarda resolução autorizada.'),
            criarElemento('p', 'meta', `Relato de ${nomeRelator || 'participante'}: ${resultado.resultado || 'Placar indisponível.'}`),
            criarElemento('p', 'meta', `Contestação de ${nomeContestador || 'participante'}: ${resultado.resultado_contestado || 'Placar indisponível.'}`)
          );
          if (estado.usuario?.perfil === 'admin') {
            cartao.append(
              criarElemento('p', 'meta', 'Como administrador, escolha um dos relatos ou informe um terceiro resultado. A justificativa ficará registrada no histórico.'),
              criarFormularioResolucaoAdmin(partida)
            );
          }
        } else if (resultado?.status === 'aguardando_confirmacao') {
          cartao.append(
            criarElemento('p', '', `Resultado informado por ${resultado.reportado_por === estado.usuario?.id ? 'você' : 'seu adversário'}; aguarda confirmação.`),
            criarElemento('p', 'meta', resultado.resultado || 'Placar indisponível.')
          );
          if (resultado.reportado_por !== estado.usuario?.id) {
            const confirmar = criarElemento('button', 'button-primary compact', 'Confirmar resultado');
            confirmar.type = 'button';
            confirmar.addEventListener('click', () => {
              let chave;
              try {
                chave = criarChaveIdempotencia();
              } catch (erro) {
                notificar(erro.message);
                return;
              }
              enviarAcaoResultado(`partidas/${encodeURIComponent(partida.id)}/resultado/confirmar`, {
                chave_idempotencia: chave
              });
            });
            cartao.append(confirmar);
            cartao.append(criarFormularioResultado(
              partida,
              `partidas/${encodeURIComponent(partida.id)}/resultado/contestar`,
              'Contestar resultado',
              true
            ));
          }
        } else if (!['concluida', 'cancelada'].includes(partida.status)) {
          cartao.append(criarFormularioResultado(
            partida,
            `partidas/${encodeURIComponent(partida.id)}/resultado`,
            'Enviar resultado'
          ));
        }

        if (partida.criador_id === estado.usuario?.id &&
            ['agendada', 'em_andamento'].includes(partida.status)) {
          const formularioAgendamento = criarElemento('form', 'match-result-form');
          const data = criarElemento('input');
          data.type = 'datetime-local';
          data.required = true;
          data.setAttribute('aria-label', 'Data e hora da partida');
          const salvar = criarElemento('button', 'button-secondary compact', 'Agendar partida');
          salvar.type = 'submit';
          formularioAgendamento.append(data, salvar);
          formularioAgendamento.addEventListener('submit', (evento) => {
            evento.preventDefault();
            const timestamp = new Date(data.value);
            if (Number.isNaN(timestamp.getTime())) {
              notificar('Informe uma data de agendamento válida.');
              return;
            }
            executarAgendamento(partida.id, timestamp.toISOString());
          });
          cartao.append(formularioAgendamento);
        }
        return cartao;
      }));
    } catch (erro) {
      mostrarVazio(container, erro.message);
    }
  }

  async function executarAgendamento(partidaId, agendadaPara) {
    try {
      await api(`partidas/${encodeURIComponent(partidaId)}/agendamento`, {
        metodo: 'PATCH',
        corpo: { agendada_para: agendadaPara }
      });
      notificar('Partida agendada.');
      await carregarAgendaPartidas();
    } catch (erro) {
      notificar(erro.message);
    }
  }

  async function carregarHistoricoInscricoes() {
    const container = $('#registration-history');
    try {
      const { inscricoes } = await api('historico/inscricoes');
      if (!inscricoes.length) {
        mostrarVazio(container, 'Nenhuma inscrição encontrada.');
        return;
      }

      container.replaceChildren(...inscricoes.map((inscricao) => {
        const linha = criarElemento('article', 'history-row');
        const campeonato = criarElemento('div', 'history-player');
        const modalidade = ROTULO_MODALIDADE[inscricao.modalidade] || inscricao.modalidade;
        const formato = ROTULO_FORMATO[inscricao.formato] || inscricao.formato;
        const detalhes = [modalidade, formato].filter(Boolean).join(' • ');
        campeonato.append(
          criarElemento('strong', '', inscricao.campeonato || 'Campeonato indisponível'),
          criarElemento('small', '', detalhes || 'Detalhes indisponíveis')
        );

        const data = criarElemento('div', 'history-score', formatarDataHora(inscricao.inscrito_em));
        const status = criarElemento('div', 'history-player');
        const statusAtivo = inscricao.status === 'aprovada';
        status.append(
          criarElemento('small', '', 'Status'),
          criarElemento(
            'span',
            `pill ${statusAtivo ? 'green' : 'gray'}`,
            ROTULO_STATUS_INSCRICAO[inscricao.status] || inscricao.status
          )
        );

        linha.append(campeonato, data, status);
        return linha;
      }));
    } catch (erro) {
      mostrarVazio(container, erro.message);
    }
  }

  const botaoHistoricoPartidas = $('#history-matches-tab');
  const botaoHistoricoInscricoes = $('#history-registrations-tab');
  const painelHistoricoPartidas = $('#history-matches-panel');
  const painelHistoricoInscricoes = $('#history-registrations-panel');
  const tituloHistorico = $('#history-title');

  function selecionarCategoriaHistorico(categoria) {
    const mostrarPartidas = categoria === 'partidas';
    botaoHistoricoPartidas.setAttribute('aria-pressed', String(mostrarPartidas));
    botaoHistoricoInscricoes.setAttribute('aria-pressed', String(!mostrarPartidas));
    painelHistoricoPartidas.hidden = !mostrarPartidas;
    painelHistoricoInscricoes.hidden = mostrarPartidas;
    tituloHistorico.textContent = mostrarPartidas ? 'Histórico de Partidas' : 'Histórico de Inscrições';
  }

  botaoHistoricoPartidas.addEventListener('click', () => selecionarCategoriaHistorico('partidas'));
  botaoHistoricoInscricoes.addEventListener('click', () => selecionarCategoriaHistorico('inscricoes'));

  // ---------- desafios ----------
  async function responderDesafio(desafio, acao) {
    try {
      const { mensagem } = await api(`desafios/${desafio.id}`, { metodo: 'PATCH', corpo: { acao } });
      notificar(mensagem);
    } catch (erro) {
      notificar(erro.message);
    }
    await carregarDesafios();
  }

  async function carregarDesafios() {
    const container = $('#my-challenges');
    try {
      const { desafios } = await api('desafios');
      if (!desafios.length) {
        mostrarVazio(container, 'Você ainda não enviou nem recebeu desafios.');
        return;
      }

      container.replaceChildren(...desafios.map((desafio) => {
        const linha = criarElemento('article', 'challenge-row');
        const recebido = desafio.direcao === 'recebido';

        const texto = criarElemento('div', 'challenge-text');
        texto.append(
          criarElemento('strong', '', recebido ? desafio.desafiante : desafio.desafiado),
          criarElemento('small', '', recebido ? 'desafiou você' : 'foi desafiado por você')
        );

        const acoes = criarElemento('div', 'challenge-actions');
        acoes.append(criarElemento('span', `pill ${COR_DESAFIO[desafio.status] ?? ''}`.trim(), ROTULO_DESAFIO[desafio.status] || desafio.status));

        if (recebido && desafio.status === 'pendente') {
          const aceitar = criarElemento('button', 'button-primary compact', 'Aceitar');
          const recusar = criarElemento('button', 'button-secondary compact', 'Recusar');
          aceitar.type = 'button';
          recusar.type = 'button';
          aceitar.addEventListener('click', () => responderDesafio(desafio, 'aceitar'));
          recusar.addEventListener('click', () => responderDesafio(desafio, 'recusar'));
          acoes.append(aceitar, recusar);
        }

        linha.append(texto, acoes);
        return linha;
      }));
    } catch (erro) {
      mostrarVazio(container, erro.message);
    }
  }

  // ---------- janela (modal) de inscrição / desafio ----------
  const modal = $('#action-modal');
  const formulario = $('#action-form');
  const titulo = $('#modal-title');
  const descricao = $('#modal-description');
  const campoTorneio = $('#tournament-field');
  const campoOponente = $('#opponent-field');
  const seletorTorneio = $('#tournament-select');
  const nomeJogador = $('#player-name');
  const nomeOponente = $('#opponent-name');
  const aviso = $('#form-feedback');
  const botaoEnviar = $('#submit-action');
  let modo = 'torneio';
  let abertoPor = null;

  function mostrarAviso(texto) {
    aviso.textContent = texto;
    aviso.hidden = !texto;
  }

  function torneiosDisponiveis() {
    return estado.torneios.filter((t) => t.status === 'aberto' && !t.inscrito && t.inscritos < t.vagas);
  }

  function abrirModal(novoModo, origem, torneioId) {
    modo = novoModo;
    abertoPor = origem || null;
    formulario.reset();
    mostrarAviso('');

    if (modo === 'torneio') {
      const disponiveis = torneiosDisponiveis();
      if (!disponiveis.length) {
        notificar('Não há torneios com inscrições abertas e vagas para você agora.');
        return;
      }
      seletorTorneio.replaceChildren(...disponiveis.map((t) => {
        const opcao = criarElemento('option', '', t.nome);
        opcao.value = String(t.id);
        return opcao;
      }));
      if (torneioId) seletorTorneio.value = String(torneioId);
    }

    campoTorneio.hidden = modo !== 'torneio';
    campoOponente.hidden = modo !== 'desafio';
    nomeOponente.required = modo === 'desafio';
    titulo.textContent = modo === 'torneio' ? 'Inscrição no torneio' : 'Desafiar jogador';
    descricao.textContent = modo === 'torneio'
      ? 'Confirme sua inscrição na competição escolhida.'
      : 'Informe o nome de combatente do adversário que deseja desafiar.';
    nomeJogador.value = estado.usuario ? estado.usuario.nome : '';

    modal.classList.add('open');
    (modo === 'torneio' ? seletorTorneio : nomeOponente).focus();
  }

  function fecharModal() {
    modal.classList.remove('open');
    if (abertoPor && document.contains(abertoPor)) abertoPor.focus();
    abertoPor = null;
  }

  $('#open-tournament').addEventListener('click', (evento) => abrirModal('torneio', evento.currentTarget));
  $('#open-challenge').addEventListener('click', (evento) => abrirModal('desafio', evento.currentTarget));
  $('#close-modal').addEventListener('click', fecharModal);
  modal.addEventListener('click', (evento) => {
    if (evento.target === modal) fecharModal();
  });

  document.addEventListener('keydown', (evento) => {
    if (!modal.classList.contains('open')) return;
    if (evento.key === 'Escape') {
      fecharModal();
      return;
    }
    if (evento.key !== 'Tab') return;

    // Mantém o foco do teclado dentro da janela enquanto ela estiver aberta.
    const focaveis = Array.from(modal.querySelectorAll('input:not([readonly]), select, button')).filter((el) => !el.disabled && el.offsetParent !== null);
    if (!focaveis.length) return;
    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];
    if (evento.shiftKey && document.activeElement === primeiro) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && document.activeElement === ultimo) {
      evento.preventDefault();
      primeiro.focus();
    }
  });

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    mostrarAviso('');

    let pedido;
    if (modo === 'torneio') {
      pedido = { caminho: `torneios/${encodeURIComponent(seletorTorneio.value)}/inscricao`, opcoes: { metodo: 'POST' } };
    } else {
      const oponente = nomeOponente.value.trim();
      if (!oponente) {
        mostrarAviso('Informe o nome do adversário.');
        nomeOponente.focus();
        return;
      }
      if (estado.usuario && oponente.toLowerCase() === estado.usuario.nome.toLowerCase()) {
        mostrarAviso('Você não pode desafiar a si mesmo.');
        return;
      }
      pedido = { caminho: 'desafios', opcoes: { metodo: 'POST', corpo: { oponente } } };
    }

    botaoEnviar.disabled = true;
    try {
      const { mensagem } = await api(pedido.caminho, pedido.opcoes);
      fecharModal();
      notificar(mensagem);
      await Promise.all([carregarTorneios(), carregarResumo(), carregarDesafios()]);
    } catch (erro) {
      mostrarAviso(erro.message);
    } finally {
      botaoEnviar.disabled = false;
    }
  });

  // ---------- navegação por seções: marca a seção visível ----------
  const linksSecao = Array.from(document.querySelectorAll('.section-nav a'));
  if ('IntersectionObserver' in window && linksSecao.length) {
    const observador = new IntersectionObserver((entradas) => {
      entradas.forEach((entrada) => {
        if (!entrada.isIntersecting) return;
        linksSecao.forEach((link) => {
          if (link.hash === `#${entrada.target.id}`) link.setAttribute('aria-current', 'true');
          else link.removeAttribute('aria-current');
        });
      });
    }, { rootMargin: '-25% 0px -65% 0px' });
    linksSecao.forEach((link) => {
      const alvo = document.getElementById(link.hash.slice(1));
      if (alvo) observador.observe(alvo);
    });
  }

  // ---------- inicialização ----------
  obterUsuario().then((usuario) => {
    estado.usuario = usuario;
    carregarAgendaPartidas();
  }).catch(() => {});
  carregarTorneios();
  carregarResumo();
  carregarRanking();
  carregarHistorico();
  carregarHistoricoInscricoes();
  carregarDesafios();
})();
