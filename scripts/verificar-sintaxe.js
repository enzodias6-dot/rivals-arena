'use strict';

// Verifica a sintaxe de todos os arquivos .js do projeto (sem executá-los).
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const raiz = path.join(__dirname, '..');
const IGNORAR = new Set(['node_modules', '.git']);

function listar(pasta) {
  return fs.readdirSync(pasta, { withFileTypes: true }).flatMap((entrada) => {
    if (IGNORAR.has(entrada.name)) return [];
    const caminho = path.join(pasta, entrada.name);
    if (entrada.isDirectory()) return listar(caminho);
    return entrada.name.endsWith('.js') ? [caminho] : [];
  });
}

const arquivos = listar(raiz);
let falhas = 0;
for (const arquivo of arquivos) {
  const resultado = spawnSync(process.execPath, ['--check', arquivo], { encoding: 'utf8' });
  if (resultado.status !== 0) {
    falhas += 1;
    console.error(`ERRO de sintaxe em ${path.relative(raiz, arquivo)}\n${resultado.stderr}`);
  }
}

console.log(`${arquivos.length - falhas}/${arquivos.length} arquivos .js com sintaxe válida.`);
process.exit(falhas ? 1 : 0);
