-- PROPOSTA NÃO EXECUTADA.
-- Compatível com partidas.resultado VARCHAR no formato numérico já imposto pelo banco.
-- O resultado final permanece exclusivamente em partidas.resultado; partida_resultados
-- guarda somente relatos pendentes e é removida ao confirmar. O ledger registra auditoria
-- e idempotência, não substituindo o resultado canônico.
-- IVI continua desativado até aprovação formal da fórmula e das regras.

begin;

do $preflight$
declare
  v_coluna record;
  v_tipo text;
  v_status_attnum smallint;
  v_status_existe boolean;
  v_status_invalido boolean;
begin
  if to_regclass('public.partidas') is null
     or to_regclass('public.usuarios') is null
     or to_regclass('public.campeonatos') is null then
    raise exception 'A proposta requer public.partidas, public.usuarios e public.campeonatos.';
  end if;

  for v_coluna in
    select * from (values
      ('partidas', 'id', 'uuid'),
      ('partidas', 'campeonato_id', 'uuid'),
      ('partidas', 'jogador_1_id', 'uuid'),
      ('partidas', 'jogador_2_id', 'uuid'),
      ('partidas', 'vencedor_id', 'uuid'),
      ('partidas', 'fase', 'string'),
      ('partidas', 'resultado', 'string'),
      ('usuarios', 'id', 'uuid'),
      ('usuarios', 'nome', 'string'),
      ('usuarios', 'email', 'string'),
      ('usuarios', 'perfil', 'string'),
      ('usuarios', 'nivel', 'integer'),
      ('usuarios', 'pontos', 'integer'),
      ('usuarios', 'vitorias', null),
      ('usuarios', 'derrotas', null),
      ('campeonatos', 'id', 'uuid'),
      ('campeonatos', 'nome', 'string'),
      ('campeonatos', 'criador_id', 'uuid')
    ) as esperado(tabela, coluna, tipo)
  loop
    select t.typname into v_tipo
      from pg_catalog.pg_attribute as a
      join pg_catalog.pg_type as t on t.oid = a.atttypid
     where a.attrelid = format('public.%I', v_coluna.tabela)::regclass
       and a.attname = v_coluna.coluna
       and not a.attisdropped;
    if v_tipo is null then
      raise exception 'Coluna public.%.% não encontrada.', v_coluna.tabela, v_coluna.coluna;
    end if;
    if v_coluna.tipo = 'string' and v_tipo not in ('text', 'varchar', 'bpchar') then
      raise exception 'public.%.% precisa ser uma coluna textual.', v_coluna.tabela, v_coluna.coluna;
    end if;
    if v_coluna.tipo = 'integer' and v_tipo not in ('int2', 'int4', 'int8') then
      raise exception 'public.%.% precisa ser uma coluna inteira.', v_coluna.tabela, v_coluna.coluna;
    end if;
    if v_coluna.tipo not in ('string', 'integer') and v_tipo <> v_coluna.tipo then
      raise exception 'Tipo inesperado em public.%.%: esperado %.', v_coluna.tabela, v_coluna.coluna, v_coluna.tipo;
    end if;
    if v_coluna.tipo is null and v_tipo not in ('int4', 'int8') then
      raise exception 'public.%.% precisa ser integer/bigint para registrar vitórias/derrotas.', v_coluna.tabela, v_coluna.coluna;
    end if;
  end loop;

  if exists (
    select 1 from pg_catalog.pg_attribute as a
     where a.attrelid = 'public.partidas'::regclass
       and a.attname = 'vencedor_id'
       and not a.attisdropped
       and a.attnotnull
  ) then
    raise exception 'public.partidas.vencedor_id precisa aceitar NULL para representar empates.';
  end if;

  select t.typname into v_tipo
    from pg_catalog.pg_attribute as a
    join pg_catalog.pg_type as t on t.oid = a.atttypid
   where a.attrelid = 'public.usuarios'::regclass
     and a.attname = 'empates'
     and not a.attisdropped;
  if v_tipo is not null and v_tipo not in ('int2', 'int4', 'int8') then
    raise exception 'public.usuarios.empates, quando existente, deve ser uma coluna inteira.';
  end if;

  select t.typname into v_tipo
    from pg_catalog.pg_attribute as a
    join pg_catalog.pg_type as t on t.oid = a.atttypid
   where a.attrelid = 'public.partidas'::regclass
     and a.attname = 'concluida_em'
     and not a.attisdropped;
  if v_tipo is null or v_tipo not in ('timestamp', 'timestamptz') then
    raise exception 'public.partidas.concluida_em deve ser timestamp ou timestamptz.';
  end if;

  select a.attnum::smallint into v_status_attnum
    from pg_catalog.pg_attribute as a
   where a.attrelid = 'public.partidas'::regclass
     and a.attname = 'status' and not a.attisdropped;
  v_status_existe := v_status_attnum is not null;
  if v_status_existe then
    select t.typname into v_tipo
      from pg_catalog.pg_attribute as a
      join pg_catalog.pg_type as t on t.oid = a.atttypid
     where a.attrelid = 'public.partidas'::regclass
       and a.attname = 'status'
       and not a.attisdropped;
    if v_tipo not in ('text', 'varchar') then
      raise exception 'public.partidas.status deve ser text/varchar para esta proposta.';
    end if;
    if exists (
      select 1 from pg_catalog.pg_constraint as c
       where c.conrelid = 'public.partidas'::regclass
         and c.contype = 'c'
         and v_status_attnum = any(c.conkey)
    ) then
      raise exception 'Há CHECK existente sobre partidas.status; revise-o antes de propor novos estados.';
    end if;
    execute $query$
      select exists (
        select 1 from public.partidas
         where status not in (
           'agendada', 'em_andamento', 'aguardando_confirmacao',
           'disputada', 'concluida', 'cancelada'
         )
      )
    $query$ into v_status_invalido;
    if v_status_invalido then
      raise exception 'public.partidas.status contém valores fora do contrato proposto; faça um mapeamento aprovado.';
    end if;
  end if;

  if to_regclass('public.partida_resultados') is not null
     or to_regclass('public.partida_resultado_eventos') is not null
     or to_regclass('public.partida_empates') is not null
     or to_regclass('public.ivi_ratings') is not null
     or to_regclass('public.ivi_movimentacoes') is not null then
    raise exception 'Uma ou mais estruturas propostas já existem; compare o DDL antes de aplicar.';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_class
     where oid = 'public.partidas'::regclass and relrowsecurity
  ) then
    raise exception 'RLS precisa estar habilitada em public.partidas antes de liberar a fila administrativa.';
  end if;

  if exists (
    select 1 from pg_catalog.pg_policies
     where schemaname = 'public'
       and tablename = 'partidas'
       and policyname = 'partidas_select_admin_disputadas'
  ) then
    raise exception 'A policy partidas_select_admin_disputadas já existe; compare sua definição.';
  end if;

  if exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = 'public.partidas'::regclass
       and conname = 'partidas_status_proposto_chk'
  ) then
    raise exception 'A constraint partidas_status_proposto_chk já existe; compare sua definição.';
  end if;

  if exists (
    select 1 from pg_catalog.pg_proc as p
     where p.pronamespace = 'public'::regnamespace
       and p.proname in (
         'submeter_resultado_partida', 'confirmar_resultado_partida',
         'contestar_resultado_partida', 'resolver_resultado_partida', 'agendar_partida'
       )
  ) then
    raise exception 'Já existe uma RPC de partidas com nome proposto; compare as assinaturas antes de aplicar.';
  end if;

  if to_regclass('public.partidas_jogador_1_agendamento_idx') is not null
     or to_regclass('public.partidas_jogador_2_agendamento_idx') is not null
     or to_regclass('public.partidas_status_idx') is not null
     or to_regclass('public.partida_resultado_eventos_partida_idx') is not null
     or to_regclass('public.ivi_movimentacoes_jogador_data_idx') is not null then
    raise exception 'Um índice proposto já existe; compare sua definição antes de aplicar.';
  end if;
