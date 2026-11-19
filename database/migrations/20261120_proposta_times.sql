-- PROPOSTA NÃO EXECUTADA.
-- Contrato novo, sem pressupor que times/membros_time já existam no Supabase.
-- Premissas propostas: times visíveis a usuários autenticados; ingresso por solicitação;
-- capacidade padrão/máxima de 5 (a aprovar); um jogador pode integrar mais de um time.
-- Todas as escritas passam por funções SECURITY DEFINER restritas, com auth.uid() validado.
-- Não contém DROP nem migração de dados existentes.

begin;

do $preflight$
declare
  v_tipo_id text;
begin
  if to_regclass('public.usuarios') is null then
    raise exception 'A proposta requer public.usuarios; confirme o schema Supabase antes de aplicar.';
  end if;

  select t.typname into v_tipo_id
    from pg_catalog.pg_attribute as a
    join pg_catalog.pg_type as t on t.oid = a.atttypid
   where a.attrelid = 'public.usuarios'::regclass
     and a.attname = 'id'
     and not a.attisdropped;

  if v_tipo_id is distinct from 'uuid' then
    raise exception 'A proposta requer public.usuarios.id do tipo uuid.';
  end if;

  if to_regclass('public.times') is not null
     or to_regclass('public.membros_time') is not null
     or to_regclass('public.solicitacoes_time') is not null then
    raise exception 'Um ou mais objetos de Times já existem; compare o DDL antes de aplicar.';
  end if;
end
$preflight$;

create table public.times (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(btrim(nome)) between 2 and 80),
  descricao text not null default '' check (char_length(descricao) <= 1000),
  lider_id uuid not null references public.usuarios(id) on delete restrict,
  max_integrantes smallint not null default 5 check (max_integrantes between 2 and 5),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create unique index times_nome_normalizado_uq on public.times (lower(btrim(nome)));
create index times_lider_id_idx on public.times (lider_id);

create table public.membros_time (
  id uuid primary key default gen_random_uuid(),
  time_id uuid not null references public.times(id) on delete restrict,
  jogador_id uuid not null references public.usuarios(id) on delete restrict,
  status text not null default 'ativo'
    check (status in ('ativo', 'saiu', 'removido')),
  entrou_em timestamptz not null default now(),
  encerrou_em timestamptz,
  check ((status = 'ativo' and encerrou_em is null) or
         (status <> 'ativo' and encerrou_em is not null))
);

create unique index membros_time_ativos_uq
  on public.membros_time (time_id, jogador_id) where status = 'ativo';
create index membros_time_jogador_idx on public.membros_time (jogador_id, status);
create index membros_time_time_idx on public.membros_time (time_id, status);

create table public.solicitacoes_time (
  id uuid primary key default gen_random_uuid(),
  time_id uuid not null references public.times(id) on delete restrict,
  jogador_id uuid not null references public.usuarios(id) on delete restrict,
  status text not null default 'pendente'
    check (status in ('pendente', 'aprovada', 'recusada')),
  criada_em timestamptz not null default now(),
  decidida_em timestamptz,
  decidida_por uuid references public.usuarios(id) on delete set null,
  check ((status = 'pendente' and decidida_em is null) or
         (status <> 'pendente' and decidida_em is not null))
);

create unique index solicitacoes_time_pendentes_uq
  on public.solicitacoes_time (time_id, jogador_id) where status = 'pendente';
create index solicitacoes_time_jogador_idx
  on public.solicitacoes_time (jogador_id, status);

alter table public.times enable row level security;
alter table public.membros_time enable row level security;
alter table public.solicitacoes_time enable row level security;

revoke all on public.times, public.membros_time, public.solicitacoes_time from public, anon, authenticated;
grant select on public.times, public.membros_time, public.solicitacoes_time to authenticated;

create policy times_select_authenticated on public.times
  for select to authenticated using (true);

create policy membros_time_select_authenticated on public.membros_time
  for select to authenticated using (true);

create policy solicitacoes_time_select_actor_or_leader on public.solicitacoes_time
  for select to authenticated
  using (
    jogador_id = (select auth.uid())
    or exists (
      select 1 from public.times as t
       where t.id = solicitacoes_time.time_id
         and t.lider_id = (select auth.uid())
    )
  );

create function public.validar_capacidade_membros_time()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_capacidade smallint;
  v_ativos bigint;
