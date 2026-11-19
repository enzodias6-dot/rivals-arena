/**
 * Página 1V1: torneios, inscrições, desafios, ranking e histórico — tudo vindo do banco de dados.
 */
(() => {
  'use strict';

  const { $, api, criarElemento, formatarNumero, notificar, obterUsuario } = window.RA;

  const ROTULO_STATUS = { aberto: 'Inscrições abertas', em_breve: 'Próxima temporada', encerrado: 'Encerrado' };
  const COR_STATUS = { aberto: 'green', em_breve: 'gray', encerrado: 'gray' };
  const ROTULO_DESAFIO = { pendente: 'Pendente', aceito: 'Aceito', recusado: 'Recusado' };
  const COR_DESAFIO = { pendente: 'gray', aceito: 'green', recusado: '' };

  const FILTROS = [['todos', 'Todos'], ['aberto', 'Abertos'], ['em_breve', 'Em breve'], ['encerrado', 'Encerrados']];

  const estado = { torneios: [], usuario: null, filtro: 'todos' };

  // ---------- utilidades ----------
  function formatarData(texto) {
    const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto || '');
    return partes ? `${partes[3]}/${partes[2]}/${partes[1]}` : 'A definir';
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
    }
  }

  // ---------- torneios ----------
  function criarCartaoTorneio(torneio) {
    const lotado = torneio.inscritos >= torneio.vagas;
    const cartao = criarElemento('article', 'duel-card');

    cartao.append(criarElemento('span', `pill ${COR_STATUS[torneio.status] || 'gray'}`, ROTULO_STATUS[torneio.status] || torneio.status));
    cartao.append(criarElemento('h3', '', torneio.nome), criarElemento('p', '', torneio.descricao));

    const info = criarElemento('p');
    detalhe(info, 'Formato', torneio.formato);
    detalhe(info, 'Vagas', `${torneio.vagas} jogadores (${torneio.inscritos} inscrito${torneio.inscritos === 1 ? '' : 's'})`);
    detalhe(info, 'Início', formatarData(torneio.inicio), true);
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

        const vencedor = criarElemento('div', 'history-player');
        vencedor.append(criarElemento('strong', '', partida.vencedor), criarElemento('small', '', 'Vencedor'));

        const perdedor = criarElemento('div', 'history-player');
        const contexto = [partida.fase, partida.torneio].filter(Boolean).join(' • ');
        perdedor.append(criarElemento('strong', '', partida.perdedor), criarElemento('small', '', contexto || 'Partida'));

        linha.append(vencedor, criarElemento('div', 'history-score', `${partida.placarVencedor} — ${partida.placarPerdedor}`), perdedor);
        return linha;
      }));
    } catch (erro) {
      mostrarVazio(container, erro.message);
    }
  }

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
  obterUsuario().then((usuario) => { estado.usuario = usuario; }).catch(() => {});
  carregarTorneios();
  carregarResumo();
  carregarRanking();
  carregarHistorico();
  carregarDesafios();
})();