end
$preflight$;

alter table public.partidas
  add column if not exists status text,
  add column if not exists agendada_para timestamptz;

do $validate_schedule_type$
declare
  v_tipo text;
begin
  select t.typname into v_tipo
    from pg_catalog.pg_attribute as a
    join pg_catalog.pg_type as t on t.oid = a.atttypid
   where a.attrelid = 'public.partidas'::regclass
     and a.attname = 'agendada_para'
     and not a.attisdropped;
  if v_tipo is null or v_tipo not in ('timestamp', 'timestamptz') then
    raise exception 'public.partidas.agendada_para deve ser timestamp ou timestamptz.';
  end if;
end
$validate_schedule_type$;

update public.partidas
   set status = case
     when concluida_em is not null or vencedor_id is not null then 'concluida'
     else 'agendada'
   end
 where status is null;

alter table public.partidas
  alter column status set default 'agendada',
  alter column status set not null;

alter table public.partidas
  add constraint partidas_status_proposto_chk
  check (status in (
    'agendada', 'em_andamento', 'aguardando_confirmacao',
    'disputada', 'concluida', 'cancelada'
  ));

create index partidas_jogador_1_agendamento_idx
  on public.partidas (jogador_1_id, agendada_para desc);
create index partidas_jogador_2_agendamento_idx
  on public.partidas (jogador_2_id, agendada_para desc);
