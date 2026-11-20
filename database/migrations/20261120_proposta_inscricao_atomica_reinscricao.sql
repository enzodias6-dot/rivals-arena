-- PROPOSTA NÃO EXECUTADA.
-- Serializa entradas e reinscrições no PostgreSQL; a proteção também vale para inserts
-- que não usem a RPC antiga. Preserva linhas canceladas e substitui somente a constraint
-- conhecida inscricoes_campeonato_id_jogador_id_key, após confirmar seu tipo e colunas.
-- Índices standalone equivalentes bloqueiam a migração; nenhum índice é removido.
-- Não substitui nem remove policies RLS; revise as policies atuais antes da aplicação.

begin;

do $preflight$
declare
  v_colunas text[];
  v_coluna record;
  v_tipo text;
begin
  if to_regclass('public.inscricoes') is null
     or to_regclass('public.campeonatos') is null then
    raise exception 'A proposta requer public.inscricoes e public.campeonatos.';
  end if;

  select array_agg(a.attname::text order by a.attname::text)
    into v_colunas
    from pg_catalog.pg_attribute as a
   where a.attrelid = 'public.inscricoes'::regclass
     and a.attname in ('id', 'campeonato_id', 'jogador_id', 'status')
     and not a.attisdropped;
  if v_colunas is distinct from array['campeonato_id', 'id', 'jogador_id', 'status']::text[] then
    raise exception 'Confirme as colunas id, campeonato_id, jogador_id e status em public.inscricoes.';
  end if;

  for v_coluna in
    select * from (values
      ('inscricoes', 'id', 'uuid'),
      ('inscricoes', 'campeonato_id', 'uuid'),
      ('inscricoes', 'jogador_id', 'uuid'),
      ('inscricoes', 'status', 'string'),
      ('campeonatos', 'max_participantes', 'integer'),
      ('campeonatos', 'status', 'string')
    ) as esperado(tabela, coluna, tipo)
  loop
    select t.typname into v_tipo
      from pg_catalog.pg_attribute as a
      join pg_catalog.pg_type as t on t.oid = a.atttypid
     where a.attrelid = format('public.%I', v_coluna.tabela)::regclass
       and a.attname = v_coluna.coluna and not a.attisdropped;
    if v_tipo is null
       or (v_coluna.tipo = 'uuid' and v_tipo <> 'uuid')
       or (v_coluna.tipo = 'string' and v_tipo not in ('text', 'varchar', 'bpchar'))
       or (v_coluna.tipo = 'integer' and v_tipo not in ('int2', 'int4', 'int8')) then
      raise exception 'Tipo incompatível em public.%.%; interrompendo antes de alterar constraints.', v_coluna.tabela, v_coluna.coluna;
    end if;
  end loop;

  if exists (
    select 1 from public.inscricoes
     where status not in ('pendente', 'aprovada', 'cancelada')
  ) then
    raise exception 'Há status de inscrição fora do contrato da migração; preserve e mapeie esses registros antes de continuar.';
  end if;

  if to_regclass('public.inscricoes_ativas_campeonato_jogador_uq') is not null
     or to_regprocedure('public.validar_inscricao_e_vagas()') is not null
     or exists (
       select 1 from pg_catalog.pg_trigger
        where tgrelid = 'public.inscricoes'::regclass
          and tgname = 'inscricoes_validar_capacidade_atomica'
          and not tgisinternal
     ) then
    raise exception 'Um objeto proposto para reinscrição já existe; compare sua definição antes de aplicar.';
  end if;

  if exists (
    select 1
      from public.inscricoes
     where status in ('pendente', 'aprovada')
     group by campeonato_id, jogador_id
    having count(*) > 1
  ) then
    raise exception 'Existem inscrições ativas duplicadas; revise os dados antes de aplicar.';
  end if;
end
$preflight$;

-- Mantém a UNIQUE global (campeonato_id, jogador_id): cada jogador possui
-- uma única linha por campeonato, inclusive após cancelamento. Reinscrição é UPDATE.

create function public.validar_inscricao_e_vagas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_capacidade integer;
  v_status_campeonato text;
  v_ativas bigint;
begin
  if tg_op = 'DELETE' then
    if auth.uid() is not null then
      raise exception using errcode = '42501', message = 'registration_history_is_preserved';
    end if;
    return old;
  end if;

  if auth.uid() is not null and auth.uid() <> new.jogador_id then
    raise exception using errcode = '42501', message = 'registration_actor_mismatch';
  end if;

  if tg_op = 'UPDATE' and
     (new.campeonato_id <> old.campeonato_id or new.jogador_id <> old.jogador_id) then
    raise exception using errcode = '42501', message = 'registration_identity_immutable';
  end if;

  if tg_op = 'INSERT' then
    new.status := 'pendente';
  elsif tg_op = 'UPDATE' then
    if old.status = 'cancelada' and new.status not in ('cancelada', 'pendente') then
      raise exception using errcode = '42501', message = 'registration_status_transition_forbidden';
    end if;
    if auth.uid() is not null and new.status not in (old.status, 'cancelada', 'pendente') then
      raise exception using errcode = '42501', message = 'registration_status_transition_forbidden';
    end if;
  end if;

  if new.status not in ('pendente', 'aprovada') then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status in ('pendente', 'aprovada') then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.campeonato_id::text, 0)
  );

  select c.max_participantes, c.status
    into v_capacidade, v_status_campeonato
    from public.campeonatos as c
   where c.id = new.campeonato_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'championship_not_found';
  end if;
  if v_status_campeonato <> 'aberto' then
    raise exception using errcode = 'P0001', message = 'registration_closed';
  end if;

  select count(*) into v_ativas
    from public.inscricoes as i
   where i.campeonato_id = new.campeonato_id
     and i.status in ('pendente', 'aprovada')
     and (tg_op = 'INSERT' or i.id <> new.id);
  if v_ativas >= v_capacidade then
    raise exception using errcode = 'P0001', message = 'championship_full';
  end if;
  return new;
end
$function$;

create trigger inscricoes_validar_capacidade_atomica
before insert or update of status, campeonato_id, jogador_id or delete on public.inscricoes
for each row execute function public.validar_inscricao_e_vagas();

revoke all on function public.validar_inscricao_e_vagas() from public, anon, authenticated;

commit;
