'use strict';

const TAMANHO_PAGINA = 500;

async function executar(consulta) {
  const { data, error, count } = await consulta;
  if (error) throw error;
  return { data, count };
}

async function buscarTodasAsPaginas(criarConsulta) {
  const linhas = [];
  let inicio = 0;

  while (true) {
    const { data, count } = await executar(
      criarConsulta().range(inicio, inicio + TAMANHO_PAGINA - 1)
    );
    if (!Number.isInteger(count)) {
      throw new Error('Supabase não retornou a contagem necessária para paginar os resultados.');
    }

    const pagina = data || [];
    linhas.push(...pagina);
    if (!pagina.length || linhas.length >= count) return linhas;
    inicio += pagina.length;
  }
}

function clienteDaRequisicao(req) {
  if (!req.supabase) throw new Error('Cliente Supabase autenticado indisponível.');
  return req.supabase;
}

module.exports = { executar, buscarTodasAsPaginas, clienteDaRequisicao };
