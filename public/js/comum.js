/**
 * Código compartilhado por todas as páginas: menu, requisições à API, avisos (toast)
 * e animação de entrada. Disponibiliza o objeto global `RA` para os scripts de cada página.
 */
(() => {
  'use strict';

  const $ = (seletor, contexto = document) => contexto.querySelector(seletor);
  const pagina = document.body.dataset.page;
  const raiz = location.pathname.includes('/pages/') ? '../' : '';
  const caminhoAcesso = `${raiz}acesso.html`;
  const CHAVE_USUARIO = 'ra-user';

  // ---- Utilidades ----
  function criarElemento(tag, classe, texto) {
    const elemento = document.createElement(tag);
    if (classe) elemento.className = classe;
    if (texto !== null && texto !== undefined) elemento.textContent = texto;
    return elemento;
  }

  const formatarNumero = (valor) => Number(valor).toLocaleString('pt-BR');

  // ---- Usuário em cache (só para exibir o nome mais rápido; a segurança é feita no servidor) ----
  function lerUsuarioEmCache() {
    try {
      return JSON.parse(sessionStorage.getItem(CHAVE_USUARIO) || 'null');
    } catch (erro) {
      return null;
    }
  }

  function guardarUsuario(usuario) {
    try {
      sessionStorage.setItem(CHAVE_USUARIO, JSON.stringify(usuario));
    } catch (erro) {
      /* armazenamento indisponível: segue sem cache */
    }
  }

  function limparSessaoLocal() {
    try {
      sessionStorage.removeItem(CHAVE_USUARIO);
    } catch (erro) {
      /* ignorado */
    }
  }

  // ---- API ----
  async function api(caminho, { metodo = 'GET', corpo, naoRedirecionar401 = false } = {}) {
    const opcoes = { method: metodo, headers: { Accept: 'application/json' } };
    if (corpo !== undefined) {
      opcoes.headers['Content-Type'] = 'application/json';
      opcoes.body = JSON.stringify(corpo);
    }

    let resposta;
    try {
      resposta = await fetch(`${raiz}api/${caminho}`, opcoes);
    } catch (erro) {
      throw new Error('Não foi possível conectar ao servidor. Verifique se ele está em execução.');
    }

    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      if (resposta.status === 401 && !naoRedirecionar401) {
        limparSessaoLocal();
        window.location.href = caminhoAcesso;
        return new Promise(() => {}); // a página está sendo trocada
      }
      throw new Error(dados.mensagem || 'Não foi possível falar com o servidor.');
    }

    return dados;
  }

  async function obterUsuario() {
    const { usuario } = await api('perfil');
    guardarUsuario(usuario);
    return usuario;
  }

  function sair() {
    api('logout', { metodo: 'POST', naoRedirecionar401: true })
      .catch(() => {})
      .finally(() => {
        limparSessaoLocal();
        window.location.href = caminhoAcesso;
      });
  }

  // ---- Cabeçalho e menu ----
  const itensMenu = [
    ['index.html', 'Central'],
    ['pages/campeonatos.html', '1V1'],
    ['pages/ranking.html', 'Ranking'],
    ['pages/arsenal.html', 'Arsenal'],
    ['pages/times.html', 'Times'],
    ['pages/perfil.html', 'Perfil'],
    ['#sair', 'Sair']
  ];

  function itemAtivo(arquivo) {
    const caminho = location.pathname;
    if (arquivo === 'index.html') {
      return caminho === '/' || caminho.endsWith('/index.html') || caminho.endsWith('/central.html');
    }
    return caminho.endsWith(`/${arquivo}`);
  }

  function montarCabecalho() {
    const cabecalho = $('#hdr');
    if (!cabecalho) return;

    const logo = (destino) => `<a class="logo" href="${destino}"><img class="logo-img" src="${raiz}img/logo.png" alt="" width="40" height="40"><b class="logo-text">RIVALS <span>ARENA</span></b></a>`;

    if (pagina === 'auth') {
      cabecalho.innerHTML = `${logo('acesso.html')}`;
      return;
    }

    const links = itensMenu.map(([destino, rotulo]) => {
      if (destino === '#sair') return `<a href="#" id="logout">${rotulo}</a>`;
      const ativo = itemAtivo(destino);
      return `<a${ativo ? ' class="active" aria-current="page"' : ''} href="${raiz}${destino}">${rotulo}</a>`;
    }).join('');

    cabecalho.innerHTML = `${logo(`${raiz}index.html`)}<button class="menu-toggle" type="button" aria-label="Abrir menu" aria-expanded="false" aria-controls="menu-principal">☰</button><nav id="menu-principal" aria-label="Menu principal">${links}</nav>`;

    const botao = $('.menu-toggle', cabecalho);
    const menu = $('nav', cabecalho);

    const alternarMenu = (abrir) => {
      menu.classList.toggle('open', abrir);
      botao.setAttribute('aria-expanded', String(abrir));
      botao.setAttribute('aria-label', abrir ? 'Fechar menu' : 'Abrir menu');
      botao.textContent = abrir ? '✕' : '☰';
    };

    botao.addEventListener('click', () => alternarMenu(!menu.classList.contains('open')));
    document.addEventListener('keydown', (evento) => {
      if (evento.key === 'Escape' && menu.classList.contains('open')) {
        alternarMenu(false);
        botao.focus();
      }
    });

    $('#logout', cabecalho).addEventListener('click', (evento) => {
      evento.preventDefault();
      sair();
    });
  }

  // ---- Avisos (toast) ----
  const toast = criarElemento('div', 'toast');
  toast.setAttribute('role', 'status');
  document.body.appendChild(toast);
  let temporizadorToast;

  function notificar(mensagem) {
    toast.textContent = mensagem;
    toast.classList.add('show');
    clearTimeout(temporizadorToast);
    temporizadorToast = setTimeout(() => toast.classList.remove('show'), 3800);
  }

  // ---- Acessibilidade e comportamento geral ----
  function montarLinkDePulo() {
    const principal = $('main');
    if (!principal) return;
    principal.id = principal.id || 'conteudo';
    const link = criarElemento('a', 'skip-link', 'Ir para o conteúdo');
    link.href = `#${principal.id}`;
    document.body.prepend(link);
  }

  // Impede arrastar imagens e links (o texto continua selecionável e copiável).
  document.addEventListener('dragstart', (evento) => {
    if (evento.target instanceof Element && evento.target.closest('img, a')) evento.preventDefault();
  });

  function ativarAnimacaoDeEntrada() {
    const alvos = document.querySelectorAll('.feature-card, .content-card, .table-wrap, .profile-panel, .page-header, .panel');
    alvos.forEach((elemento) => elemento.classList.add('reveal'));

    if (!('IntersectionObserver' in window)) {
      alvos.forEach((elemento) => elemento.classList.add('visible'));
      return;
    }

    const observador = new IntersectionObserver((entradas) => {
      entradas.forEach((entrada) => {
        if (entrada.isIntersecting) {
          entrada.target.classList.add('visible');
          observador.unobserve(entrada.target);
        }
      });
    }, { threshold: 0.08 });

    alvos.forEach((elemento) => observador.observe(elemento));
  }

  montarCabecalho();
  montarLinkDePulo();
  ativarAnimacaoDeEntrada();

  window.RA = Object.freeze({
    $, pagina, raiz, criarElemento, formatarNumero, api, obterUsuario, sair, notificar,
    lerUsuarioEmCache, guardarUsuario, limparSessaoLocal
  });
})();