begin
  if new.status <> 'ativo' then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.time_id::text, 0)
  );

  select t.max_integrantes into v_capacidade
    from public.times as t
   where t.id = new.time_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'team_not_found';
  end if;

  select count(*) into v_ativos
    from public.membros_time as m
   where m.time_id = new.time_id and m.status = 'ativo'
     and (tg_op = 'INSERT' or m.id <> new.id);
  if v_ativos >= v_capacidade then
    raise exception using errcode = 'P0001', message = 'team_full';
  end if;
  return new;
end
$function$;

create trigger membros_time_validar_capacidade
before insert or update of time_id, status on public.membros_time
for each row execute function public.validar_capacidade_membros_time();

create function public.criar_time(p_nome text, p_descricao text, p_max_integrantes smallint default 5)
returns public.times
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_ator uuid := auth.uid();
  v_nome text := btrim(coalesce(p_nome, ''));
  v_time public.times;
begin
  if v_ator is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if char_length(v_nome) not between 2 and 80 or v_nome ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'invalid_team_name';
  end if;
  if char_length(coalesce(p_descricao, '')) > 1000 then
    raise exception using errcode = '22023', message = 'invalid_team_description';
  end if;
  if p_max_integrantes not between 2 and 5 then
    raise exception using errcode = '22023', message = 'invalid_team_capacity';
  end if;

  insert into public.times (nome, descricao, lider_id, max_integrantes)
  values (v_nome, btrim(coalesce(p_descricao, '')), v_ator, p_max_integrantes)
  returning * into v_time;

  insert into public.membros_time (time_id, jogador_id, status)
  values (v_time.id, v_ator, 'ativo');
  return v_time;
end
$function$;

create function public.atualizar_time(
  p_time_id uuid, p_nome text, p_descricao text, p_max_integrantes smallint
)
returns public.times
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_ator uuid := auth.uid();
  v_time public.times;
  v_ativos bigint;
begin
  if v_ator is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  select * into v_time from public.times where id = p_time_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'team_not_found';
  end if;
  if v_time.lider_id <> v_ator then
    raise exception using errcode = '42501', message = 'team_leader_required';
  end if;
  if char_length(btrim(coalesce(p_nome, ''))) not between 2 and 80
     or p_nome ~ '[[:cntrl:]]'
     or char_length(coalesce(p_descricao, '')) > 1000
     or p_max_integrantes not between 2 and 5 then
    raise exception using errcode = '22023', message = 'invalid_team_data';
  end if;
  select count(*) into v_ativos
    from public.membros_time
   where time_id = p_time_id and status = 'ativo';
  if p_max_integrantes < v_ativos then
    raise exception using errcode = 'P0001', message = 'capacity_below_members';
  end if;

  update public.times
     set nome = btrim(p_nome),
         descricao = btrim(coalesce(p_descricao, '')),
         max_integrantes = p_max_integrantes,
         atualizado_em = now()
   where id = p_time_id
  returning * into v_time;
  return v_time;
end
$function$;

create function public.solicitar_entrada_time(p_time_id uuid)
returns public.solicitacoes_time
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_ator uuid := auth.uid();
  v_time public.times;
  v_solicitacao public.solicitacoes_time;
  v_ativos bigint;
begin
  if v_ator is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  select * into v_time from public.times where id = p_time_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'team_not_found';
  end if;
  if exists (
    select 1 from public.membros_time
     where time_id = p_time_id and jogador_id = v_ator and status = 'ativo'
  ) then
    raise exception using errcode = 'P0001', message = 'already_team_member';
  end if;
  select count(*) into v_ativos
    from public.membros_time where time_id = p_time_id and status = 'ativo';
  if v_ativos >= v_time.max_integrantes then
    raise exception using errcode = 'P0001', message = 'team_full';
  end if;
  insert into public.solicitacoes_time (time_id, jogador_id)
  values (p_time_id, v_ator)
  returning * into v_solicitacao;
  return v_solicitacao;
end
$function$;

create function public.responder_solicitacao_time(p_solicitacao_id uuid, p_aceitar boolean)
returns public.solicitacoes_time
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_ator uuid := auth.uid();
  v_solicitacao public.solicitacoes_time;
  v_time public.times;
  v_ativos bigint;
