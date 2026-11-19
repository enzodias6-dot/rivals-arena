/** Tela de acesso: alternância entre login e cadastro, envio dos formulários e mensagens. */
(() => {
  'use strict';

  const { $, api, guardarUsuario } = window.RA;

  const formLogin = $('#login-form');
  const formCadastro = $('#register-form');
  const abaLogin = $('#tab-login');
  const abaCadastro = $('#tab-register');
  const titulo = $('#auth-title');
  const mensagem = $('#auth-message');

  function mostrarMensagem(texto, tipo = 'info') {
    mensagem.textContent = texto;
    mensagem.className = `auth-message ${tipo}`;
    mensagem.hidden = false;
  }

  function limparMensagem() {
    mensagem.hidden = true;
    mensagem.textContent = '';
    mensagem.className = 'auth-message';
  }

  function definirModo(modo) {
    const login = modo === 'login';
    formLogin.hidden = !login;
    formCadastro.hidden = login;
    abaLogin.classList.toggle('active', login);
    abaCadastro.classList.toggle('active', !login);
    abaLogin.setAttribute('aria-selected', String(login));
    abaCadastro.setAttribute('aria-selected', String(!login));
    titulo.textContent = login ? 'Entrar na arena' : 'Alistar combatente';
    limparMensagem();
  }

  const post = (caminho, corpo) => api(caminho, {
    metodo: 'POST',
    corpo,
    naoRedirecionar401: true
  });

  const irParaCentral = () => window.location.assign('/');

  /** Desativa o botão enquanto a requisição roda e devolve o texto original ao final. */
  async function enviar(formulario, textoOcupado, acao) {
    limparMensagem();
    const botao = $('button[type="submit"]', formulario);
    const textoOriginal = botao.textContent;
    botao.disabled = true;
    botao.textContent = textoOcupado;

    try {
      await acao(Object.fromEntries(new FormData(formulario).entries()));
    } catch (erro) {
      mostrarMensagem(erro.message, 'error');
    } finally {
      botao.disabled = false;
      botao.textContent = textoOriginal;
    }
  }

  abaLogin.addEventListener('click', () => definirModo('login'));
  abaCadastro.addEventListener('click', () => definirModo('register'));

  formLogin.addEventListener('submit', (evento) => {
    evento.preventDefault();
    enviar(formLogin, 'Entrando...', async (dados) => {
      const { usuario } = await post('login', dados);
      guardarUsuario(usuario);
      mostrarMensagem('Acesso liberado! Entrando na arena...', 'success');
      irParaCentral();
    });
  });

  formCadastro.addEventListener('submit', (evento) => {
    evento.preventDefault();
    enviar(formCadastro, 'Criando conta...', async (dados) => {
      const resultado = await post('usuarios', dados);
      if (!resultado.sessaoIniciada) {
        mostrarMensagem(resultado.mensagem, 'success');
        definirModo('login');
        mostrarMensagem(resultado.mensagem, 'success');
        return;
      }

      guardarUsuario(resultado.usuario);
      mostrarMensagem('Cadastro concluído! Entrando na arena...', 'success');
      irParaCentral();
    });
  });

  // Efeito visual decorativo da tela de acesso.
  const terminal = $('#boot');
  if (terminal) {
    const linhas = [
      'Inicializando conexão com a arena...',
      'Verificando credenciais de acesso...',
      'Preparando combatente...'
    ];

    linhas.forEach((linha, indice) => {
      window.setTimeout(() => {
        const item = document.createElement('div');
        item.textContent = linha;
        terminal.append(item);
      }, indice * 600);
    });
  }
})();
