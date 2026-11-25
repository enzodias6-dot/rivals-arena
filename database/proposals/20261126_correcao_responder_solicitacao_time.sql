-- CORREÇÃO INCREMENTAL — REATIVAÇÃO DE MEMBRO AO APROVAR SOLICITAÇÃO
-- A tabela e as duas RPCs já foram criadas pela proposta inicial.
-- Esta atualização substitui somente a função de resposta.
-- Não altera registros existentes nem remove dados.

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
      and t.status = 'ativo'
  ) then
    raise exception 'only_active_team_owner_can_decide' using errcode = '42501';
  end if;

  if v_solicitacao.status <> 'pendente' then
    raise exception 'request_already_decided' using errcode = '22023';
  end if;

  if p_decisao = 'aprovar' then
    if not exists (
      select 1 from public.times t
      where t.id = v_solicitacao.time_id
        and t.status = 'ativo'
        and t.publico = true
    ) then
      raise exception 'team_not_available' using errcode = '22023';
    end if;

    -- Reativa um vínculo histórico quando existir; caso contrário, cria um novo.
    update public.membros_time
    set status = 'ativo'
    where time_id = v_solicitacao.time_id
      and usuario_id = v_solicitacao.usuario_id;

    if not found then
      insert into public.membros_time (time_id, usuario_id, funcao, status)
      values (v_solicitacao.time_id, v_solicitacao.usuario_id, 'membro', 'ativo');
    end if;

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

revoke all on function public.responder_solicitacao_time(uuid, text) from public, anon;
grant execute on function public.responder_solicitacao_time(uuid, text) to authenticated;
