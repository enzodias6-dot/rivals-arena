/** Página de ranking: pódio, tabela ordenável, busca, limite de linhas e destaque da própria posição. */
(() => {
  'use strict';

  const { $, api, criarElemento, formatarNumero, obterUsuario } = window.RA;

  const corpo = $('#rank-body');
  const status = $('#rank-status');
  const busca = $('#rank-search');
  const podio = $('#podium');
  const contador = $('#rank-count');
  const botaoMinha = $('#rank-me');
  const cabecalhos = Array.from(document.querySelectorAll('.rank-table th[data-campo]'));
  const chips = Array.from(document.querySelectorAll('[data-limite]'));

  const estado = { lista: [], campo: 'posicao', direcao: 1, limite: 0, meuNome: null };

  const aproveitamento = (jogador) => {
    const total = jogador.vitorias + jogador.derrotas;
    return total ? Math.round((jogador.vitorias / total) * 100) : null;
  };

  const valorDe = (jogador, campo) => (campo === 'aproveitamento' ? (aproveitamento(jogador) ?? -1) : jogador[campo]);

  function comparar(a, b) {
    const va = valorDe(a, estado.campo);
    const vb = valorDe(b, estado.campo);
    const resultado = typeof va === 'string' ? va.localeCompare(vb, 'pt-BR') : va - vb;
    return resultado * estado.direcao || a.posicao - b.posicao;
  }

  function criarLinha(jogador) {
    const souEu = jogador.nome === estado.meuNome;
    const linha = criarElemento('tr', souEu ? 'is-me' : '');
    const nome = criarElemento('td', '', jogador.nome);
    if (souEu) nome.append(criarElemento('span', 'badge-me', 'Você'));

    const taxa = aproveitamento(jogador);
    linha.append(
      criarElemento('td', 'rank-pos', String(jogador.posicao)),
      nome,
      criarElemento('td', 'num', String(jogador.vitorias)),
      criarElemento('td', 'num col-sec', String(jogador.derrotas)),
      criarElemento('td', 'num col-sec', taxa === null ? '—' : `${taxa}%`),
      criarElemento('td', 'num rank-score', formatarNumero(jogador.pontos))
    );
    return linha;
  }

  function montarPodio() {
    podio.replaceChildren(...estado.lista.slice(0, 3).map((jogador) => {
      const cartao = criarElemento('article', `podium-card place-${jogador.posicao}`);
      const pontos = criarElemento('p', 'podium-points', formatarNumero(jogador.pontos));
      pontos.append(criarElemento('small', '', ' pontos'));
      cartao.append(
        criarElemento('span', 'podium-place', `${jogador.posicao}º lugar`),
        criarElemento('h2', '', jogador.nome),
        pontos,
        criarElemento('p', 'meta', `${jogador.vitorias} vitória${jogador.vitorias === 1 ? '' : 's'} • ${jogador.derrotas} derrota${jogador.derrotas === 1 ? '' : 's'}`)
      );
      return cartao;
    }));
    podio.hidden = !estado.lista.length;
  }

  function renderizar() {
    if (!estado.lista.length) return;
    const termo = busca.value.trim().toLocaleLowerCase('pt-BR');
    const base = estado.limite ? estado.lista.filter((jogador) => jogador.posicao <= estado.limite) : estado.lista;

    const visiveis = base
      .filter((jogador) => `${jogador.posicao} ${jogador.nome} ${jogador.vitorias} ${formatarNumero(jogador.pontos)}`.toLocaleLowerCase('pt-BR').includes(termo))
      .sort(comparar);

    corpo.replaceChildren(...visiveis.map(criarLinha));
    contador.textContent = `Exibindo ${visiveis.length} de ${estado.lista.length}`;
    status.textContent = visiveis.length ? '' : 'Nenhum jogador encontrado.';
  }

  function ordenarPor(campo) {
    if (estado.campo === campo) {
      estado.direcao *= -1;
    } else {
      estado.campo = campo;
      estado.direcao = ['posicao', 'nome'].includes(campo) ? 1 : -1;
    }
    cabecalhos.forEach((th) => {
      if (th.dataset.campo === estado.campo) th.setAttribute('aria-sort', estado.direcao === 1 ? 'ascending' : 'descending');
      else th.removeAttribute('aria-sort');
    });
    renderizar();
  }

  function definirLimite(limite) {
    estado.limite = limite;
    chips.forEach((chip) => chip.setAttribute('aria-pressed', String(Number(chip.dataset.limite) === limite)));
    renderizar();
  }

  cabecalhos.forEach((th) => $('button', th).addEventListener('click', () => ordenarPor(th.dataset.campo)));
  chips.forEach((chip) => chip.addEventListener('click', () => definirLimite(Number(chip.dataset.limite))));
  busca.addEventListener('input', renderizar);

  botaoMinha.addEventListener('click', () => {
    if (!corpo.querySelector('.is-me')) {
      busca.value = '';
      definirLimite(0);
    }
    const alvo = corpo.querySelector('.is-me');
    if (!alvo) return;
    alvo.scrollIntoView({ block: 'center' });
    alvo.classList.add('flash');
    setTimeout(() => alvo.classList.remove('flash'), 1600);
  });

  const usuarioPronto = obterUsuario().then((usuario) => { estado.meuNome = usuario.nome; }).catch(() => {});

  api('ranking')
    .then(async ({ ranking }) => {
      if (!ranking.length) {
        status.textContent = 'Nenhum combatente cadastrado ainda.';
        return;
      }
      await usuarioPronto;
      estado.lista = ranking;
      botaoMinha.hidden = !ranking.some((jogador) => jogador.nome === estado.meuNome);
      montarPodio();
      renderizar();
    })
    .catch((erro) => {
      status.textContent = erro.message;
    });
})();
