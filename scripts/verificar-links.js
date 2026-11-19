'use strict';

/**
 * Confere o frontend sem abrir o navegador:
 *  1. todo href/src local das páginas HTML aponta para um arquivo que existe;
 *  2. todo id usado pelos scripts de uma página (#id, getElementById) existe no HTML dessa página.
 */
const fs = require('node:fs');
const path = require('node:path');

const publico = path.join(__dirname, '..', 'public');
// Rotas servidas pelo backend (não são arquivos físicos).
const ROTAS_VIRTUAIS = new Set(['css/fonte-titulos.css', '../css/fonte-titulos.css', '/css/fonte-titulos.css', '/']);

function paginas(pasta) {
  return fs.readdirSync(pasta, { withFileTypes: true }).flatMap((entrada) => {
    const caminho = path.join(pasta, entrada.name);
    if (entrada.isDirectory()) return ['css', 'js', 'img', 'fonts'].includes(entrada.name) ? [] : paginas(caminho);
    return entrada.name.endsWith('.html') ? [caminho] : [];
  });
}

const problemas = [];
const registrar = (texto) => problemas.push(texto);

for (const pagina of paginas(publico)) {
  const nome = path.relative(publico, pagina);
  const html = fs.readFileSync(pagina, 'utf8');

  // 1. Links e arquivos
  for (const [, atributo, destino] of html.matchAll(/\b(href|src)="([^"]+)"/g)) {
    if (/^(https?:|mailto:|data:|#)/.test(destino)) continue;
    const limpo = destino.split('#')[0].split('?')[0];
    if (!limpo || ROTAS_VIRTUAIS.has(limpo)) continue;
    const alvo = limpo.startsWith('/')
      ? path.join(publico, limpo)
      : path.resolve(path.dirname(pagina), limpo);
    if (!fs.existsSync(alvo)) registrar(`${nome}: ${atributo}="${destino}" não existe`);
  }

  // 2. IDs usados pelos scripts da página
  const idsDaPagina = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
  for (const src of scripts) {
    const arquivo = path.resolve(path.dirname(pagina), src);
    if (!fs.existsSync(arquivo) || path.basename(arquivo) === 'comum.js') continue;
    const codigo = fs.readFileSync(arquivo, 'utf8');
    const seletores = [...codigo.matchAll(/(?:const|let)\s+(\w+)\s*=\s*\$\('#([\w-]+)'\)/g)];
    const opcionais = new Set(
      seletores
        .filter(([, variavel]) => new RegExp(`if\\s*\\(\\s*!?\\s*${variavel}\\s*\\)`).test(codigo))
        .map(([, , id]) => id)
    );
    const usados = [
      ...[...codigo.matchAll(/\$\('#([\w-]+)'\)/g)].map((m) => m[1]),
      ...[...codigo.matchAll(/getElementById\('([\w-]+)'\)/g)].map((m) => m[1])
    ];
    for (const id of new Set(usados)) {
      if (!idsDaPagina.has(id) && !opcionais.has(id)) {
        registrar(`${nome}: ${path.basename(arquivo)} usa #${id}, que não existe nesta página`);
      }
    }
  }

  // 3. Todas as páginas internas precisam carregar o script comum
  if (nome !== '404.html' && !scripts.some((s) => s.endsWith('js/comum.js'))) {
    registrar(`${nome}: não carrega js/comum.js`);
  }
}

if (problemas.length) {
  console.error(`Foram encontrados ${problemas.length} problema(s):\n- ${problemas.join('\n- ')}`);
  process.exit(1);
}
console.log(`${paginas(publico).length} páginas HTML verificadas: links, arquivos e ids consistentes.`);
