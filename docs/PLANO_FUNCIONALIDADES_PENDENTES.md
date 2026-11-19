# Plano de funcionalidades e integração

## Contexto confirmado

O inventário Supabase fornecido pela equipe informa as tabelas `usuarios`, `campeonatos`, `inscricoes`, `partidas`, `desafios`, `times` e `membros_time`; não encontrou `arsenal_itens` nem `partida_resultados`. Existem `vw_ranking`, `vw_ranking_publico` e `vw_perfis_publicos`. As sete tabelas existentes têm RLS habilitada.

`partidas.resultado` é `VARCHAR` com constraint de placar numérico, como `2-1`; `inscricoes_campeonato_id_jogador_id_key` é UNIQUE em `(campeonato_id, jogador_id)`. `vw_ranking_publico` tem `security_invoker=false`; `vw_perfis_publicos`, `true`. O trigger de perfil em `auth.users` está habilitado, mas seu corpo não foi fornecido. Foram citados grants amplos para `anon`, sem ACLs por objeto.

Esses fatos vieram do inventário do usuário; não houve conexão, leitura de `.env`, SQL remoto nem aplicação de migrações. O arquivo [schema.sql](../database/schema.sql) é MySQL legado e não representa o schema Supabase.

## Estado por módulo

| Módulo | Código no repositório | Estado real e próximo passo |
|---|---|---|
| Auth/perfil | Cadastro, login/logout, cookie HttpOnly, renovação de sessão, perfil e edição de nome. | Trigger existe e está habilitado segundo inventário; falta confirmar corpo, owner, grants, colunas de `usuarios` e fluxo real de Auth/RLS. |
| Ranking | Consulta `vw_ranking_publico`, paginação e desempates; ranking atual segue pontos/vitórias/derrotas. | Revisar definição, owner, colunas, grants e possível exposição por `security_invoker=false`. |
| IVI | Calculadora isolada Elo proposta em `src/domain/ivi.js`. | Não oficial, não grava rating, não atualiza pontuação nem ranking. Aprovação de regra necessária. |
| Campeonatos/inscrições | Listagem, criação, inscrição, cancelamento e histórico via REST. | A contagem REST não é atômica. Constraint global confirmada bloqueia reinscrição após cancelamento. Validar migration, dados, policies e concorrência em homologação. |
| Times | Interface, APIs e RPCs preparadas segundo um contrato proposto. | `times` e `membros_time` já existem; schema detalhado não foi fornecido. `solicitacoes_time` não foi encontrada. A migração de criação do zero não pode ser aplicada; preparar adaptação incremental depois do inventário. |
| Arsenal | Catálogo dinâmico, busca, filtro e detalhes; sem conteúdo fictício. | `arsenal_itens` não existe. Migração aditiva proposta; sem publicação até tabela e processo editorial serem aprovados. |
| Partidas/resultados | Histórico antigo lê `partidas.resultado`; novas rotas usam placar `jogador_1-jogador_2`, confirmação e contestação. | O placar textual foi alinhado ao `VARCHAR`. Staging/RPCs ainda não existem no inventário e dependem da migração bloqueada e do schema detalhado. |
| Integração com jogo | Arquitetura recomendada em servidor para servidor, independente de engine. | API, autenticação do jogo-servidor, escopos e idempotência ainda não foram implementados. |

## Migrações e dependências

### `20261119_inscricao_atomica.sql` — precisa de correções

É uma RPC antiga, `SECURITY INVOKER`, e a rota atual não a chama. A visibilidade por RLS pode limitar a contagem. A constraint UNIQUE global atual impede a reinscrição de uma linha nova após cancelamento. Não aplicar como solução definitiva.

### `20261120_proposta_inscricao_atomica_reinscricao.sql` — bloqueada por informações

A proposta valida especificamente a constraint conhecida `inscricoes_campeonato_id_jogador_id_key`, exige exatamente as duas colunas, interrompe se houver outra constraint/índice único equivalente ou FK dependente e não remove índices standalone. Troca a unicidade global por índice parcial de inscrições ativas; preserva linhas canceladas e usa trigger transacional para vagas.

Antes de qualquer aplicação, confirmar tipos/estados, dependências, índices, duplicidades ativas, RLS/grants, owner e condições reais em homologação. Recriar a unicidade global em rollback pode ser impossível depois de reinscrições, se existirem múltiplas linhas históricas do mesmo par; não apagar o histórico.

### `20261120_proposta_times.sql` — bloqueada por informações

Cria `times`, `membros_time` e `solicitacoes_time`; as duas primeiras já existem e a última não foi encontrada. O preflight atual interrompe ao encontrar os objetos existentes. Não aplicar como criação do zero. Solicitar DDL completo e policies e preparar uma migração que preserve os registros atuais. Limite de cinco pessoas e regra de múltiplos times continuam propostas.

### `20261120_proposta_arsenal.sql` — compatível com a ausência informada

Cria tabela nova com RLS e leitura de itens publicados por `authenticated`; não inclui seeds nem grants de publicação para o frontend. Definir publicador e conteúdo oficial antes de preencher. A API e o frontend não substituem o catálogo por dados estáticos.

### `20261120_proposta_partidas_resultados_ivi.sql` — bloqueada por informações

Foi alinhada ao resultado real: placar textual numérico, `partidas.resultado` continua canônico, e a proposta não exige JSONB nessa coluna. Uma tabela `partida_resultados` (nova, transitória) recebe relato/contestação; após confirmação, o staging é removido e `partidas.resultado` é atualizado. O ledger de eventos fornece idempotência/auditoria, não uma fonte alternativa do resultado final.

