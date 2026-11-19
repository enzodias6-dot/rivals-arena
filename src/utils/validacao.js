'use strict';

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CARACTERES_DE_CONTROLE = /[\u0000-\u001f\u007f]/;
const MODALIDADES_CAMPEONATO = new Set(['1v1', 'dupla', 'equipes', 'solo']);
const FORMATOS_CAMPEONATO = new Set(['eliminacao_simples', 'grupos', 'pontos']);

const texto = (valor) => typeof valor === 'string';

function validarNome(valor, rotulo = 'O nome') {
  if (!texto(valor)) return { erro: `${rotulo} é obrigatório.` };
  const nome = valor.trim().replace(/\s+/g, ' ');
  if (nome.length < 2 || nome.length > 80) return { erro: `${rotulo} deve ter entre 2 e 80 caracteres.` };
  if (CARACTERES_DE_CONTROLE.test(nome)) return { erro: `${rotulo} contém caracteres inválidos.` };
  return { valor: nome };
}

function validarEmail(valor) {
  if (!texto(valor) || !valor.trim()) return { erro: 'Informe um email válido.' };
  const email = valor.trim().toLowerCase();
  if (email.length > 254 || !REGEX_EMAIL.test(email)) return { erro: 'Informe um email válido.' };
  return { valor: email };
}

function validarSenhaNova(valor) {
  if (!texto(valor) || !valor) return { erro: 'Informe uma senha.' };
  if (valor.length < 8) return { erro: 'A senha deve ter pelo menos 8 caracteres.' };
  // O bcrypt só considera os 72 primeiros bytes; acentos e emojis ocupam mais de 1 byte.
  if (Buffer.byteLength(valor, 'utf8') > 72) {
    return { erro: 'A senha é longa demais (máximo de 72 bytes; acentos e emojis contam mais de um).' };
  }
  return { valor };
}

function validarCadastro(corpo) {
  const dados = corpo || {};
  const nome = validarNome(dados.nome, 'O nome de combatente');
  if (nome.erro) return { erro: nome.erro };
  const email = validarEmail(dados.email);
  if (email.erro) return { erro: email.erro };
  const senha = validarSenhaNova(dados.senha);
  if (senha.erro) return { erro: senha.erro };
  return { nome: nome.valor, email: email.valor, senha: senha.valor };
}

function validarLogin(corpo) {
  const dados = corpo || {};
  if (!texto(dados.email) || !texto(dados.senha) || !dados.email.trim() || !dados.senha) {
    return { erro: 'Informe o email e a senha.' };
  }
  return { email: dados.email.trim().toLowerCase(), senha: dados.senha };
}

function lerUuid(valor) {
  return typeof valor === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor)
    ? valor
    : null;
}

function validarTimestampCampeonato(valor, rotulo) {
  if (valor === undefined || valor === null || valor === '') return { valor: null };
  if (!texto(valor)) return { erro: `${rotulo} inválida.` };

  const partes = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})$/i.exec(valor);
  if (!partes) return { erro: `${rotulo} inválida.` };

  const [, anoTexto, mesTexto, diaTexto, horaTexto, minutoTexto, segundoTexto = '00'] = partes;
  const ano = Number(anoTexto);
  const mes = Number(mesTexto);
  const dia = Number(diaTexto);
  const hora = Number(horaTexto);
  const minuto = Number(minutoTexto);
  const segundo = Number(segundoTexto);
  const bissexto = ano % 4 === 0 && (ano % 100 !== 0 || ano % 400 === 0);
  const diasNoMes = [31, bissexto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  if (ano < 1 || mes < 1 || mes > 12 || dia < 1 || dia > diasNoMes[mes - 1] ||
      hora > 23 || minuto > 59 || segundo > 59) {
    return { erro: `${rotulo} inválida.` };
  }

  const instante = Date.parse(valor);
  if (!Number.isFinite(instante)) return { erro: `${rotulo} inválida.` };
  return { valor: new Date(instante).toISOString() };
}

function validarTextoCampeonato(valor, rotulo) {
  if (valor === undefined || valor === null) return { valor: '' };
  if (!texto(valor)) return { erro: `${rotulo} inválida.` };
  return { valor: valor.trim() };
}

function validarCriacaoCampeonato(corpo) {
  const dados = corpo && typeof corpo === 'object' && !Array.isArray(corpo) ? corpo : {};
  if (!texto(dados.nome) || !dados.nome.trim()) {
    return { erro: 'O nome do campeonato é obrigatório.' };
  }

  const nome = dados.nome.trim();
  if ([...nome].length > 150) {
    return { erro: 'O nome do campeonato deve ter no máximo 150 caracteres.' };
  }
  if (CARACTERES_DE_CONTROLE.test(nome)) {
    return { erro: 'O nome do campeonato contém caracteres inválidos.' };
  }
  if (!MODALIDADES_CAMPEONATO.has(dados.modalidade)) {
    return { erro: 'Selecione uma modalidade válida.' };
  }
  if (!FORMATOS_CAMPEONATO.has(dados.formato)) {
    return { erro: 'Selecione um formato válido.' };
  }
  if (!Number.isInteger(dados.max_participantes) ||
      dados.max_participantes < 2 || dados.max_participantes > 64) {
    return { erro: 'O número máximo de participantes deve ser um inteiro entre 2 e 64.' };
  }

  const descricao = validarTextoCampeonato(dados.descricao, 'A descrição');
  if (descricao.erro) return descricao;
  const premio = validarTextoCampeonato(dados.premio, 'A premiação');
  if (premio.erro) return premio;
  const inicio = validarTimestampCampeonato(dados.inicio_em, 'A data de início');
  if (inicio.erro) return inicio;
  const encerramento = validarTimestampCampeonato(dados.encerramento_em, 'A data de encerramento');
  if (encerramento.erro) return encerramento;
  if (inicio.valor && encerramento.valor &&
      Date.parse(inicio.valor) > Date.parse(encerramento.valor)) {
    return { erro: 'A data de início não pode ser posterior à data de encerramento.' };
  }

  return {
    nome,
    descricao: descricao.valor,
    modalidade: dados.modalidade,
    formato: dados.formato,
    max_participantes: dados.max_participantes,
    premio: premio.valor,
    inicio_em: inicio.valor,
    encerramento_em: encerramento.valor
  };
}

module.exports = {
  validarNome,
  validarCadastro,
  validarLogin,
  lerUuid,
  validarTimestampCampeonato,
  validarCriacaoCampeonato
};
