/** Página de perfil: estatísticas da conta e botão de sair. */
(() => {
  'use strict';

  const { $, api, criarElemento, formatarNumero, guardarUsuario, obterUsuario, raiz, sair } = window.RA;

  const caixa = $('#profile');
  const botaoEditarNome = $('#edit-profile-name');
  const formularioNome = $('#profile-name-form');
  const campoNome = $('#profile-name-input');
  const botaoCancelarNome = $('#cancel-profile-name');
  const botaoSalvarNome = $('#save-profile-name');
  const feedbackNome = $('#profile-name-feedback');
  const estatisticas = $('#profile-stats');
  let usuarioAtual = null;
  let nomeExibido = null;

  function mostrarFeedbackNome(texto, tipo = 'status') {
    feedbackNome.textContent = texto;
    feedbackNome.hidden = !texto;
    feedbackNome.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
  }

  botaoEditarNome.addEventListener('click', () => {
    campoNome.value = usuarioAtual.nome;
    mostrarFeedbackNome('');
    formularioNome.hidden = false;
    botaoEditarNome.hidden = true;
    campoNome.focus();
  });

  botaoCancelarNome.addEventListener('click', () => {
    campoNome.value = usuarioAtual.nome;
    formularioNome.hidden = true;
    botaoEditarNome.hidden = false;
    mostrarFeedbackNome('');
  });

  formularioNome.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    botaoSalvarNome.disabled = true;
    botaoCancelarNome.disabled = true;
    campoNome.disabled = true;
    mostrarFeedbackNome('Salvando nome...');

    try {
      const { usuario: atualizado } = await api('perfil', {
        metodo: 'PATCH',
        corpo: { nome: campoNome.value }
      });
      usuarioAtual = { ...usuarioAtual, ...atualizado };
      nomeExibido.textContent = usuarioAtual.nome;
      campoNome.value = usuarioAtual.nome;
      guardarUsuario(usuarioAtual);
      formularioNome.hidden = true;
      botaoEditarNome.hidden = false;
      mostrarFeedbackNome('Nome atualizado com sucesso.');
    } catch (erro) {
      mostrarFeedbackNome(erro.message || 'Não foi possível atualizar o nome.', 'error');
    } finally {
      botaoSalvarNome.disabled = false;
      botaoCancelarNome.disabled = false;
      campoNome.disabled = false;
    }
  });

  obterUsuario()
    .then((usuario) => {
      usuarioAtual = usuario;
      const empates = Number(usuario.empates) || 0;
      const partidas = usuario.vitorias + usuario.derrotas + empates;

      [
        ['Perfil', usuario.perfil || '—'],
        ['Nível', usuario.nivel ?? '—'],
        ['Vitórias', usuario.vitorias],
        ['Derrotas', usuario.derrotas],
        ['Empates', empates],
        ['Partidas', partidas],
        ['Pontos', formatarNumero(usuario.pontos)],
        ['Posição', usuario.posicao ? `#${usuario.posicao}` : '—'],
        ['Aproveitamento', partidas ? `${Math.round((usuario.vitorias / partidas) * 100)}%` : '—']
      ].forEach(([rotulo, valor]) => {
        const item = criarElemento('div', 'stat');
        item.append(criarElemento('strong', '', valor), criarElemento('span', '', rotulo));
        estatisticas.append(item);
      });
      estatisticas.hidden = false;

      const avatar = criarElemento('div', 'profile-avatar');
      const imagem = document.createElement('img');
      imagem.src = `${raiz}img/logo.png`;
      imagem.alt = 'Rivals Arena';
      avatar.append(imagem);

      const botaoSair = criarElemento('button', 'button-secondary', 'Sair da conta');
      botaoSair.type = 'button';
      botaoSair.addEventListener('click', sair);

      nomeExibido = criarElemento('h2', '', usuario.nome);
      campoNome.value = usuario.nome;
      botaoEditarNome.hidden = false;
      caixa.replaceChildren(
        avatar,
        nomeExibido,
        botaoEditarNome,
        formularioNome,
        feedbackNome,
        criarElemento('p', 'meta', usuario.email),
        estatisticas,
        botaoSair
      );
    })
    .catch((erro) => {
      const aviso = criarElemento(
        'p',
        'meta',
        erro.message || 'Não foi possível carregar o perfil. Sua sessão não foi encerrada.'
      );
      aviso.setAttribute('role', 'alert');
      caixa.replaceChildren(aviso);
    });
})();