As funções validam ator/participantes, exigem confirmação do adversário, aceitam somente placar sem empate e em ordem `jogador_1-jogador_2`, recusam divergências por usuário e atualizam vitórias/derrotas na confirmação. Repetição usa chave idempotente. IVI não é calculado ou ativado por essas funções.

Ainda confirmar colunas/tipos de `partidas`, `usuarios`, `campeonatos`, definição exata/limites da constraint de resultado, status e dados históricos, policies/grants/owners e efeitos do backfill. As funções são `SECURITY DEFINER`, `search_path=''`, verificam `auth.uid()` e concedem execução a `authenticated`; owner e RLS efetivos continuam pendentes.

Ver classificações, ordem e riscos em [AUDITORIA_FINAL_SUPABASE.md](./AUDITORIA_FINAL_SUPABASE.md).

## Resultado e histórico

- Resultado final e histórico continuam em `partidas.resultado` (`VARCHAR`, formato exigido pelo banco).
- O placar submetido representa, nesta proposta, pontos de `jogador_1_id` e depois de `jogador_2_id`; o vencedor informado precisa corresponder ao placar.
- Não se aceita empate no fluxo proposto. Essa regra e os limites numéricos devem ser aprovados.
- Antes da confirmação há um estado transitório de relato/contestação. Só a confirmação final altera o campo canônico e as estatísticas.
- Divergência permanece pendente de resolução autorizada. Não existe papel administrativo de resolução definido.
- O IVI permanece desligado; não alterar `pontos` nem a view de ranking.

## Times

O código atual depende de nomes de colunas/RPCs do contrato de migração anterior e consulta `solicitacoes_time`, ausente no inventário. Sem os campos reais não é possível afirmar que listagem ou escrita funciona. Não criar campos presumidos nem migrar linhas existentes sem estratégia aprovada. Regras pendentes: capacidade, adesão a um ou vários times, convites versus solicitações, transferência de liderança e visibilidade dos membros.

## Arsenal

A página consome somente itens publicados e permite busca, categoria e detalhe. Enquanto a tabela estiver ausente ou sem conteúdo publicado, não há itens reais para exibir. A política proposta permite leitura autenticada; a inserção/publicação depende de procedimento editorial e permissões mínimas a serem aprovadas.

## Segurança e permissões

- RLS habilitada foi informada para as sete tabelas existentes, mas policies específicas e ACLs não foram fornecidas.
- Inspecionar privilégios diretos e herdados de `anon`, `authenticated` e `PUBLIC`; não assumir que revogar apenas para `anon` remove concessões recebidas via `PUBLIC`.
- A view `vw_ranking_publico` não é invoker. Revisar SQL, colunas, owner e grants para excluir dados privados; o endpoint público de status precisa somente verificar acesso à view.
- A view `vw_perfis_publicos` usa invoker e depende dos grants/policies das tabelas subjacentes.
- Confirmar função/owner/ACL do trigger de cadastro sem alterar o trigger.
- Não usar `service_role` no frontend ou para contornar RLS. Não executar SQL nem aplicar migrações nesta etapa.

## IVI proposto — requer aprovação

Proposta Elo isolada: rating inicial 1000, K=32, escala 400, expectativa `E_A = 1/(1+10^((R_B-R_A)/400))` e atualização `R'_A=R_A+32(S_A-E_A)`. Contra rating 1200, rating 1000 tem expectativa aproximada 0,2403: vitória ≈ +24,31; derrota ≈ −7,69. A fórmula não é oficial e o código não grava rating, movimentos, estatísticas ou ranking.

Aprovar fórmula, elegibilidade, empate, equipe, arredondamento, partidas anuladas e histórico/versionamento antes de implementar escrita. Prevenir duplicidade no banco por uma chave única por partida/jogador e transação de confirmação aprovada.

## Integração futura com o jogo

Arquitetura: cliente do jogo → servidor confiável do jogo → API Rivals Arena por HTTPS. O cliente do jogo não recebe chave Supabase nem segredo de servidor. API futura deve autenticar servidor com credencial independente, curta/rotacionável e escopos mínimos, identificar jogador/time/campeonato/partida por IDs estáveis, validar resultado contra participantes e usar idempotência. Nenhuma API ou credencial de jogo existe hoje.

## Próximas etapas

1. Obter inventário read-only detalhado de colunas/tipos, constraints, índices, FKs, funções, triggers, owners, policies e grants efetivos.
2. Conferir a função do trigger de perfil e as definições/ACLs das views.
3. Decidir regras pendentes de placar, resolução de disputas, times, publicação do Arsenal e IVI.
4. Preparar projeto isolado de homologação e revisar/aplicar migrações somente após aprovação explícita.
5. Testar Auth/RLS, views e todas as rotas com usuários de papéis distintos; concorrência real na última vaga; confirmação, contestação e idempotência com PostgreSQL real.
6. Planejar rollback sem apagar histórico. Não publicar nem declarar funcionalidades como integradas antes desses testes.

Os testes locais simulados validam lógica e contratos do código, não o banco remoto, suas policies, triggers, locks ou grants.

Na revisão de compatibilidade atual, `npm test` passou com 55/55 testes; verificou sintaxe em 39/39 arquivos JavaScript e integridade de links/arquivos/IDs em 8 páginas HTML. `git diff --check HEAD` também passou. Isso não substitui homologação com Supabase real.
