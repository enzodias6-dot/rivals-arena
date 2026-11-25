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
  const botaoExcluirConta = $('#delete-account-button');
  const feedbackExclusao = $('#delete-account-feedback');
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

  botaoExcluirConta.addEventListener('click', async () => {
    const confirmado = window.confirm(
      'Tem certeza de que deseja excluir sua conta? Seu nome e email serão anonimizados e esta ação não poderá ser desfeita. O histórico de partidas será preservado.'
    );
    if (!confirmado) return;

    botaoExcluirConta.disabled = true;
    feedbackExclusao.hidden = false;
    feedbackExclusao.textContent = 'Processando exclusão da conta...';

    try {
      const resultado = await api('conta', { metodo: 'DELETE' });
      limparSessaoLocal();
      window.alert(resultado.mensagem || 'Conta excluída.');
      window.location.assign(raiz + 'acesso.html');
    } catch (erro) {
      feedbackExclusao.textContent = erro.message || 'Não foi possível excluir a conta.';
      feedbackExclusao.setAttribute('role', 'alert');
      botaoExcluirConta.disabled = false;
    }
  });

  obterUsuario()
    .then((usuario) => {
      usuarioAtual = usuario;
      const partidas = usuario.vitorias + usuario.derrotas;

      [
        ['Perfil', usuario.perfil || '—'],
        ['Nível', usuario.nivel ?? '—'],
        ['Vitórias', usuario.vitorias],
        ['Derrotas', usuario.derrotas],
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