create index partidas_status_idx on public.partidas (status);

create table public.partida_resultados (
  partida_id uuid primary key references public.partidas(id) on delete restrict,
  reportado_por uuid not null references public.usuarios(id) on delete restrict,
  vencedor_id uuid references public.usuarios(id) on delete restrict,
  resultado text not null check (resultado ~ '^[0-9]{1,31}-[0-9]{1,31}$'),
  status text not null default 'aguardando_confirmacao'
    check (status in ('aguardando_confirmacao', 'disputada')),
  contestado_por uuid references public.usuarios(id) on delete restrict,
  vencedor_contestado_id uuid references public.usuarios(id) on delete restrict,
  resultado_contestado text check (
    resultado_contestado is null or resultado_contestado ~ '^[0-9]{1,31}-[0-9]{1,31}$'
  ),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (
    (status = 'aguardando_confirmacao'
      and contestado_por is null and vencedor_contestado_id is null
      and resultado_contestado is null)
    or (status = 'disputada'
      and contestado_por is not null and resultado_contestado is not null)
  )
);

create table public.partida_resultado_eventos (
  id uuid primary key default gen_random_uuid(),
  partida_id uuid not null references public.partidas(id) on delete restrict,
  ator_id uuid not null references public.usuarios(id) on delete restrict,
  chave_idempotencia uuid not null unique,
  acao text not null check (acao in ('relatado', 'confirmado', 'contestado', 'resolvido_admin')),
  dados jsonb not null check (
    jsonb_typeof(dados) = 'object' and pg_column_size(dados) <= 8192
  ),
  criado_em timestamptz not null default now()
);

create index partida_resultado_eventos_partida_idx
  on public.partida_resultado_eventos (partida_id, criado_em);

create table public.partida_empates (
  partida_id uuid not null references public.partidas(id) on delete restrict,
  jogador_id uuid not null references public.usuarios(id) on delete restrict,
  criado_em timestamptz not null default now(),
  primary key (partida_id, jogador_id)
);

create table public.ivi_ratings (
  jogador_id uuid primary key references public.usuarios(id) on delete restrict,
  rating numeric(12, 4) not null default 1000 check (rating >= 0),
  versao_regra text not null,
  atualizado_em timestamptz not null default now()
);

create table public.ivi_movimentacoes (
  id uuid primary key default gen_random_uuid(),
  partida_id uuid not null references public.partidas(id) on delete restrict,
  jogador_id uuid not null references public.usuarios(id) on delete restrict,
  rating_anterior numeric(12, 4) not null check (rating_anterior >= 0),
  variacao numeric(12, 4) not null,
  rating_novo numeric(12, 4) not null check (rating_novo >= 0),
  versao_regra text not null,
  criado_em timestamptz not null default now(),
  unique (partida_id, jogador_id)
);

create index ivi_movimentacoes_jogador_data_idx
  on public.ivi_movimentacoes (jogador_id, criado_em desc);

alter table public.partida_resultados enable row level security;
alter table public.partida_resultado_eventos enable row level security;
alter table public.partida_empates enable row level security;
alter table public.ivi_ratings enable row level security;
alter table public.ivi_movimentacoes enable row level security;
revoke all on public.partida_resultados, public.partida_resultado_eventos,
  public.partida_empates, public.ivi_ratings, public.ivi_movimentacoes from public, anon, authenticated;
grant select on public.partida_resultados, public.partida_resultado_eventos,
  public.partida_empates, public.ivi_ratings, public.ivi_movimentacoes to authenticated;

create policy partida_resultados_select_participantes on public.partida_resultados
  for select to authenticated
  using (exists (
    select 1 from public.partidas as p
     where p.id = partida_resultados.partida_id
       and (p.jogador_1_id = (select auth.uid()) or p.jogador_2_id = (select auth.uid()))
  ));

create policy partida_resultado_eventos_select_participantes on public.partida_resultado_eventos
  for select to authenticated
  using (exists (
    select 1 from public.partidas as p
     where p.id = partida_resultado_eventos.partida_id
       and (p.jogador_1_id = (select auth.uid()) or p.jogador_2_id = (select auth.uid()))
  ));

create policy partida_empates_select_participantes on public.partida_empates
  for select to authenticated using (
    jogador_id = (select auth.uid()) and exists (
      select 1 from public.partidas as p where p.id = partida_empates.partida_id
        and (p.jogador_1_id = (select auth.uid()) or p.jogador_2_id = (select auth.uid()))
    )
  );