begin
  if v_ator is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  select * into v_solicitacao
    from public.solicitacoes_time where id = p_solicitacao_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'request_not_found';
  end if;
  select * into v_time
    from public.times where id = v_solicitacao.time_id for update;
  if v_time.lider_id <> v_ator then
    raise exception using errcode = '42501', message = 'team_leader_required';
  end if;
  if v_solicitacao.status <> 'pendente' then
    raise exception using errcode = 'P0001', message = 'request_already_decided';
  end if;

  if p_aceitar then
    select count(*) into v_ativos
      from public.membros_time where time_id = v_time.id and status = 'ativo';
    if v_ativos >= v_time.max_integrantes then
      raise exception using errcode = 'P0001', message = 'team_full';
    end if;
    insert into public.membros_time (time_id, jogador_id, status)
    values (v_time.id, v_solicitacao.jogador_id, 'ativo');
  end if;

  update public.solicitacoes_time
     set status = case when p_aceitar then 'aprovada' else 'recusada' end,
         decidida_em = now(),
         decidida_por = v_ator
   where id = p_solicitacao_id
  returning * into v_solicitacao;
  return v_solicitacao;
end
$function$;

create function public.sair_time(p_time_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_ator uuid := auth.uid();
  v_lider uuid;
begin
  if v_ator is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  select lider_id into v_lider from public.times where id = p_time_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'team_not_found';
  end if;
  if v_lider = v_ator then
    raise exception using errcode = 'P0001', message = 'leader_must_transfer_first';
  end if;
  update public.membros_time
     set status = 'saiu', encerrou_em = now()
   where time_id = p_time_id and jogador_id = v_ator and status = 'ativo';
  if not found then
    raise exception using errcode = 'P0002', message = 'active_membership_not_found';
  end if;
end
$function$;

create function public.remover_membro_time(p_time_id uuid, p_jogador_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_ator uuid := auth.uid();
  v_lider uuid;
begin
  if v_ator is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  select lider_id into v_lider from public.times where id = p_time_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'team_not_found';
  end if;
  if v_lider <> v_ator then
    raise exception using errcode = '42501', message = 'team_leader_required';
  end if;
  if p_jogador_id = v_lider then
    raise exception using errcode = 'P0001', message = 'leader_must_transfer_first';
  end if;
  update public.membros_time
     set status = 'removido', encerrou_em = now()
   where time_id = p_time_id and jogador_id = p_jogador_id and status = 'ativo';
  if not found then
    raise exception using errcode = 'P0002', message = 'active_membership_not_found';
  end if;
end
$function$;

create function public.transferir_lider_time(p_time_id uuid, p_novo_lider_id uuid)
returns public.times
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_ator uuid := auth.uid();
  v_time public.times;
begin
  if v_ator is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  select * into v_time from public.times where id = p_time_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'team_not_found';
  end if;
  if v_time.lider_id <> v_ator then
    raise exception using errcode = '42501', message = 'team_leader_required';
  end if;
  if not exists (
    select 1 from public.membros_time
     where time_id = p_time_id and jogador_id = p_novo_lider_id and status = 'ativo'
  ) then
    raise exception using errcode = 'P0001', message = 'new_leader_must_be_active_member';
  end if;
  update public.times set lider_id = p_novo_lider_id, atualizado_em = now()
   where id = p_time_id returning * into v_time;
  return v_time;
end
$function$;

revoke all on function public.validar_capacidade_membros_time() from public, anon, authenticated;
revoke all on function public.criar_time(text, text, smallint) from public, anon;
revoke all on function public.atualizar_time(uuid, text, text, smallint) from public, anon;
revoke all on function public.solicitar_entrada_time(uuid) from public, anon;
revoke all on function public.responder_solicitacao_time(uuid, boolean) from public, anon;
revoke all on function public.sair_time(uuid) from public, anon;
revoke all on function public.remover_membro_time(uuid, uuid) from public, anon;
revoke all on function public.transferir_lider_time(uuid, uuid) from public, anon;
grant execute on function public.criar_time(text, text, smallint) to authenticated;
grant execute on function public.atualizar_time(uuid, text, text, smallint) to authenticated;
grant execute on function public.solicitar_entrada_time(uuid) to authenticated;
grant execute on function public.responder_solicitacao_time(uuid, boolean) to authenticated;
grant execute on function public.sair_time(uuid) to authenticated;
grant execute on function public.remover_membro_time(uuid, uuid) to authenticated;
grant execute on function public.transferir_lider_time(uuid, uuid) to authenticated;

commit;
