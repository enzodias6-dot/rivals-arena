-- PROPOSTA INERTE: não aplicar sem aprovação e validação das policies RLS do projeto.
-- Serializa inscrições por campeonato sem SECURITY DEFINER e sem elevar permissões.
-- As policies do usuário autenticado precisam permitir ler o campeonato, inserir a
-- própria inscrição e contar todas as inscrições ativas daquele campeonato.
-- A aplicação ainda não chama esta função; será necessário aprovar também a mudança
-- da rota para usar rpc('inscrever_jogador_campeonato_atomico', ...).

begin;

create function public.inscrever_jogador_campeonato_atomico(p_campeonato_id uuid)
returns table (inscricao_id uuid, total_inscritos bigint)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_jogador_id uuid := auth.uid();
  v_status text;
  v_max_participantes integer;
  v_total bigint;
  v_inscricao_id uuid;
begin
  if v_jogador_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_campeonato_id::text, 0)
  );

  select c.status, c.max_participantes
    into v_status, v_max_participantes
    from public.campeonatos as c
   where c.id = p_campeonato_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'tournament_not_found';
  end if;
  if v_status <> 'aberto' then
    raise exception using errcode = 'P0001', message = 'registration_closed';
  end if;

  if exists (
    select 1
      from public.inscricoes as i
     where i.campeonato_id = p_campeonato_id
       and i.jogador_id = v_jogador_id
       and i.status in ('pendente', 'aprovada')
  ) then
    raise exception using errcode = 'P0001', message = 'already_registered';
  end if;

  select count(*)
    into v_total
    from public.inscricoes as i
   where i.campeonato_id = p_campeonato_id
     and i.status in ('pendente', 'aprovada');

  if v_total >= v_max_participantes then
    raise exception using errcode = 'P0001', message = 'tournament_full';
  end if;

  insert into public.inscricoes (campeonato_id, jogador_id)
  values (p_campeonato_id, v_jogador_id)
  returning id into v_inscricao_id;

  return query select v_inscricao_id, v_total + 1;
end;
$function$;

revoke all on function public.inscrever_jogador_campeonato_atomico(uuid) from public, anon;
grant execute on function public.inscrever_jogador_campeonato_atomico(uuid) to authenticated;

commit;
