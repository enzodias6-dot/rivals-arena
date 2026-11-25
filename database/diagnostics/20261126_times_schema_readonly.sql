-- DIAGNOSTICO SOMENTE DE LEITURA — TIMES (Supabase/PostgreSQL)
-- Execute no SQL Editor do Supabase apenas para coletar metadados.
-- Não cria/edita tabelas, índices, funções, triggers, policies ou dados.
-- O bloco inicia uma transação READ ONLY e termina com ROLLBACK.

begin transaction read only;

-- 1) Colunas, tipos, nulabilidade e valores padrão das tabelas existentes.
select
  table_name,
  ordinal_position,
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default,
  character_maximum_length
from information_schema.columns
where table_schema = 'public'
  and table_name in ('times', 'membros_time', 'usuarios')
order by table_name, ordinal_position;

-- 2) Constraints (PK, UNIQUE, CHECK e FK), incluindo regras de exclusão.
select
  tbl.relname as tabela,
  con.conname as constraint,
  con.contype as tipo,
  pg_get_constraintdef(con.oid, true) as definicao
from pg_constraint con
join pg_class tbl on tbl.oid = con.conrelid
join pg_namespace ns on ns.oid = tbl.relnamespace
where ns.nspname = 'public'
  and tbl.relname in ('times', 'membros_time', 'usuarios')
order by tbl.relname, con.contype, con.conname;

-- 3) Índices atuais.
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('times', 'membros_time', 'usuarios')
order by tablename, indexname;

-- 4) Policies RLS completas das tabelas envolvidas.
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('times', 'membros_time', 'usuarios')
order by tablename, policyname;

-- 5) Grants por papel. RLS e GRANT precisam ser avaliados em conjunto.
select
  table_name,
  grantee,
  privilege_type,
  is_grantable
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('times', 'membros_time', 'usuarios')
order by table_name, grantee, privilege_type;

-- 6) Triggers nas tabelas de Times e definição da função chamada.
select
  tbl.relname as tabela,
  trg.tgname as trigger,
  pg_get_triggerdef(trg.oid, true) as definicao_trigger,
  pg_get_functiondef(pr.oid) as definicao_funcao
from pg_trigger trg
join pg_class tbl on tbl.oid = trg.tgrelid
join pg_namespace ns on ns.oid = tbl.relnamespace
join pg_proc pr on pr.oid = trg.tgfoid
where not trg.tgisinternal
  and ns.nspname = 'public'
  and tbl.relname in ('times', 'membros_time', 'usuarios')
order by tbl.relname, trg.tgname;

-- 7) Funções públicas cujo nome ou definição menciona Times.
select
  pr.proname as funcao,
  pg_get_function_identity_arguments(pr.oid) as argumentos,
  pg_get_function_result(pr.oid) as retorno,
  pg_get_functiondef(pr.oid) as definicao
from pg_proc pr
join pg_namespace ns on ns.oid = pr.pronamespace
where ns.nspname = 'public'
  and (
    pr.proname ilike '%time%'
    or pg_get_functiondef(pr.oid) ilike '%membros_time%'
    or pg_get_functiondef(pr.oid) ilike '%public.times%'
  )
order by pr.proname, argumentos;

-- 8) Valores de status/função já utilizados (somente vocabulário, sem dados pessoais).
select 'times.status' as campo, status::text as valor, count(*) as quantidade
from public.times
group by status
union all
select 'membros_time.status', status::text, count(*)
from public.membros_time
group by status
union all
select 'membros_time.funcao', funcao::text, count(*)
from public.membros_time
group by funcao
order by campo, valor;

-- 9) Definição da view usada para exibir nomes dos integrantes.
select
  case when to_regclass('public.vw_perfis_publicos') is null
    then 'VIEW NÃO ENCONTRADA'
    else pg_get_viewdef(to_regclass('public.vw_perfis_publicos'), true)
  end as definicao_vw_perfis_publicos;

rollback;