create policy ivi_ratings_select_owner on public.ivi_ratings
  for select to authenticated using (jogador_id = (select auth.uid()));

create policy ivi_movimentacoes_select_owner on public.ivi_movimentacoes
  for select to authenticated using (jogador_id = (select auth.uid()));

create function public.submeter_resultado_partida(
  p_partida_id uuid, p_vencedor_id uuid, p_resultado text, p_chave_idempotencia uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_ator uuid := auth.uid();
  v_partida public.partidas;
  v_resultado public.partida_resultados;
  v_evento public.partida_resultado_eventos;
  v_acao text;
  v_dados jsonb;
  v_resposta jsonb;
  v_pontos_jogador_1 numeric;
  v_pontos_jogador_2 numeric;
  v_vencedor_pelo_placar uuid;
begin
  if v_ator is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_chave_idempotencia is null or p_resultado is null
     or length(p_resultado) > 63
     or p_resultado !~ '^[0-9]{1,31}-[0-9]{1,31}$' then
    raise exception using errcode = '22023', message = 'invalid_result_payload';
  end if;
  v_pontos_jogador_1 := split_part(p_resultado, '-', 1)::numeric;
  v_pontos_jogador_2 := split_part(p_resultado, '-', 2)::numeric;
  if (v_pontos_jogador_1 = v_pontos_jogador_2 and p_vencedor_id is not null)
     or (v_pontos_jogador_1 <> v_pontos_jogador_2 and p_vencedor_id is null) then
    raise exception using errcode = '22023', message = 'score_winner_mismatch';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_chave_idempotencia::text, 1)
  );
  select * into v_evento from public.partida_resultado_eventos
   where chave_idempotencia = p_chave_idempotencia;
  if found then
    if v_evento.ator_id <> v_ator or v_evento.partida_id <> p_partida_id
       or v_evento.dados <> jsonb_build_object(
         'operacao', 'submeter', 'vencedor_id', p_vencedor_id, 'resultado', p_resultado
       ) then
      raise exception using errcode = '23505', message = 'idempotency_key_reused';
    end if;
    select * into v_resultado from public.partida_resultados where partida_id = p_partida_id;
    if found then
      return to_jsonb(v_resultado);
    end if;
    select jsonb_build_object(
      'partida_id', p.id, 'vencedor_id', p.vencedor_id,
      'resultado', p.resultado, 'status', 'confirmada',
      'confirmado_em', p.concluida_em
    ) into v_resposta
      from public.partidas as p
     where p.id = p_partida_id and p.status = 'concluida';
    if v_resposta is null then
      raise exception using errcode = 'P0002', message = 'result_not_found';
    end if;
    return v_resposta;
  end if;

  select * into v_partida from public.partidas where id = p_partida_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'match_not_found';
  end if;
  if v_partida.jogador_1_id is null or v_partida.jogador_2_id is null
     or v_partida.jogador_1_id = v_partida.jogador_2_id then
    raise exception using errcode = '22023', message = 'match_participants_invalid';
  end if;
  if v_ator <> v_partida.jogador_1_id and v_ator <> v_partida.jogador_2_id then
    raise exception using errcode = '42501', message = 'match_participant_required';
  end if;
  if p_vencedor_id is not null and p_vencedor_id <> v_partida.jogador_1_id and p_vencedor_id <> v_partida.jogador_2_id then
    raise exception using errcode = '22023', message = 'winner_must_be_participant';
  end if;
  v_vencedor_pelo_placar := case
    when v_pontos_jogador_1 = v_pontos_jogador_2 then null
    when v_pontos_jogador_1 > v_pontos_jogador_2 then v_partida.jogador_1_id
    else v_partida.jogador_2_id
  end;
  if p_vencedor_id is distinct from v_vencedor_pelo_placar then
    raise exception using errcode = '22023', message = 'score_winner_mismatch';
  end if;
  if v_partida.status in ('concluida', 'cancelada') or v_partida.concluida_em is not null then
    raise exception using errcode = 'P0001', message = 'match_finalized';
  end if;

  select * into v_resultado from public.partida_resultados
   where partida_id = p_partida_id for update;
  v_dados := jsonb_build_object(
    'operacao', 'submeter', 'vencedor_id', p_vencedor_id, 'resultado', p_resultado
  );

  if not found then
    insert into public.partida_resultados (
      partida_id, reportado_por, vencedor_id, resultado
    ) values (
      p_partida_id, v_ator, p_vencedor_id, p_resultado
    ) returning * into v_resultado;
    update public.partidas set status = 'aguardando_confirmacao' where id = p_partida_id;
    v_acao := 'relatado';
    v_resposta := to_jsonb(v_resultado);
  else
    if v_resultado.status <> 'aguardando_confirmacao'
       or v_resultado.reportado_por = v_ator then
      raise exception using errcode = 'P0001', message = 'result_not_open_for_submission';
    end if;

    if v_resultado.vencedor_id is not distinct from p_vencedor_id and v_resultado.resultado = p_resultado then
      update public.partidas
         set status = 'concluida',
             vencedor_id = p_vencedor_id,
             resultado = p_resultado,
             concluida_em = now()
       where id = p_partida_id;
      if p_vencedor_id is null then
        insert into public.partida_empates (partida_id, jogador_id)
        values (p_partida_id, v_partida.jogador_1_id), (p_partida_id, v_partida.jogador_2_id);
        if exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.usuarios'::regclass and attname = 'empates' and not attisdropped) then
          execute 'update public.usuarios set empates = coalesce(empates, 0) + 1 where id in ($1, $2)'
            using v_partida.jogador_1_id, v_partida.jogador_2_id;
        end if;
      else
        update public.usuarios set vitorias = coalesce(vitorias, 0) + 1 where id = p_vencedor_id;
        update public.usuarios set derrotas = coalesce(derrotas, 0) + 1
         where id = case when p_vencedor_id = v_partida.jogador_1_id
           then v_partida.jogador_2_id else v_partida.jogador_1_id end;
      end if;
      delete from public.partida_resultados where partida_id = p_partida_id;
      v_acao := 'confirmado';
      v_resposta := jsonb_build_object(
        'partida_id', p_partida_id, 'vencedor_id', p_vencedor_id,
        'resultado', p_resultado, 'status', 'confirmada',
        'confirmado_em', now()
      );
    else
      update public.partida_resultados
         set status = 'disputada',
             contestado_por = v_ator,
             vencedor_contestado_id = p_vencedor_id,
             resultado_contestado = p_resultado,
             atualizado_em = now()
       where partida_id = p_partida_id
      returning * into v_resultado;
      update public.partidas set status = 'disputada' where id = p_partida_id;
      v_acao := 'contestado';
      v_resposta := to_jsonb(v_resultado);
    end if;
  end if;

  insert into public.partida_resultado_eventos (
    partida_id, ator_id, chave_idempotencia, acao, dados
  ) values (p_partida_id, v_ator, p_chave_idempotencia, v_acao, v_dados);
  return v_resposta;
