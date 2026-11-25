-- PROPOSTA NÃO EXECUTADA.
-- Exclusão da conta autenticada sem chave service_role no navegador ou no backend.
-- A RPC só remove auth.users para auth.uid(); as FKs precisam propagar a exclusão.
-- Revise o inventário real de FKs/retencao antes de aplicar em produção.

begin;

do $preflight$
declare
  v_fk record;
begin
  if to_regclass('auth.users') is null or to_regclass('public.usuarios') is null then
    raise exception 'A exclusão requer auth.users e public.usuarios.';
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_constraint c
      join pg_catalog.pg_attribute a
        on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f'
       and c.confrelid = 'auth.users'::regclass
       and c.conrelid = 'public.usuarios'::regclass
       and cardinality(c.conkey) = 1
       and a.attname = 'id'
       and c.confdeltype = 'c'
  ) then
    raise exception 'Confirme que public.usuarios.id referencia auth.users.id com ON DELETE CASCADE.';
  end if;

  for v_fk in
    select c.conname, c.conrelid::regclass as tabela, c.confdeltype
      from pg_catalog.pg_constraint c
     where c.contype = 'f'
       and c.confrelid = 'public.usuarios'::regclass
       and c.conrelid <> 'public.usuarios'::regclass
  loop
    if v_fk.confdeltype <> 'c' then
      raise exception 'A FK %.% não usa ON DELETE CASCADE. Defina a política de retenção antes de excluir contas.',
        v_fk.tabela, v_fk.conname;
    end if;
  end loop;

  if exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'excluir_minha_conta'
  ) then
    raise exception 'A função public.excluir_minha_conta já existe; revise sua definição.';
  end if;
end
$preflight$;

create function public.excluir_minha_conta()
returns void
language plpgsql
security definer
set search_path = ''
as $func$
declare
  v_usuario_id uuid := auth.uid();
begin
  if v_usuario_id is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;

  delete from auth.users
   where id = v_usuario_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'account_not_found';
  end if;
end
$func$;

revoke all on function public.excluir_minha_conta() from public, anon;
grant execute on function public.excluir_minha_conta() to authenticated;

commit;
