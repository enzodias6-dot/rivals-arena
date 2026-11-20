'use strict';

const { randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');

const colunas = (texto) => texto === '*' ? null : texto.split(',').map((coluna) => coluna.trim());
const respostaErro = (code, message, status = 400) => ({ code, message, status });
const COLUNAS_PARTIDAS = new Set([
  'id', 'campeonato_id', 'jogador_1_id', 'jogador_2_id',
  'vencedor_id', 'resultado', 'fase', 'concluida_em', 'status', 'agendada_para'
]);

function criarSupabaseFake({
  confirmacaoEmailObrigatoria = false,
  limiteMaximoLinhas = 1000
} = {}) {
  const usuarios = new Map();
  const tabelas = {
    usuarios: [],
    campeonatos: [],
    inscricoes: [],
    desafios: [],
    partidas: [],
    times: [],
    membros_time: [],
    solicitacoes_time: [],
    arsenal_itens: [],
    partida_resultados: [],
    partida_resultado_eventos: []
  };
  const tokens = new Map();
  const refreshTokens = new Map();
  const tokensExpirados = new Set();
  const tabelasNegadas = new Set();
  const errosTabelas = new Map();
  const errosAuth = new Map();
  const escoposSignOut = [];
  const eventosResultado = new Map();
  let sessaoAtual = null;
  let quantidadeRenovacoes = 0;

  function criarSessao(usuario, sessionId = randomUUID()) {
    const sessao = {
      access_token: `access-${randomUUID()}`,
      refresh_token: `refresh-${randomUUID()}`,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: usuario
    };
    tokens.set(sessao.access_token, { userId: usuario.id, sessionId });
    refreshTokens.set(sessao.refresh_token, { userId: usuario.id, sessionId });
    return sessao;
  }

  function usuarioPublico(usuario) {
    return {
      id: usuario.id,
      email: usuario.email,
      user_metadata: { ...usuario.user_metadata }
    };
  }

  function criarAuth() {
    return {
      signUp: async ({ email, password, options }) => {
        if (errosAuth.has('signUp')) {
          return { data: { user: null, session: null }, error: errosAuth.get('signUp') };
        }
        if ([...usuarios.values()].some((usuario) => usuario.email === email.toLowerCase())) {
          return { data: { user: null, session: null }, error: respostaErro('user_already_exists', 'User already registered', 422) };
        }
        if (typeof password !== 'string' || password.length < 6) {
          return { data: { user: null, session: null }, error: respostaErro('weak_password', 'Password is too weak', 422) };
        }
        const usuario = {
          id: randomUUID(),
          email: email.toLowerCase(),
          password,
          emailConfirmado: !confirmacaoEmailObrigatoria,
          user_metadata: options?.data || {}
        };
        usuarios.set(usuario.id, usuario);
        tabelas.usuarios.push({
          id: usuario.id,
          nome: usuario.user_metadata.nome,
          email: usuario.email,
          perfil: 'jogador',
          nivel: 1,
          pontos: 0,
          vitorias: 0,
          derrotas: 0
        });
        const session = confirmacaoEmailObrigatoria ? null : criarSessao(usuario);
        return { data: { user: usuarioPublico(usuario), session }, error: null };
      },
      signInWithPassword: async ({ email, password }) => {
        if (errosAuth.has('signInWithPassword')) {
          return { data: { user: null, session: null }, error: errosAuth.get('signInWithPassword') };
        }
        const usuario = [...usuarios.values()].find((item) => item.email === email.toLowerCase());
        if (!usuario || usuario.password !== password) {
          return { data: { user: null, session: null }, error: respostaErro('invalid_credentials', 'Invalid login credentials', 400) };
        }
        if (!usuario.emailConfirmado) {
          return { data: { user: null, session: null }, error: respostaErro('email_not_confirmed', 'Email not confirmed', 400) };
        }
        const session = criarSessao(usuario);
        return { data: { user: usuarioPublico(usuario), session }, error: null };
      },
      getUser: async (accessToken) => {
        if (errosAuth.has('getUser')) {
          return { data: { user: null }, error: errosAuth.get('getUser') };
        }
        const sessao = tokens.get(accessToken);
        if (!sessao || tokensExpirados.has(accessToken)) {
          return { data: { user: null }, error: respostaErro('session_not_found', 'Invalid JWT', 401) };
        }
        return { data: { user: usuarioPublico(usuarios.get(sessao.userId)) }, error: null };
      },
      refreshSession: async ({ refresh_token: refreshToken } = {}) => {
        quantidadeRenovacoes += 1;
        await new Promise((resolver) => setImmediate(resolver));
        if (errosAuth.has('refreshSession')) {
          return { data: { user: null, session: null }, error: errosAuth.get('refreshSession') };
        }
        const sessaoAnterior = refreshTokens.get(refreshToken);
        if (!sessaoAnterior || !usuarios.has(sessaoAnterior.userId)) {
          return { data: { user: null, session: null }, error: respostaErro('refresh_token_not_found', 'Invalid Refresh Token', 400) };
        }
        refreshTokens.delete(refreshToken);
        const usuario = usuarios.get(sessaoAnterior.userId);
        const session = criarSessao(usuario, sessaoAnterior.sessionId);
        return { data: { user: usuarioPublico(usuario), session }, error: null };
      },
      setSession: async ({ access_token: accessToken, refresh_token: refreshToken }) => {
        if (errosAuth.has('setSession')) {
          return { data: { user: null, session: null }, error: errosAuth.get('setSession') };
        }
        const sessao = tokens.get(accessToken) || refreshTokens.get(refreshToken);
        if (!sessao) return { data: { user: null, session: null }, error: respostaErro('session_not_found', 'Invalid session', 400) };
        sessaoAtual = sessao;
        const usuario = usuarios.get(sessao.userId);
        return {
          data: {
            user: usuarioPublico(usuario),
            session: { access_token: accessToken, refresh_token: refreshToken, user: usuario }
          },
          error: null
        };
      },
      signOut: async ({ scope } = {}) => {
        escoposSignOut.push(scope);
        if (errosAuth.has('signOut')) return { error: errosAuth.get('signOut') };
        if (sessaoAtual) {
          const usuarioAtual = sessaoAtual.userId;
          for (const [token, sessao] of tokens) {
            const remover = scope === 'global'
              ? sessao.userId === usuarioAtual
              : scope === 'others'
                ? sessao.userId === usuarioAtual && sessao.sessionId !== sessaoAtual.sessionId
                : sessao.sessionId === sessaoAtual.sessionId;
            if (remover) tokens.delete(token);
          }
          for (const [token, sessao] of refreshTokens) {
            const remover = scope === 'global'
              ? sessao.userId === usuarioAtual
              : scope === 'others'
                ? sessao.userId === usuarioAtual && sessao.sessionId !== sessaoAtual.sessionId
                : sessao.sessionId === sessaoAtual.sessionId;
            if (remover) refreshTokens.delete(token);
          }
        }
        sessaoAtual = null;
        return { error: null };
      }
    };
  }

  class Consulta {
    constructor(tabela, usuarioId) {
      this.tabela = tabela;
      this.usuarioId = usuarioId;
      this.filtros = [];
      this.ordenacoes = [];
      this.limite = Infinity;
      this.intervalo = null;
      this.colunas = null;
      this.operacao = 'select';
      this.payload = null;
      this.retorna = false;
      this.formato = 'many';
    }

    select(colunasTexto = '*', opcoes = {}) {
      this.colunas = colunas(colunasTexto);
      this.retorna = true;
      this.contar = opcoes.count === 'exact';
      this.somenteContagem = opcoes.head === true;
      return this;
    }

    eq(coluna, valor) { this.filtros.push((linha) => linha[coluna] === valor); return this; }
    neq(coluna, valor) { this.filtros.push((linha) => linha[coluna] !== valor); return this; }
    not(coluna, operador, valor) {
      this.filtros.push((linha) => operador === 'is' && valor === null ? linha[coluna] !== null : true);
      return this;
    }
    in(coluna, valores) { this.filtros.push((linha) => valores.includes(linha[coluna])); return this; }
    ilike(coluna, valor) {
      const padrao = valor.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.');
      const regex = new RegExp(`^${padrao}$`, 'i');
      this.filtros.push((linha) => regex.test(linha[coluna] || ''));
      return this;
    }
    or(expressao) {
      const alternativas = expressao.split(',').map((parte) => {
        const [coluna, operador, valor] = parte.split('.');
        return (linha) => operador === 'eq' && linha[coluna] === valor;
      });
      this.filtros.push((linha) => alternativas.some((alternativa) => alternativa(linha)));
      return this;
    }
    order(coluna, { ascending = true } = {}) {
      this.ordenacoes.push({ coluna, ascending });
      return this;
    }
    limit(valor) { this.limite = valor; return this; }
    range(inicio, fim) { this.intervalo = [inicio, fim]; return this; }
    maybeSingle() { this.formato = 'maybe'; return this; }
    single() { this.formato = 'single'; return this; }
    insert(payload) { this.operacao = 'insert'; this.payload = payload; return this; }
    update(payload) { this.operacao = 'update'; this.payload = payload; return this; }
    delete() { this.operacao = 'delete'; return this; }

    then(resolve, reject) {
      return Promise.resolve().then(() => this.executar()).then(resolve, reject);
    }

    executar() {
      if (tabelasNegadas.has(this.tabela)) {
        return {
          data: null,
          error: respostaErro('42501', 'row-level security policy violation', 403)
        };
      }
      if (errosTabelas.has(this.tabela)) {
        return { data: null, error: errosTabelas.get(this.tabela) };
      }
      if (this.tabela === 'partidas' && this.colunas?.some((coluna) => !COLUNAS_PARTIDAS.has(coluna))) {
        const invalida = this.colunas.find((coluna) => !COLUNAS_PARTIDAS.has(coluna));
        return {
          data: null,
          error: respostaErro('42703', `column ${invalida} does not exist`)
        };
      }

      const rows = this.obterLinhas();
      if (this.operacao === 'insert') return this.inserir();
      if (this.operacao === 'update') return this.atualizar(rows);
      if (this.operacao === 'delete') return this.remover(rows);

      const total = rows.length;
      if (this.somenteContagem) {
        return { data: null, count: this.contar ? total : null, error: null };
      }
      const inicio = this.intervalo ? this.intervalo[0] : 0;
      const resultado = rows.slice().sort((a, b) => {
        for (const { coluna, ascending } of this.ordenacoes) {
          const comparacao = typeof a[coluna] === 'number' && typeof b[coluna] === 'number'
            ? a[coluna] - b[coluna]
            : String(a[coluna] ?? '').localeCompare(String(b[coluna] ?? ''));
          if (comparacao) return ascending ? comparacao : -comparacao;
        }
        return 0;
      }).slice(
        inicio,
        Math.min(
          this.intervalo ? this.intervalo[1] + 1 : Infinity,
          this.limite,
          inicio + limiteMaximoLinhas
        )
      ).map((linha) => this.projetar(linha));
      return this.formatar(resultado, this.contar ? total : null);
    }

    obterLinhas() {
      let rows = ['vw_perfis_publicos', 'vw_ranking_publico'].includes(this.tabela)
        ? tabelas.usuarios
        : tabelas[this.tabela] || [];

      if (this.tabela === 'usuarios') rows = rows.filter((linha) => linha.id === this.usuarioId);
      if (this.tabela === 'desafios') rows = rows.filter((linha) =>
        linha.desafiante_id === this.usuarioId || linha.desafiado_id === this.usuarioId
      );
      return rows.filter((linha) => this.filtros.every((filtro) => filtro(linha)));
    }

    projetar(linha) {
      if (!this.colunas) return { ...linha };
      return Object.fromEntries(this.colunas.filter((coluna) => Object.hasOwn(linha, coluna))
        .map((coluna) => [coluna, linha[coluna]]));
    }

    formatar(rows, count = null) {
      if (this.formato === 'single') {
        return rows.length === 1
          ? { data: rows[0], count, error: null }
          : { data: null, count, error: respostaErro('PGRST116', 'Expected one row', 406) };
      }
      if (this.formato === 'maybe') return { data: rows[0] || null, count, error: null };
      return { data: rows, count, error: null };
    }

    inserir() {
      const rows = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((entrada) => ({
        id: randomUUID(),
        ...(this.tabela === 'inscricoes' ? { status: 'pendente' } : {}),
        ...entrada,
        ...(this.tabela === 'inscricoes' ? { inscrito_em: new Date().toISOString() } : {}),
        ...(this.tabela === 'desafios' ? { data_criacao: new Date().toISOString(), status: 'pendente' } : {})
      }));
      if (this.tabela === 'inscricoes' && rows.some((nova) => tabelas.inscricoes.some((atual) =>
        atual.campeonato_id === nova.campeonato_id && atual.jogador_id === nova.jogador_id
      ))) {
        return { data: null, error: respostaErro('23505', 'duplicate key value violates unique constraint', 409) };
      }
      if (this.tabela === 'inscricoes' && rows.some((nova) => {
        const campeonato = tabelas.campeonatos.find((item) => item.id === nova.campeonato_id);
        const ativas = tabelas.inscricoes.filter((item) =>
          item.campeonato_id === nova.campeonato_id &&
          ['pendente', 'aprovada'].includes(item.status)
        ).length;
        return campeonato && campeonato.status !== 'aberto' ||
          campeonato && ativas >= Number(campeonato.max_participantes);
      })) {
        const fechado = rows.some((nova) => {
          const campeonato = tabelas.campeonatos.find((item) => item.id === nova.campeonato_id);
          return campeonato && campeonato.status !== 'aberto';
        });
        return {
          data: null,
          error: respostaErro('P0001', fechado ? 'registration_closed' : 'championship_full', 409)
        };
      }
      if (this.tabela === 'desafios' && rows.some((nova) => tabelas.desafios.some((atual) =>
        atual.status === 'pendente' && nova.status === 'pendente' &&
        atual.desafiante_id === nova.desafiante_id && atual.desafiado_id === nova.desafiado_id
      ))) {
        return { data: null, error: respostaErro('23505', 'duplicate key value violates unique constraint', 409) };
      }
      if (this.tabela === 'campeonatos' && rows.some((linha) => linha.criador_id !== this.usuarioId)) {
        return { data: null, error: respostaErro('42501', 'row-level security policy violation', 403) };
      }
      if (this.tabela === 'inscricoes' && rows.some((linha) => linha.jogador_id !== this.usuarioId)) {
        return { data: null, error: respostaErro('42501', 'row-level security policy violation', 403) };
      }
      if (this.tabela === 'desafios' && rows.some((linha) => linha.desafiante_id !== this.usuarioId)) {
        return { data: null, error: respostaErro('42501', 'row-level security policy violation', 403) };
      }
      (tabelas[this.tabela] || []).push(...rows);
      const projetadas = this.retorna ? rows.map((linha) => this.projetar(linha)) : null;
      return this.formatar(projetadas || []);
    }

    atualizar(rows) {
      const alteradas = rows.filter((linha) => {
        if (this.tabela === 'inscricoes') {
          return linha.jogador_id === this.usuarioId && (
            (['pendente', 'aprovada'].includes(linha.status) && this.payload.status === 'cancelada') ||
            (linha.status === 'cancelada' && this.payload.status === 'pendente')
          );
        }
        return this.tabela !== 'desafios' || linha.desafiado_id === this.usuarioId;
      });
      for (const linha of alteradas) Object.assign(linha, this.payload);
      return this.formatar(this.retorna ? alteradas.map((linha) => this.projetar(linha)) : []);
    }

    remover(rows) {
      const removidas = rows.filter((linha) => this.tabela !== 'inscricoes' || linha.jogador_id === this.usuarioId);
      const tabela = tabelas[this.tabela] || [];
      for (const linha of removidas) tabela.splice(tabela.indexOf(linha), 1);
      return this.formatar(this.retorna ? removidas.map((linha) => this.projetar(linha)) : []);
    }
  }

  function executarRpc(nome, parametros, usuarioId) {
    const falha = (code, message, status = 400) => ({
      data: null,
      error: respostaErro(code, message, status)
    });
    const timePorId = (id) => tabelas.times.find((time) => time.id === id);
    const ativosDoTime = (id) => tabelas.membros_time.filter((membro) =>
      membro.time_id === id && membro.status === 'ativo'
    );
    const resultadoAtual = (partidaId) => {
      const pendente = tabelas.partida_resultados.find((item) => item.partida_id === partidaId);
      if (pendente) return { ...pendente };
      const partida = tabelas.partidas.find((item) => item.id === partidaId);
      return partida?.status === 'concluida' && partida.resultado
        ? {
          partida_id: partida.id,
          vencedor_id: partida.vencedor_id,
          resultado: partida.resultado,
          status: 'confirmada',
          confirmado_em: partida.concluida_em
        }
        : null;
    };
    if (!usuarioId) return Promise.resolve(falha('42501', 'authentication_required', 403));

    let data;
    switch (nome) {
      case 'submeter_resultado_partida':
      case 'contestar_resultado_partida': {
        const contestacao = nome === 'contestar_resultado_partida';
        const partidaId = parametros.p_partida_id;
        const chave = parametros.p_chave_idempotencia;
        const dados = {
          operacao: contestacao ? 'contestar' : 'submeter',
          vencedor_id: parametros.p_vencedor_id,
          resultado: parametros.p_resultado
        };
        const eventoExistente = eventosResultado.get(chave);
        if (eventoExistente) {
          if (eventoExistente.atorId !== usuarioId ||
              eventoExistente.partidaId !== partidaId ||
              (contestacao
                ? eventoExistente.acao !== 'contestado'
                : !['relatado', 'confirmado', 'contestado'].includes(eventoExistente.acao)) ||
              !isDeepStrictEqual(eventoExistente.dados, dados)) {
            return Promise.resolve(falha('23505', 'idempotency_key_reused', 409));
          }
          return Promise.resolve({
            data: resultadoAtual(partidaId),
            error: null
          });
        }
        const partida = tabelas.partidas.find((item) => item.id === partidaId);
        if (!partida) return Promise.resolve(falha('P0002', 'match_not_found', 404));
        if (![partida.jogador_1_id, partida.jogador_2_id].includes(usuarioId)) {
          return Promise.resolve(falha('42501', 'match_participant_required', 403));
        }
        if (![partida.jogador_1_id, partida.jogador_2_id].includes(dados.vencedor_id)) {
          return Promise.resolve(falha('22023', 'winner_must_be_participant'));
        }
        const [pontosJogador1, pontosJogador2] = dados.resultado.split('-').map(Number);
        const vencedorPeloPlacar = pontosJogador1 > pontosJogador2
          ? partida.jogador_1_id : partida.jogador_2_id;
        if (pontosJogador1 === pontosJogador2 || dados.vencedor_id !== vencedorPeloPlacar) {
          return Promise.resolve(falha('22023', 'score_winner_mismatch'));
        }
        if (['concluida', 'cancelada'].includes(partida.status) || partida.concluida_em) {
          return Promise.resolve(falha('P0001', 'match_finalized', 409));
        }
        let resultado = tabelas.partida_resultados.find((item) => item.partida_id === partidaId);
        let acao;
        if (contestacao) {
          if (!resultado || resultado.status !== 'aguardando_confirmacao' ||
              resultado.reportado_por === usuarioId) {
            return Promise.resolve(falha('P0001', 'result_not_open_for_contest', 409));
          }
          if (resultado.vencedor_id === dados.vencedor_id &&
              resultado.resultado === dados.resultado) {
            return Promise.resolve(falha('P0001', 'result_not_divergent', 409));
          }
          Object.assign(resultado, {
            status: 'disputada',
            contestado_por: usuarioId,
            vencedor_contestado_id: dados.vencedor_id,
            resultado_contestado: dados.resultado
          });
          partida.status = 'disputada';
          acao = 'contestado';
        } else if (!resultado) {
          resultado = {
            partida_id: partidaId,
            reportado_por: usuarioId,
            vencedor_id: dados.vencedor_id,
            resultado: dados.resultado,
            status: 'aguardando_confirmacao'
          };
          tabelas.partida_resultados.push(resultado);
          partida.status = 'aguardando_confirmacao';
          acao = 'relatado';
        } else if (resultado.status !== 'aguardando_confirmacao' ||
                   resultado.reportado_por === usuarioId) {
          return Promise.resolve(falha('P0001', 'result_not_open_for_submission', 409));
        } else if (resultado.vencedor_id === dados.vencedor_id &&
                   isDeepStrictEqual(resultado.resultado, dados.resultado)) {
          partida.status = 'concluida';
          partida.vencedor_id = dados.vencedor_id;
          partida.resultado = dados.resultado;
          partida.concluida_em = new Date().toISOString();
          const perdedorId = partida.jogador_1_id === dados.vencedor_id
            ? partida.jogador_2_id : partida.jogador_1_id;
          const perfilVencedor = tabelas.usuarios.find((item) => item.id === dados.vencedor_id);
          const perfilPerdedor = tabelas.usuarios.find((item) => item.id === perdedorId);
          if (perfilVencedor) perfilVencedor.vitorias += 1;
          if (perfilPerdedor) perfilPerdedor.derrotas += 1;
          tabelas.partida_resultados.splice(tabelas.partida_resultados.indexOf(resultado), 1);
          acao = 'confirmado';
        } else {
          Object.assign(resultado, {
            status: 'disputada',
            contestado_por: usuarioId,
            vencedor_contestado_id: dados.vencedor_id,
            resultado_contestado: dados.resultado
          });
          partida.status = 'disputada';
          acao = 'contestado';
        }
        eventosResultado.set(chave, { atorId: usuarioId, partidaId, acao, dados });
        return Promise.resolve({ data: resultadoAtual(partidaId), error: null });
      }
      case 'confirmar_resultado_partida': {
        const partidaId = parametros.p_partida_id;
        const chave = parametros.p_chave_idempotencia;
        const eventoExistente = eventosResultado.get(chave);
        if (eventoExistente) {
          if (eventoExistente.atorId !== usuarioId ||
              eventoExistente.partidaId !== partidaId ||
              eventoExistente.acao !== 'confirmado') {
            return Promise.resolve(falha('23505', 'idempotency_key_reused', 409));
          }
          return Promise.resolve({
            data: resultadoAtual(partidaId),
            error: null
          });
        }
        const partida = tabelas.partidas.find((item) => item.id === partidaId);
        const resultado = tabelas.partida_resultados.find((item) => item.partida_id === partidaId);
        if (!partida) return Promise.resolve(falha('P0002', 'match_not_found', 404));
        if (!resultado || resultado.status !== 'aguardando_confirmacao') {
          return Promise.resolve(falha('P0001', 'result_not_waiting_for_confirmation', 409));
        }
        if (resultado.reportado_por === usuarioId ||
            ![partida.jogador_1_id, partida.jogador_2_id].includes(usuarioId)) {
          return Promise.resolve(falha('42501', 'opponent_confirmation_required', 403));
        }
        partida.status = 'concluida';
        partida.vencedor_id = resultado.vencedor_id;
        partida.resultado = resultado.resultado;
        partida.concluida_em = new Date().toISOString();
        const perdedorId = partida.jogador_1_id === resultado.vencedor_id
          ? partida.jogador_2_id : partida.jogador_1_id;
        const perfilVencedor = tabelas.usuarios.find((item) => item.id === resultado.vencedor_id);
        const perfilPerdedor = tabelas.usuarios.find((item) => item.id === perdedorId);
        if (perfilVencedor) perfilVencedor.vitorias += 1;
        if (perfilPerdedor) perfilPerdedor.derrotas += 1;
        tabelas.partida_resultados.splice(tabelas.partida_resultados.indexOf(resultado), 1);
        eventosResultado.set(chave, {
          atorId: usuarioId, partidaId, acao: 'confirmado', dados: {}
        });
        return Promise.resolve({ data: resultadoAtual(partidaId), error: null });
      }
      case 'resolver_resultado_partida': {
        const partidaId = parametros.p_partida_id;
        const chave = parametros.p_chave_idempotencia;
        const admin = tabelas.usuarios.find((item) => item.id === usuarioId);
        if (admin?.perfil !== 'admin') {
          return Promise.resolve(falha('42501', 'administrator_required', 403));
        }
        const dados = {
          operacao: 'resolver_admin',
          vencedor_id: parametros.p_vencedor_id,
          resultado: parametros.p_resultado,
          justificativa: parametros.p_justificativa
        };
        const eventoExistente = eventosResultado.get(chave);
        if (eventoExistente) {
          if (eventoExistente.atorId !== usuarioId ||
              eventoExistente.partidaId !== partidaId ||
              eventoExistente.acao !== 'resolvido_admin' ||
              !isDeepStrictEqual(eventoExistente.dados, dados)) {
            return Promise.resolve(falha('23505', 'idempotency_key_reused', 409));
          }
          return Promise.resolve({ data: resultadoAtual(partidaId), error: null });
        }
        const partida = tabelas.partidas.find((item) => item.id === partidaId);
        const resultado = tabelas.partida_resultados.find((item) => item.partida_id === partidaId);
        if (!partida || !resultado) {
          return Promise.resolve(falha('P0002', 'match_not_found', 404));
        }
        if (partida.status !== 'disputada' || resultado.status !== 'disputada') {
          return Promise.resolve(falha('P0001', 'result_not_disputed', 409));
        }
        if (!parametros.p_justificativa?.trim() || parametros.p_justificativa.trim().length > 1000) {
          return Promise.resolve(falha('22023', 'invalid_admin_resolution_payload'));
        }
        if (![partida.jogador_1_id, partida.jogador_2_id].includes(parametros.p_vencedor_id)) {
          return Promise.resolve(falha('22023', 'winner_must_be_participant'));
        }
        const [p1, p2] = parametros.p_resultado.split('-').map(Number);
        const vencedorPlacar = p1 > p2 ? partida.jogador_1_id : partida.jogador_2_id;
        if (p1 === p2 || vencedorPlacar !== parametros.p_vencedor_id) {
          return Promise.resolve(falha('22023', 'score_winner_mismatch'));
        }
        partida.status = 'concluida';
        partida.vencedor_id = parametros.p_vencedor_id;
        partida.resultado = parametros.p_resultado;
        partida.concluida_em = new Date().toISOString();
        const perdedorId = partida.jogador_1_id === parametros.p_vencedor_id
          ? partida.jogador_2_id : partida.jogador_1_id;
        const vencedor = tabelas.usuarios.find((item) => item.id === parametros.p_vencedor_id);
        const perdedor = tabelas.usuarios.find((item) => item.id === perdedorId);
        if (vencedor) vencedor.vitorias += 1;
        if (perdedor) perdedor.derrotas += 1;
        tabelas.partida_resultados.splice(tabelas.partida_resultados.indexOf(resultado), 1);
        eventosResultado.set(chave, {
          atorId: usuarioId,
          partidaId,
          acao: 'resolvido_admin',
          dados
        });
        const resposta = resultadoAtual(partidaId);
        return Promise.resolve({
          data: {
            ...resposta,
            resolvido_por: usuarioId,
            justificativa: parametros.p_justificativa.trim()
          },
          error: null
        });
      }
      case 'agendar_partida': {
        const partida = tabelas.partidas.find((item) => item.id === parametros.p_partida_id);
        const campeonato = partida && tabelas.campeonatos.find((item) => item.id === partida.campeonato_id);
        if (!partida || campeonato?.criador_id !== usuarioId) {
          return Promise.resolve(falha('42501', 'championship_organizer_required', 403));
        }
        if (!['agendada', 'em_andamento'].includes(partida.status)) {
          return Promise.resolve(falha('P0001', 'match_not_schedulable', 409));
        }
        partida.agendada_para = parametros.p_agendada_para;
        data = partida;
        break;
      }
      case 'criar_time': {
        const nomeTime = String(parametros.p_nome || '').trim();
        const capacidade = parametros.p_max_integrantes;
        if (nomeTime.length < 2 || nomeTime.length > 80 ||
            !Number.isInteger(capacidade) || capacidade < 2 || capacidade > 5) {
          return Promise.resolve(falha('22023', 'invalid_team_data'));
        }
        if (tabelas.times.some((time) => time.nome.toLowerCase() === nomeTime.toLowerCase())) {
          return Promise.resolve(falha('23505', 'duplicate team name'));
        }
        data = {
          id: randomUUID(),
          nome: nomeTime,
          descricao: parametros.p_descricao || '',
          lider_id: usuarioId,
          max_integrantes: capacidade,
          criado_em: new Date().toISOString(),
          atualizado_em: new Date().toISOString()
        };
        tabelas.times.push(data);
        tabelas.membros_time.push({
          id: randomUUID(),
          time_id: data.id,
          jogador_id: usuarioId,
          status: 'ativo',
          entrou_em: new Date().toISOString(),
          encerrou_em: null
        });
        break;
      }
      case 'atualizar_time': {
        data = timePorId(parametros.p_time_id);
        if (!data) return Promise.resolve(falha('P0002', 'team_not_found'));
        if (data.lider_id !== usuarioId) return Promise.resolve(falha('42501', 'team_leader_required', 403));
        if (parametros.p_max_integrantes < ativosDoTime(data.id).length) {
          return Promise.resolve(falha('P0001', 'capacity_below_members'));
        }
        Object.assign(data, {
          nome: parametros.p_nome.trim(),
          descricao: parametros.p_descricao.trim(),
          max_integrantes: parametros.p_max_integrantes,
          atualizado_em: new Date().toISOString()
        });
        break;
      }
      case 'solicitar_entrada_time': {
        const time = timePorId(parametros.p_time_id);
        if (!time) return Promise.resolve(falha('P0002', 'team_not_found'));
        if (ativosDoTime(time.id).some((membro) => membro.jogador_id === usuarioId)) {
          return Promise.resolve(falha('P0001', 'already_team_member'));
        }
        if (ativosDoTime(time.id).length >= time.max_integrantes) {
          return Promise.resolve(falha('P0001', 'team_full'));
        }
        if (tabelas.solicitacoes_time.some((item) =>
          item.time_id === time.id && item.jogador_id === usuarioId && item.status === 'pendente'
        )) return Promise.resolve(falha('23505', 'duplicate pending request'));
        data = {
          id: randomUUID(),
          time_id: time.id,
          jogador_id: usuarioId,
          status: 'pendente',
          criada_em: new Date().toISOString(),
          decidida_em: null,
          decidida_por: null
        };
        tabelas.solicitacoes_time.push(data);
        break;
      }
      case 'responder_solicitacao_time': {
        data = tabelas.solicitacoes_time.find((item) => item.id === parametros.p_solicitacao_id);
        if (!data) return Promise.resolve(falha('P0002', 'request_not_found'));
        const time = timePorId(data.time_id);
        if (time?.lider_id !== usuarioId) return Promise.resolve(falha('42501', 'team_leader_required', 403));
        if (data.status !== 'pendente') return Promise.resolve(falha('P0001', 'request_already_decided'));
        if (parametros.p_aceitar) {
          if (ativosDoTime(time.id).length >= time.max_integrantes) {
            return Promise.resolve(falha('P0001', 'team_full'));
          }
          tabelas.membros_time.push({
            id: randomUUID(),
            time_id: time.id,
            jogador_id: data.jogador_id,
            status: 'ativo',
            entrou_em: new Date().toISOString(),
            encerrou_em: null
          });
        }
        Object.assign(data, {
          status: parametros.p_aceitar ? 'aprovada' : 'recusada',
          decidida_em: new Date().toISOString(),
          decidida_por: usuarioId
        });
        break;
      }
      case 'sair_time': {
        const time = timePorId(parametros.p_time_id);
        if (!time) return Promise.resolve(falha('P0002', 'team_not_found'));
        if (time.lider_id === usuarioId) return Promise.resolve(falha('P0001', 'leader_must_transfer_first'));
        data = ativosDoTime(time.id).find((membro) => membro.jogador_id === usuarioId);
        if (!data) return Promise.resolve(falha('P0002', 'active_membership_not_found'));
        Object.assign(data, { status: 'saiu', encerrou_em: new Date().toISOString() });
        break;
      }
      case 'remover_membro_time': {
        const time = timePorId(parametros.p_time_id);
        if (!time) return Promise.resolve(falha('P0002', 'team_not_found'));
        if (time.lider_id !== usuarioId) return Promise.resolve(falha('42501', 'team_leader_required', 403));
        if (parametros.p_jogador_id === time.lider_id) {
          return Promise.resolve(falha('P0001', 'leader_must_transfer_first'));
        }
        data = ativosDoTime(time.id).find((membro) => membro.jogador_id === parametros.p_jogador_id);
        if (!data) return Promise.resolve(falha('P0002', 'active_membership_not_found'));
        Object.assign(data, { status: 'removido', encerrou_em: new Date().toISOString() });
        break;
      }
      case 'transferir_lider_time': {
        data = timePorId(parametros.p_time_id);
        if (!data) return Promise.resolve(falha('P0002', 'team_not_found'));
        if (data.lider_id !== usuarioId) return Promise.resolve(falha('42501', 'team_leader_required', 403));
        if (!ativosDoTime(data.id).some((membro) => membro.jogador_id === parametros.p_novo_lider_id)) {
          return Promise.resolve(falha('P0001', 'new_leader_must_be_active_member'));
        }
        data.lider_id = parametros.p_novo_lider_id;
        data.atualizado_em = new Date().toISOString();
        break;
      }
      default:
        return Promise.resolve(falha('42883', 'function not found'));
    }

    return Promise.resolve({ data: { ...data }, error: null });
  }

  function criarCliente(accessToken) {
    const usuarioId = tokens.get(accessToken)?.userId || null;
    return {
      auth: criarAuth(),
      from: (tabela) => new Consulta(tabela, usuarioId),
      rpc: (nome, parametros) => executarRpc(nome, parametros, usuarioId)
    };
  }

  function seed(tabela, linha) {
    tabelas[tabela].push({ id: randomUUID(), ...linha });
  }

  return {
    criarCliente,
    tabelas,
    usuarios,
    tokens,
    tokensExpirados,
    tabelasNegadas,
    falharTabela(tabela, erro) { errosTabelas.set(tabela, erro); },
    falharAuth(operacao, erro) {
      if (erro) errosAuth.set(operacao, erro);
      else errosAuth.delete(operacao);
    },
    seed,
    get quantidadeRenovacoes() { return quantidadeRenovacoes; },
    get escoposSignOut() { return [...escoposSignOut]; },
    setPassword(id, password) {
      const usuario = usuarios.get(id);
      usuario.password = password;
    },
    confirmarEmail(email) {
      const usuario = [...usuarios.values()].find((item) => item.email === email.toLowerCase());
      if (!usuario) throw new Error('Usuário de teste não encontrado para confirmação.');
      usuario.emailConfirmado = true;
    },
    get usuarioIds() { return [...usuarios.keys()]; }
  };
}

module.exports = { criarSupabaseFake };