end
$function$;

create function public.confirmar_resultado_partida(
  p_partida_id uuid, p_chave_idempotencia uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_ator uuid := auth.uid();
  v_partida public.partidas;
  v_resultado public.partida_resultados;
  v_evento public.partida_resultado_eventos;
  v_resposta jsonb;
begin
  if v_ator is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_chave_idempotencia is null then
    raise exception using errcode = '22023', message = 'idempotency_key_required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_chave_idempotencia::text, 1)
  );
  select * into v_evento from public.partida_resultado_eventos
   where chave_idempotencia = p_chave_idempotencia;
  if found then
    if v_evento.ator_id <> v_ator or v_evento.partida_id <> p_partida_id
       or v_evento.acao <> 'confirmado' or v_evento.dados <> '{}'::jsonb then
      raise exception using errcode = '23505', message = 'idempotency_key_reused';
    end if;
    select jsonb_build_object(
      'partida_id', p.id, 'vencedor_id', p.vencedor_id,
      'resultado', p.resultado, 'status', 'confirmada',
      'confirmado_em', p.concluida_em
    ) into v_resposta
      from public.partidas as p
     where p.id = p_partida_id and p.status = 'concluida';
    if v_resposta is null then
      raise exception using errcode = 'P0002', message = 'result_not_found';
    end if;
    return v_resposta;
  end if;

  select * into v_partida from public.partidas where id = p_partida_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'match_not_found';
  end if;
  if v_partida.jogador_1_id is null or v_partida.jogador_2_id is null
     or v_partida.jogador_1_id = v_partida.jogador_2_id then
    raise exception using errcode = '22023', message = 'match_participants_invalid';
  end if;
  if v_partida.status in ('concluida', 'cancelada') or v_partida.concluida_em is not null then
    raise exception using errcode = 'P0001', message = 'match_finalized';
  end if;

  select * into v_resultado from public.partida_resultados
   where partida_id = p_partida_id for update;
  if not found or v_resultado.status <> 'aguardando_confirmacao' then
    raise exception using errcode = 'P0001', message = 'result_not_waiting_for_confirmation';
  end if;
  if v_ator = v_resultado.reportado_por
     or (v_ator <> v_partida.jogador_1_id and v_ator <> v_partida.jogador_2_id) then
    raise exception using errcode = '42501', message = 'opponent_confirmation_required';
  end if;

  update public.partidas
     set status = 'concluida',
         vencedor_id = v_resultado.vencedor_id,
         resultado = v_resultado.resultado,
         concluida_em = now()
   where id = p_partida_id;
  if v_resultado.vencedor_id is null then
    insert into public.partida_empates (partida_id, jogador_id)
    values (p_partida_id, v_partida.jogador_1_id), (p_partida_id, v_partida.jogador_2_id);
    if exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.usuarios'::regclass and attname = 'empates' and not attisdropped) then
      execute 'update public.usuarios set empates = coalesce(empates, 0) + 1 where id in ($1, $2)'
        using v_partida.jogador_1_id, v_partida.jogador_2_id;
    end if;
  else
    update public.usuarios set vitorias = coalesce(vitorias, 0) + 1 where id = v_resultado.vencedor_id;
    update public.usuarios set derrotas = coalesce(derrotas, 0) + 1
     where id = case when v_resultado.vencedor_id = v_partida.jogador_1_id
       then v_partida.jogador_2_id else v_partida.jogador_1_id end;
  end if;
  delete from public.partida_resultados where partida_id = p_partida_id;
  insert into public.partida_resultado_eventos (
    partida_id, ator_id, chave_idempotencia, acao, dados
  ) values (p_partida_id, v_ator, p_chave_idempotencia, 'confirmado', '{}'::jsonb);
  select jsonb_build_object(
    'partida_id', p_partida_id, 'vencedor_id', v_resultado.vencedor_id,
    'resultado', v_resultado.resultado, 'status', 'confirmada',
    'confirmado_em', now()
  ) into v_resposta;
  return v_resposta;
