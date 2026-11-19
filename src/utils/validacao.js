'use strict';

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CARACTERES_DE_CONTROLE = /[\u0000-\u001f\u007f]/;

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

function lerIdPositivo(valor) {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? numero : null;
}

module.exports = { validarNome, validarCadastro, validarLogin, lerIdPositivo };
