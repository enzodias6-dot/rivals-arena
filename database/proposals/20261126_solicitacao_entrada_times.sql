-- PROPOSTA INCREMENTAL — SOLICITAÇÃO DE ENTRADA EM EQUIPES
-- Base: public.times(id, responsavel_id, status, publico),
--       public.membros_time(id, time_id, usuario_id, funcao, status, entrou_em),
--       public.usuarios(id).
-- Não executar automaticamente. Revisar no projeto Supabase antes da aplicação.
--
-- Fluxo:
-- 1) jogador solicita entrada em uma equipe pública e ativa;
-- 2) responsável consulta solicitações recebidas;
-- 3) somente o responsável decide aprovar ou recusar;
-- 4) ao aprovar, o membro é incluído na mesma transação da decisão.

create table if not exists public.solicitacoes_time (
  id uuid primary key default gen_random_uuid(),
  time_id uuid not null references public.times(id) on delete cascade,
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  status text not null default 'pendente'
    check (status in ('pendente', 'aprovada', 'recusada')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  respondido_por uuid references public.usuarios(id) on delete set null,
  respondido_em timestamptz,
  constraint solicitacoes_time_resposta_consistente check (
    (status = 'pendente' and respondido_por is null and respondido_em is null)
    or
    (status in ('aprovada', 'recusada') and respondido_por is not null and respondido_em is not null)
  )
);

create unique index if not exists solicitacoes_time_uma_pendente_por_usuario
  on public.solicitacoes_time (time_id, usuario_id)
  where status = 'pendente';

create index if not exists solicitacoes_time_responsavel_status
  on public.solicitacoes_time (time_id, status, criado_em);

alter table public.solicitacoes_time enable row level security;

drop policy if exists solicitacoes_time_select_participantes
  on public.solicitacoes_time;
create policy solicitacoes_time_select_participantes
  on public.solicitacoes_time
  for select to authenticated
  using (
    usuario_id = (select auth.uid())
    or exists (
      select 1
      from public.times t
      where t.id = solicitacoes_time.time_id
        and t.responsavel_id = (select auth.uid())
    )
  );

revoke all on table public.solicitacoes_time from anon, authenticated;
grant select on table public.solicitacoes_time to authenticated;

create or replace function public.solicitar_entrada_time(p_time_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_usuario_id uuid := auth.uid();
  v_solicitacao_id uuid;
begin
  if v_usuario_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.times t
    where t.id = p_time_id and t.status = 'ativo' and t.publico = true
  ) then
    raise exception 'team_not_available' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.membros_time m
    where m.time_id = p_time_id
      and m.usuario_id = v_usuario_id
      and m.status = 'ativo'
  ) then
    raise exception 'already_member' using errcode = '23505';
  end if;

  insert into public.solicitacoes_time (time_id, usuario_id)
  values (p_time_id, v_usuario_id)
  on conflict (time_id, usuario_id) where status = 'pendente'
  do update set atualizado_em = now()
  returning id into v_solicitacao_id;

  return v_solicitacao_id;
end;
$$;

create or replace function public.responder_solicitacao_time(
  p_solicitacao_id uuid,
  p_decisao text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_usuario_id uuid := auth.uid();
  v_solicitacao public.solicitacoes_time%rowtype;
begin
  if v_usuario_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if p_decisao not in ('aprovar', 'recusar') then
    raise exception 'invalid_decision' using errcode = '22023';
  end if;

  select s.* into v_solicitacao
  from public.solicitacoes_time s
  where s.id = p_solicitacao_id
  for update;

  if not found then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.times t
    where t.id = v_solicitacao.time_id
      and t.responsavel_id = v_usuario_id
  ) then
    raise exception 'only_team_owner_can_decide' using errcode = '42501';
  end if;

  if v_solicitacao.status <> 'pendente' then
    raise exception 'request_already_decided' using errcode = '22023';
  end if;

  if p_decisao = 'aprovar' then
    if exists (
      select 1 from public.membros_time m
      where m.time_id = v_solicitacao.time_id
        and m.usuario_id = v_solicitacao.usuario_id
    ) then
      raise exception 'membership_record_already_exists' using errcode = '23505';
    end if;

    insert into public.membros_time (time_id, usuario_id, funcao, status)
    values (v_solicitacao.time_id, v_solicitacao.usuario_id, 'membro', 'ativo');

    update public.solicitacoes_time
    set status = 'aprovada',
        respondido_por = v_usuario_id,
        respondido_em = now(),
        atualizado_em = now()
    where id = p_solicitacao_id;

    return 'aprovada';
  end if;

  update public.solicitacoes_time
  set status = 'recusada',
      respondido_por = v_usuario_id,
      respondido_em = now(),
      atualizado_em = now()
  where id = p_solicitacao_id;

  return 'recusada';
end;
$$;

revoke all on function public.solicitar_entrada_time(uuid) from public, anon;
grant execute on function public.solicitar_entrada_time(uuid) to authenticated;

revoke all on function public.responder_solicitacao_time(uuid, text) from public, anon;
grant execute on function public.responder_solicitacao_time(uuid, text) to authenticated;