end
$function$;

create function public.contestar_resultado_partida(
  p_partida_id uuid, p_vencedor_id uuid, p_resultado text, p_chave_idempotencia uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_ator uuid := auth.uid();
  v_partida public.partidas;
  v_resultado public.partida_resultados;
  v_evento public.partida_resultado_eventos;
  v_dados jsonb;
  v_pontos_jogador_1 numeric;
  v_pontos_jogador_2 numeric;
  v_vencedor_pelo_placar uuid;
begin
  if v_ator is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_chave_idempotencia is null or p_resultado is null
     or length(p_resultado) > 63
     or p_resultado !~ '^[0-9]{1,31}-[0-9]{1,31}

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_chave_idempotencia::text, 1)
  );
  select * into v_evento from public.partida_resultado_eventos
   where chave_idempotencia = p_chave_idempotencia;
  if found then
    if v_evento.ator_id <> v_ator or v_evento.partida_id <> p_partida_id
       or v_evento.acao <> 'contestado' or v_evento.dados <> v_dados then
      raise exception using errcode = '23505', message = 'idempotency_key_reused';
    end if;
    select * into v_resultado from public.partida_resultados where partida_id = p_partida_id;
    if not found then
      raise exception using errcode = 'P0002', message = 'result_not_found';
    end if;
    return to_jsonb(v_resultado);
  end if;

  select * into v_partida from public.partidas where id = p_partida_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'match_not_found';
  end if;
  if v_partida.jogador_1_id is null or v_partida.jogador_2_id is null
     or v_partida.jogador_1_id = v_partida.jogador_2_id then
    raise exception using errcode = '22023', message = 'match_participants_invalid';
  end if;
  if v_partida.status in ('concluida', 'cancelada') or v_partida.concluida_em is not null then
    raise exception using errcode = 'P0001', message = 'match_finalized';
  end if;
  if p_vencedor_id is not null and p_vencedor_id not in (v_partida.jogador_1_id, v_partida.jogador_2_id) then
    raise exception using errcode = '22023', message = 'winner_must_be_participant';
  end if;
  v_vencedor_pelo_placar := case
    when v_pontos_jogador_1 = v_pontos_jogador_2 then null
    when v_pontos_jogador_1 > v_pontos_jogador_2 then v_partida.jogador_1_id
    else v_partida.jogador_2_id
  end;
  if p_vencedor_id is distinct from v_vencedor_pelo_placar then
    raise exception using errcode = '22023', message = 'score_winner_mismatch';
  end if;

  select * into v_resultado from public.partida_resultados
   where partida_id = p_partida_id for update;
  if not found or v_resultado.status <> 'aguardando_confirmacao' then
    raise exception using errcode = 'P0001', message = 'result_not_open_for_contest';
  end if;
  if v_ator = v_resultado.reportado_por
     or (v_ator <> v_partida.jogador_1_id and v_ator <> v_partida.jogador_2_id) then
    raise exception using errcode = '42501', message = 'opponent_contest_required';
  end if;
  if v_resultado.vencedor_id is not distinct from p_vencedor_id and v_resultado.resultado = p_resultado then
    raise exception using errcode = 'P0001', message = 'result_not_divergent';
  end if;

  update public.partida_resultados
     set status = 'disputada',
         contestado_por = v_ator,
         vencedor_contestado_id = p_vencedor_id,
         resultado_contestado = p_resultado,
         atualizado_em = now()
   where partida_id = p_partida_id returning * into v_resultado;
  update public.partidas set status = 'disputada' where id = p_partida_id;
  insert into public.partida_resultado_eventos (
    partida_id, ator_id, chave_idempotencia, acao, dados
  ) values (p_partida_id, v_ator, p_chave_idempotencia, 'contestado', v_dados);
  return to_jsonb(v_resultado);
