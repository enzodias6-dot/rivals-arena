# Inventário SQL e banco de dados

## Fonte e limites
Este documento resume o inventário de Supabase fornecido pela equipe. Não houve conexão direta com o projeto remoto, leitura de `.env`, execução de SQL nem aplicação de migrações. O inventário é parcial e não substitui uma exportação schema-only do PostgreSQL.

## Objetos informados como existentes
- Tabelas: `usuarios`, `campeonatos`, `inscricoes`, `partidas`, `desafios`, `times`, `membros_time`.
- Views: `vw_ranking`, `vw_ranking_publico`, `vw_perfis_publicos`.
- RLS habilitada nas sete tabelas informadas.
- Trigger `rivals_arena_criar_perfil_apos_cadastro` habilitado em `auth.users`.
- Constraint UNIQUE `inscricoes_campeonato_id_jogador_id_key` em `(campeonato_id, jogador_id)`.
- Coluna `partidas.resultado` informada como `VARCHAR`, com constraint para placar numérico.
- `vw_ranking_publico` informada com `security_invoker=false`; `vw_perfis_publicos` com `security_invoker=true`.

## Objetos não encontrados no inventário
- `arsenal_itens`.
- `partida_resultados`.
- `solicitacoes_time`.

A ausência no inventário fornecido não é prova de inexistência absoluta; deve ser confirmada por consulta read-only ao catálogo real.

## Migrações PostgreSQL propostas
As migrações abaixo são propostas versionadas no repositório. Nenhuma deve ser considerada aplicada:
- `20261119_inscricao_atomica.sql`: RPC antiga, não chamada pela rota atual; não resolve a constraint global de reinscrição.
- `20261120_proposta_inscricao_atomica_reinscricao.sql`: proposta para reutilizar a mesma inscrição cancelada, preservar ID e data original e reativá-la como pendente, com proteção transacional de vagas.
- `20261120_proposta_partidas_resultados_ivi.sql`: proposta de relatos, confirmação, contestação, empate e auditoria administrativa; depende do schema e das permissões reais.
- `20261120_proposta_arsenal.sql`: proposta aditiva para tabela ausente no inventário.
- `20261120_proposta_times.sql`: proposta de criação do zero que aborta se encontrar `times` e `membros_time`; não aplicar no banco atual sem migração incremental.

## MySQL legado
`database/schema.sql`, `database/dados-iniciais.sql`, `src/config/db.js` e `scripts/preparar-banco.js` pertencem ao legado MySQL. Não representam o schema Supabase/PostgreSQL atual. `npm run db:preparar` é exclusivo desse legado.

## Inventário ainda necessário
Solicitar exportação schema-only e inventário read-only de:
- colunas, tipos, defaults, PKs, FKs, CHECKs, UNIQUEs e índices;
- status e dados existentes relevantes para backfill;
- policies RLS por tabela/operação;
- grants diretos e herdados para `anon`, `authenticated` e `PUBLIC`;
- owners e definições de views, funções, RPCs e triggers;
- definição e permissões da função chamada pelo trigger de cadastro.

**Não executar DDL nem alterar RLS/grants em produção** até revisar esse inventário e testar em homologação isolada.
