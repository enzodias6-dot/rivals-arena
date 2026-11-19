-- PROPOSTA NÃO EXECUTADA.
-- Catálogo sem itens fictícios. A equipe responsável deverá cadastrar/publicar conteúdo real.
-- A estrutura é aditiva e mantém RLS habilitada; usuários autenticados só leem itens publicados.

begin;

do $preflight$
begin
  if to_regclass('public.arsenal_itens') is not null then
    raise exception 'public.arsenal_itens já existe; compare o DDL antes de aplicar.';
  end if;
end
$preflight$;

create table public.arsenal_itens (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  nome text not null check (char_length(btrim(nome)) between 1 and 100),
  categoria text not null check (char_length(btrim(categoria)) between 1 and 60),
  descricao text not null default '' check (char_length(descricao) <= 2000),
  detalhes jsonb not null default '{}'::jsonb
    check (jsonb_typeof(detalhes) = 'object'),
  publicado boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index arsenal_itens_publicados_categoria_nome_idx
  on public.arsenal_itens (categoria, nome) where publicado;

alter table public.arsenal_itens enable row level security;
revoke all on public.arsenal_itens from public, anon, authenticated;
grant select on public.arsenal_itens to authenticated;

create policy arsenal_itens_select_publicados on public.arsenal_itens
  for select to authenticated using (publicado = true);

commit;