end
$function$;

create function public.resolver_resultado_partida(
  p_partida_id uuid,
  p_vencedor_id uuid,
  p_resultado text,
  p_justificativa text,
  p_chave_idempotencia uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_ator uuid := auth.uid();
  v_perfil text;
  v_partida public.partidas;
  v_resultado public.partida_resultados;
  v_evento public.partida_resultado_eventos;
  v_dados jsonb;
  v_pontos_jogador_1 numeric;
  v_pontos_jogador_2 numeric;
  v_resposta jsonb;
begin
  if v_ator is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  select u.perfil into v_perfil from public.usuarios as u where u.id = v_ator;
  if v_perfil is distinct from 'admin' then
    raise exception using errcode = '42501', message = 'administrator_required';
  end if;

  if p_chave_idempotencia is null or p_resultado is null
     or length(p_resultado) > 63
     or p_resultado !~ '^[0-9]{1,31}-[0-9]{1,31}$'
     or p_justificativa is null
     or length(pg_catalog.btrim(p_justificativa)) = 0
     or length(pg_catalog.btrim(p_justificativa)) > 1000 then
    raise exception using errcode = '22023', message = 'invalid_admin_resolution_payload';
  end if;
  v_pontos_jogador_1 := split_part(p_resultado, '-', 1)::numeric;
  v_pontos_jogador_2 := split_part(p_resultado, '-', 2)::numeric;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_chave_idempotencia::text, 1));
  v_dados := jsonb_build_object(
    'operacao', 'resolver_admin',
    'vencedor_id', p_vencedor_id,
    'resultado', p_resultado,
    'justificativa', pg_catalog.btrim(p_justificativa)
  );
  select * into v_evento from public.partida_resultado_eventos
   where chave_idempotencia = p_chave_idempotencia;
  if found then
    if v_evento.ator_id <> v_ator or v_evento.partida_id <> p_partida_id
       or v_evento.acao <> 'resolvido_admin' or v_evento.dados <> v_dados then
      raise exception using errcode = '23505', message = 'idempotency_key_reused';
    end if;
    select jsonb_build_object(
      'partida_id', p.id, 'vencedor_id', p.vencedor_id,
      'resultado', p.resultado, 'status', 'confirmada',
      'confirmado_em', p.concluida_em, 'resolvido_por', v_ator,
      'justificativa', v_dados ->> 'justificativa'
    ) into v_resposta from public.partidas as p
     where p.id = p_partida_id and p.status = 'concluida';
    if v_resposta is null then
      raise exception using errcode = 'P0002', message = 'result_not_found';
    end if;
    return v_resposta;
  end if;

  select * into v_partida from public.partidas where id = p_partida_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'match_not_found';
  end if;
  if v_partida.status <> 'disputada' or v_partida.concluida_em is not null then
    raise exception using errcode = 'P0001', message = 'result_not_disputed';
  end if;
  if p_vencedor_id is not null
     and p_vencedor_id not in (v_partida.jogador_1_id, v_partida.jogador_2_id) then
    raise exception using errcode = '22023', message = 'winner_must_be_participant';
  end if;
  if (v_pontos_jogador_1 = v_pontos_jogador_2 and p_vencedor_id is not null)
     or (v_pontos_jogador_1 > v_pontos_jogador_2 and p_vencedor_id is distinct from v_partida.jogador_1_id)
     or (v_pontos_jogador_1 < v_pontos_jogador_2 and p_vencedor_id is distinct from v_partida.jogador_2_id) then
    raise exception using errcode = '22023', message = 'score_winner_mismatch';
  end if;

  select * into v_resultado from public.partida_resultados
   where partida_id = p_partida_id for update;
  if not found or v_resultado.status <> 'disputada' then
    raise exception using errcode = 'P0001', message = 'result_not_disputed';
  end if;

  update public.partidas
     set status = 'concluida', vencedor_id = p_vencedor_id,
         resultado = p_resultado, concluida_em = now()
   where id = p_partida_id;

  if p_vencedor_id is null then
    insert into public.partida_empates (partida_id, jogador_id)
    values (p_partida_id, v_partida.jogador_1_id),
           (p_partida_id, v_partida.jogador_2_id);
    if exists (select 1 from pg_catalog.pg_attribute
      where attrelid = 'public.usuarios'::regclass and attname = 'empates' and not attisdropped) then
      execute 'update public.usuarios set empates = coalesce(empates, 0) + 1 where id in ($1, $2)'
        using v_partida.jogador_1_id, v_partida.jogador_2_id;
    end if;
  else
    update public.usuarios set vitorias = coalesce(vitorias, 0) + 1 where id = p_vencedor_id;
    update public.usuarios set derrotas = coalesce(derrotas, 0) + 1
     where id = case when p_vencedor_id = v_partida.jogador_1_id
       then v_partida.jogador_2_id else v_partida.jogador_1_id end;
  end if;

  delete from public.partida_resultados where partida_id = p_partida_id;
  insert into public.partida_resultado_eventos (partida_id, ator_id, chave_idempotencia, acao, dados)
  values (p_partida_id, v_ator, p_chave_idempotencia, 'resolvido_admin', v_dados);

  return jsonb_build_object(
    'partida_id', p_partida_id, 'vencedor_id', p_vencedor_id,
    'resultado', p_resultado, 'status', 'confirmada',
    'confirmado_em', now(), 'resolvido_por', v_ator,
    'justificativa', v_dados ->> 'justificativa'
  );
