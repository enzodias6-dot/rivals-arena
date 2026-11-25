-- PROPOSTA DE MIGRAÇÃO — NÃO EXECUTAR AUTOMATICAMENTE
-- Criação atômica de equipes usando o schema existente:
-- public.times (responsavel_id) e public.membros_time (usuario_id).
-- Revisar no Supabase antes de executar manualmente.
--
-- A função deriva o responsável de auth.uid(), cria o time e registra
-- o próprio criador como membro na mesma transação PostgreSQL.
-- Nesta primeira versão, os times são públicos e ativos.

create or replace function public.criar_time(
  p_nome text,
  p_descricao text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_usuario_id uuid := auth.uid();
  v_nome text := regexp_replace(btrim(coalesce(p_nome, '')), '\s+', ' ', 'g');
  v_descricao text := nullif(btrim(coalesce(p_descricao, '')), '');
  v_time_id uuid;
begin
  if v_usuario_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if char_length(v_nome) < 2 or char_length(v_nome) > 80 then
    raise exception 'invalid_team_name' using errcode = '22023';
  end if;

  if v_descricao is not null and char_length(v_descricao) > 500 then
    raise exception 'invalid_team_description' using errcode = '22023';
  end if;

  insert into public.times (
    nome,
    descricao,
    responsavel_id,
    status,
    publico
  ) values (
    v_nome,
    v_descricao,
    v_usuario_id,
    'ativo',
    true
  )
  returning id into v_time_id;

  insert into public.membros_time (
    time_id,
    usuario_id,
    funcao,
    status
  ) values (
    v_time_id,
    v_usuario_id,
    'membro',
    'ativo'
  );

  return v_time_id;
end;
$$;

-- A função não deve ser chamada por visitantes anônimos nem por PUBLIC.
revoke all on function public.criar_time(text, text) from public;
revoke all on function public.criar_time(text, text) from anon;
grant execute on function public.criar_time(text, text) to authenticated;
