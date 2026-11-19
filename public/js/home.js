/** Central (página inicial): faixa de alertas, eventos, top combatentes e nome do usuário. */
(() => {
  'use strict';

  const { $, api, criarElemento, formatarNumero, lerUsuarioEmCache, obterUsuario } = window.RA;

  const ROTULO_STATUS = { aberto: 'INSCRIÇÕES', em_breve: 'EM BREVE', encerrado: 'ENCERRADO' };

  function montarFaixa(torneios) {
    const mensagens = ['ZONA SEGURA: ARENA 01 OPERACIONAL', 'RANKING ATUALIZADO'];
    const aberto = torneios.find((torneio) => torneio.status === 'aberto');
    if (aberto) mensagens.unshift(`ALERTA: INSCRIÇÕES ABERTAS — ${aberto.nome.toUpperCase()}`);

    const faixa = $('#ticker');
    if (!faixa) return;
    faixa.replaceChildren();
    // O conjunto é repetido para a animação em loop não ter "buracos"; a cópia fica oculta para leitores de tela.
    [false, true].forEach((copia) => {
      const grupo = criarElemento('div', 'ticker-group');
      if (copia) grupo.setAttribute('aria-hidden', 'true');
      mensagens.forEach((mensagem) => grupo.append(criarElemento('span', '', `◆ ${mensagem}`)));
      faixa.append(grupo);
    });
  }

  function montarEventos(torneios) {
    const lista = $('#home-events');
    lista.replaceChildren();

    if (!torneios.length) {
      lista.append(criarElemento('li', 'muted', 'Nenhum evento cadastrado ainda.'));
      return;
    }

    torneios.forEach((torneio) => {
      const item = criarElemento('li');
      item.append(criarElemento('span', '', torneio.nome), criarElemento('b', '', ROTULO_STATUS[torneio.status] || ''));
      lista.append(item);
    });
  }

  function montarTop(ranking) {
    const lista = $('#home-top');
    lista.replaceChildren();

    if (!ranking.length) {
      lista.append(criarElemento('li', 'muted', 'Nenhum combatente ainda. Seja o primeiro!'));
      return;
    }

    ranking.slice(0, 5).forEach((entrada) => {
      const item = criarElemento('li');
      item.append(criarElemento('span', '', `${entrada.posicao}. ${entrada.nome}`));
      item.append(criarElemento('b', '', `${formatarNumero(entrada.pontos)} pts`));
      lista.append(item);
    });
  }

  const mostrarNome = (usuario) => {
    const callsign = $('#callsign');
    if (callsign) callsign.textContent = usuario.nome.toUpperCase();
  };

  // Nome do combatente
  const emCache = lerUsuarioEmCache();
  if (emCache && emCache.nome) mostrarNome(emCache);
  obterUsuario().then(mostrarNome).catch(() => {});

  // Faixa de alertas começa com o texto padrão e é atualizada quando os torneios chegam.
  montarFaixa([]);

  api('torneios')
    .then(({ torneios }) => {
      montarFaixa(torneios);
      montarEventos(torneios);
    })
    .catch((erro) => {
      const lista = $('#home-events');
      lista.replaceChildren(criarElemento('li', 'muted', erro.message));
    });

  api('ranking')
    .then(({ ranking }) => montarTop(ranking))
    .catch((erro) => {
      const lista = $('#home-top');
      lista.replaceChildren(criarElemento('li', 'muted', erro.message));
    });
})();