end
$function$;

create function public.agendar_partida(p_partida_id uuid, p_agendada_para timestamptz)
returns public.partidas
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_ator uuid := auth.uid();
  v_partida public.partidas;
begin
  if v_ator is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_agendada_para is null or p_agendada_para <= now() then
    raise exception using errcode = '22023', message = 'invalid_schedule_time';
  end if;
  select p.* into v_partida
    from public.partidas as p
    join public.campeonatos as c on c.id = p.campeonato_id
   where p.id = p_partida_id and c.criador_id = v_ator
   for update of p;
  if not found then
    raise exception using errcode = '42501', message = 'championship_organizer_required';
  end if;
  if v_partida.status not in ('agendada', 'em_andamento') then
    raise exception using errcode = 'P0001', message = 'match_not_schedulable';
  end if;
  update public.partidas
     set agendada_para = p_agendada_para
   where id = p_partida_id
  returning * into v_partida;
  return v_partida;
end
$function$;

-- A API altera somente usuarios.nome. Usuários autenticados não podem mudar
-- perfil, pontos ou estatísticas diretamente; a resolução consulta perfil='admin'
-- dentro da RPC SECURITY DEFINER. O preflight/auditoria do ambiente ainda precisa
-- confirmar as policies RLS e ACLs preexistentes antes da aplicação.
revoke insert, update, delete, truncate, references, trigger
  on public.partidas, public.usuarios from anon;
revoke update on public.usuarios from public, anon, authenticated;
grant update (nome) on public.usuarios to authenticated;
grant select on public.partidas to authenticated;

create policy partidas_select_admin_disputadas on public.partidas
  for select to authenticated
  using (
    status = 'disputada'
    and exists (
      select 1 from public.usuarios as u
       where u.id = (select auth.uid())
         and u.perfil = 'admin'
    )
  );

revoke all on function public.submeter_resultado_partida(uuid, uuid, text, uuid) from public, anon;
revoke all on function public.confirmar_resultado_partida(uuid, uuid) from public, anon;
revoke all on function public.contestar_resultado_partida(uuid, uuid, text, uuid) from public, anon;
revoke all on function public.agendar_partida(uuid, timestamptz) from public, anon;
revoke all on function public.resolver_resultado_partida(uuid, uuid, text, text, uuid) from public, anon;
grant execute on function public.submeter_resultado_partida(uuid, uuid, text, uuid) to authenticated;
grant execute on function public.confirmar_resultado_partida(uuid, uuid) to authenticated;
grant execute on function public.contestar_resultado_partida(uuid, uuid, text, uuid) to authenticated;
grant execute on function public.agendar_partida(uuid, timestamptz) to authenticated;
grant execute on function public.resolver_resultado_partida(uuid, uuid, text, text, uuid) to authenticated;

commit;
