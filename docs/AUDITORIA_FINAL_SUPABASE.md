# Auditoria de compatibilidade com o Supabase real

## Escopo e evidências

Esta revisão usa o inventário fornecido pela equipe. Não houve conexão com o Supabase, leitura de `.env`, execução de SQL, alteração remota, aplicação de migração, criação de usuários de teste, commit, push ou deploy. O inventário não contém o DDL completo nem ACLs por objeto; logo, conclusões além dos fatos listados abaixo são explicitamente pendências, não confirmações.

## 1. Estado atual do banco

### Confirmado pelo inventário fornecido

- Tabelas existentes: `usuarios`, `campeonatos`, `inscricoes`, `partidas`, `desafios`, `times` e `membros_time`.
- Tabelas não encontradas: `arsenal_itens` e `partida_resultados`.
- Views existentes: `vw_ranking`, `vw_ranking_publico` e `vw_perfis_publicos`.
- `partidas.resultado` é `VARCHAR`, com constraint que exige placar numérico, por exemplo `2-1`.
- Existe a constraint `UNIQUE inscricoes_campeonato_id_jogador_id_key` em `(campeonato_id, jogador_id)`.
- RLS está habilitada nas sete tabelas existentes.
- `vw_ranking_publico` usa `security_invoker=false`; `vw_perfis_publicos` usa `security_invoker=true`.
- O trigger `rivals_arena_criar_perfil_apos_cadastro` está habilitado em `auth.users`.
- Foram observados privilégios amplos para `anon`, sem detalhamento de objetos e operações.

### Ainda não fornecido

Não foram informados tipos e colunas completos, PKs/FKs, definições e validação das constraints, índices independentes, valores atuais de status, policies RLS, grants efetivos/herdados, owners, funções/RPCs existentes, corpo/owner/grants da função do trigger, nem definição/colunas/ACLs das views. O inventário tampouco confirma o tipo de `usuarios.id`, exigido por algumas propostas.

`database/schema.sql` é MySQL legado e não deve ser usado para preencher essas lacunas do schema PostgreSQL.

## 2. Compatibilidade de cada migração

Os rótulos abaixo medem compatibilidade com as evidências disponíveis; **“COMPATÍVEL COM O SCHEMA REAL” não significa autorização para aplicar em produção**.

### `database/migrations/20261119_inscricao_atomica.sql` — **PRECISA DE CORREÇÕES**

- Cria uma RPC `SECURITY INVOKER`, mas `src/routes/torneios.js` continua usando REST; portanto a função não protege a rota atual.
- A constraint global informada impede inserir outra linha para o mesmo campeonato/jogador após cancelamento. A RPC antiga não substitui essa constraint e sua estratégia de reinscrição não é compatível com ela.
- A contagem da função `SECURITY INVOKER` também depende da visibilidade definida por RLS; não assegura contagem global se as policies limitarem as linhas visíveis.
- Não executar como solução de concorrência/reinscrição atual. A rota não chama esta RPC.

### `database/migrations/20261120_proposta_times.sql` — **BLOQUEADA POR INFORMAÇÕES**

- A migração cria `times` e `membros_time`, que já existem segundo o inventário. Seu preflight detecta esses objetos e aborta antes do DDL; não é uma migração incremental.
- `solicitacoes_time` não foi encontrada. Rotas e RPCs do módulo dependem dela e de colunas/constraints presumidas.
- A existência das duas tabelas não confirma compatibilidade das consultas atuais nem das RPCs propostas.
- Não aplicar nem remover o preflight. É necessário obter o DDL e policies reais e preparar migração incremental com preservação das linhas existentes. Capacidade de cinco e membership múltiplo continuam decisões de negócio.

### `database/migrations/20261120_proposta_arsenal.sql` — **COMPATÍVEL COM O SCHEMA REAL**

- O inventário informa que `arsenal_itens` não existe; a proposta cria essa tabela de forma aditiva, sem inserir itens fictícios ou modificar outras tabelas.
- Habilita RLS, revoga os grants da tabela nova e libera somente `SELECT` para `authenticated`, limitado a itens publicados por policy. Não há permissão de publicação pela aplicação; o processo editorial ainda precisa ser definido.
- O código da página/API só consulta conteúdo publicado e apresenta estado vazio ou erro, sem tratar dados estáticos como catálogo real.
- Compatibilidade é baseada na ausência informada da tabela e no contrato Supabase/PostgreSQL. Revisar preflight, função default de UUID e acesso RLS em homologação antes de eventual aplicação. Não foi aplicada.

### `database/migrations/20261120_proposta_inscricao_atomica_reinscricao.sql` — **BLOQUEADA POR INFORMAÇÕES**

- A proposta mantém a UNIQUE global `inscricoes_campeonato_id_jogador_id_key`; exige que ela exista no preflight e não remove constraints/índices.
- Reinscrição é UPDATE da mesma linha cancelada para pendente, preservando ID e `inscrito_em`. O trigger protege ID, campeonato, jogador e data original; redefine a data apenas na inscrição inicial, serializa por campeonato e revalida capacidade.
- Na reativação, o trigger exclui a própria inscrição da contagem de vagas e verifica novamente se o campeonato está aberto. A rota mantém uma pré-contagem para UX; a proteção definitiva está no PostgreSQL.
- A proposta ainda depende de confirmar tipos/colunas, grants, policies RLS, owners e concorrência em homologação. A UNIQUE global reduz o histórico a uma linha por par campeonato/jogador; isso é intencional para cumprir a regra aprovada de preservar a mesma inscrição.

### `database/migrations/20261120_proposta_partidas_resultados_ivi.sql` — **BLOQUEADA POR INFORMAÇÕES**

- A incompatibilidade JSONB foi corrigida: o preflight exige `partidas.resultado` textual; funções recebem placar como texto, por exemplo `2-1`, e não alteram nem substituem a constraint real. O placar é interpretado na ordem `jogador_1_id-jogador_2_id`; empate é aceito somente com `vencedor_id = null` e relatos/confirmação compatíveis dos dois jogadores.
- `partidas.resultado` é a única fonte canônica do resultado confirmado e do histórico legado. `partida_resultados` é armazenamento transitório de relatos/contestações; a linha é removida ao confirmar. `partida_resultado_eventos` mantém idempotência e auditoria. Empates confirmados também geram duas linhas em `partida_empates`; o perfil conta esses registros sem presumir que `usuarios.empates` exista. Nenhum ponto é concedido por empate até aprovação de regra.
- As funções propostas validam `auth.uid()`, participação e coerência entre placar e vencedor, usam `SECURITY DEFINER` com `search_path = ''` e concedem `EXECUTE` a `authenticated`. Confirmação requer o adversário; chamadas repetidas com a mesma chave são idempotentes; divergência fica pendente e não atualiza estatísticas.
- Um administrador, verificado diretamente por `usuarios.perfil = 'admin'` na RPC, pode escolher um dos relatos ou um terceiro resultado. A justificativa é obrigatória e o evento de auditoria registra o ator, o resultado escolhido e a justificativa.
- O preflight exige outros campos/tipos de `partidas`, `usuarios` e `campeonatos` não documentados no inventário. Também bloqueia CHECK existente sobre `partidas.status`, mas o mapeamento de status, limite de caracteres do `VARCHAR`, constraint de placar e dados legados precisam ser conferidos. A proposta faz backfill de `status`; revisar seu efeito sobre partidas históricas antes de aprovação.
- A migração cria staging, eventos, estrutura de empates, estruturas IVI vazias e índices; não cria partidas, não altera `pontos` e não ativa IVI. RLS nas tabelas novas não substitui as policies necessárias de leitura em `partidas`, `campeonatos`, `usuarios` e views. O owner efetivo das funções `SECURITY DEFINER` não foi fornecido.
- A proposta revoga UPDATE de tabela em `usuarios` para `PUBLIC`, `anon` e `authenticated`, concedendo a `authenticated` somente UPDATE da coluna `nome`. A verificação de admin ocorre dentro da RPC. Ainda é necessário auditar grants efetivos, policies RLS, owners e escritores externos antes de aplicar.
- Não aplicar até conferir as estruturas/ACLs faltantes e testar em homologação. O IVI permanece desligado.

## 3. Problemas encontrados

1. **Resultado:** a implementação anterior enviava objeto JSON e a proposta anterior exigia JSONB, incompatíveis com o `VARCHAR` confirmado. O código e a migração foram ajustados para placar textual e para manter o campo existente como resultado canônico.
2. **Reinscrição:** a constraint global confirmada bloqueia reinscrição após cancelamento. A migração agora identifica precisamente o objeto nomeado, verifica unicidade exata, dependências e índices; continua bloqueada até validar o catálogo/dados.
3. **Times:** as tabelas já existem, mas a migração as criaria novamente e a tabela de solicitações não foi encontrada. A migração atual aborta no preflight; o módulo não pode ser declarado integrado.
4. **Arsenal:** falta a tabela no banco; a migração proposta não contém conteúdo. O catálogo permanece vazio até criação/revisão da tabela e publicação de conteúdo real.
5. **Permissões:** “grants amplos para `anon`” não identifica objetos nem privilégios. Não é seguro gerar REVOKEs globais, remover `PUBLIC` ou alterar grants herdados sem inventário por objeto.
6. **Views:** `vw_ranking_publico` executa como owner (`security_invoker=false`), podendo não aplicar RLS da tabela subjacente como uma view invoker. Sem definição, owner, colunas e grants não é possível determinar exposição; `vw_perfis_publicos` é invoker e depende das permissões/RLS do chamador.
7. **Cadastro:** o trigger foi informado como habilitado, mas o corpo de `criar_perfil_rivals_arena`, owner, grants e colunas de `usuarios` não estão disponíveis no repositório/inventário resumido. Não alterar o trigger.
8. **Integração de código:** rotas novas chamam RPCs e tabelas propostos que não foram confirmados como existentes. Inscrições continuam REST e não chamam a RPC antiga. Arsenal depende da tabela ausente. As consultas de Times usam colunas e `solicitacoes_time` não confirmadas.

## 4. Correções feitas e necessárias

### Corrigido no repositório

- Rotas, domínio, interface e testes de partidas aceitam placar textual numérico em vez de exigir objeto/JSONB.
- Resultado final e histórico são lidos de `partidas.resultado`; a tabela proposta `partida_resultados` guarda somente estado pendente e não conserva um segundo resultado final.
- A proposta de reinscrição opera somente sobre a constraint nomeada e exata, interrompendo em estruturas adicionais inesperadas.
- README, plano e esta auditoria distinguem fatos do inventário de contratos ainda não confirmados.

### Ainda necessário antes de homologar

- Obter inventário completo de colunas/tipos, PK/FK, constraints e índices das sete tabelas, em especial `usuarios`, `inscricoes`, `partidas`, `times` e `membros_time`.
- Obter definição/owner/grants das três views, funções existentes, políticas RLS por operação e ACLs diretas e herdadas para `anon`, `authenticated` e `PUBLIC`.
- Obter definição e privilégios da função associada ao trigger de cadastro.
- Definir o processo de publicação do Arsenal e quem poderá publicar; não conceder escrita ao cliente sem decisão.
- A regra funcional de empates e resolução administrativa foi aprovada e está refletida na proposta. Permanecem pendentes a homologação do limite/formato do placar, estados de partidas, políticas/grants reais e qualquer regra de pontos para empate. IVI continua sem ativação até aprovação de fórmula.

## 5. Riscos

- Migração de resultados pode falhar ou reclassificar status históricos; a transação e o preflight evitam prosseguir em vários desvios, mas não substituem a revisão de dados.
- A constraint de inscrição só pode virar índice parcial sem bloquear reinscrições se não houver outros objetos únicos equivalentes/dependências e se os status reais corresponderem.
- Contagem de vagas da rota é vulnerável a concorrência e a visibilidade parcial por RLS até o trigger proposto ser revisado, aprovado e testado no PostgreSQL real.
- `SECURITY DEFINER` exige owner confiável e permissões mínimas; `search_path` vazio e `auth.uid()` são salvaguardas estáticas, não prova do owner ou da RLS efetiva.
- Grants amplos para `anon` e view de ranking com `security_invoker=false` podem expor ou permitir operações além do previsto. O inventário exato é pré-requisito para correção.
- Não há API de jogo-servidor, credencial de integração, fluxo de resolução administrativa nem atualização de IVI efetivamente habilitados.

## 6. Dependências de RLS, grants e funções

- As sete tabelas existentes têm RLS habilitada, mas policies específicas e grants não foram fornecidos. RLS habilitada, isoladamente, não autoriza nem nega operação.
- Rotas autenticadas criam o cliente Supabase com a sessão do usuário. Não usam `service_role` para contornar policies.
- A view `vw_perfis_publicos` com `security_invoker=true` requer SELECT permitido ao usuário nas relações subjacentes e policies compatíveis.
- A view `vw_ranking_publico` com `security_invoker=false` exige verificar proprietário, SQL/colunas projetadas, ACL e campos expostos antes de manter acesso anon.
- A migration de resultados propõe funções `SECURITY DEFINER`, `search_path=''`, validação de ator e `EXECUTE` somente para `authenticated`; ainda é necessário confirmar owner e efetividade de `auth.uid()` no PostgREST.
- A aplicação usa `anon` para `GET /api/status`, que consulta `vw_ranking_publico`; se esse acesso público for mantido, preservar somente a leitura estritamente necessária da view. Operações DML anônimas não são necessárias ao fluxo web, mas confirmar ACLs efetivas, inclusive `PUBLIC`, antes de revogar.
- Para revisar manualmente: listar ACLs efetivas de tabelas/views/funções e schema; policies por tabela/operação; `pg_get_viewdef`, owner e reloptions das views; `pg_get_functiondef`, owner e ACL da função do trigger e RPCs. Não executar comandos de alteração.

## 7. Ordem recomendada

1. Completar o inventário read-only do schema, das dependências, RLS/grants, views, funções e trigger.
2. Revisar a proposta aditiva do Arsenal e aprovar quem publica o catálogo; aplicar somente em homologação e sem dados de exemplo.
3. Validar `inscricoes_campeonato_id_jogador_id_key`, dependências, índices, status, duplicidades ativas e policies; revisar a migração de reinscrição em clone/homologação.
4. Validar a coluna `partidas.resultado`, CHECK/limites, colunas usadas, status e dados históricos; revisar grants/RLS/owner e backfill antes de homologar resultados.
5. Preparar uma migração incremental para Times usando o DDL real; não reaplicar a migração de criação do zero.
6. Manter a RPC antiga de 19/11 sem uso. Aprovar uma única estratégia para inscrições e não combinar soluções sem desenho explícito.
7. Só depois de testes funcionais, de permissões e concorrência em homologação, decidir aplicação em produção e plano de retorno. Nenhuma etapa foi executada nesta revisão.

### Rollback

- **Arsenal:** desabilitar a página/API e manter a tabela e conteúdo; não remover tabela com dados.
- **Inscrições:** pausar novos registros e avaliar duplicidade histórica antes de qualquer tentativa de recriar a constraint global. Não apagar linhas canceladas.
- **Resultados:** desabilitar endpoints novos e preservar eventos/resultados; após confirmações e atualização de estatísticas, não há rollback automático seguro. Migração/retorno devem ser transacionais e avaliados com cópia de homologação.
- **Times:** não existe migração incremental revisada; manter tabelas existentes intactas.

## 8. Testes necessários após aprovação e aplicação em homologação

- Executar `npm test`, sintaxe JavaScript, verificação de HTML/links/IDs e `git diff --check HEAD`.
- Com usuários reais de teste no projeto isolado de homologação, testar Auth/trigger, perfil e renovação de sessão.
- Testar anon, jogador próprio, outro jogador, organizador e usuário sem vínculo em cada operação RLS, view e função.
- Testar resultado com placar aceito pela constraint, vencedor coerente com a ordem dos jogadores, formato inválido, empate relatado/confirmado por ambos, contestação divergente, resolução admin (relato A, relato B e terceiro resultado), justificativa obrigatória, bloqueio de não-admin, repetição idempotente e histórico após confirmação.
- Confirmar que tentativa de participante não autorizado, não participante, vencedor externo e edição de partida finalizada falha, sem atualizar estatísticas ou gerar duplicidade.
- Testar inscrição concorrente na última vaga; cancelamento e reinscrição preservando ambas as linhas; tentativa duplicada; status inesperado; e policies com visibilidade parcial.
- Testar queries do Arsenal sem registros publicados e após publicação autorizada.
- Validar todas as consultas de Times contra colunas reais e testar limite/locks/permissões apenas após uma migração incremental aprovada.
- Os testes locais/simulados não substituem nenhum dos testes acima nem comprovam o banco real.

## 9. Decisões pendentes da equipe

- Quais status e limites de placar são oficiais; se empate é permitido; quem resolve divergências.
- Regras de times: capacidade, um ou múltiplos times por jogador, saída/liderança e regras de visibilidade.
- Processo/role responsável por cadastrar e publicar Arsenal.
- Fórmula IVI, parâmetros, partidas elegíveis, arredondamento e momento de ativação.
- Manutenção de acesso público ao ranking e campos públicos desejados.
- Escritores externos e privilégios legítimos que dependam de grants em `usuarios`, `partidas` ou outras tabelas.
- Plano de rollback para reinscrições e resultados já confirmados.

## 10. Parecer final de prontidão

**O projeto ainda não está pronto para aplicação das migrações em produção nem para declarar integração real.** O inventário confirmou correções importantes — especialmente o `VARCHAR` de resultado, a constraint de inscrição e as tabelas de Times existentes — mas não trouxe o schema detalhado, policies, ACLs, owners, views ou corpo da função de cadastro.

**Validação local desta revisão:** `npm test` passou com 55/55 testes; `npm run check` confirmou sintaxe em 39/39 arquivos JavaScript e integridade de links/arquivos/IDs em 8 páginas HTML; `git diff --check HEAD` passou. Os testes de API usam Supabase simulado e os testes de migração inspecionam SQL estaticamente; nenhum deles executa ou comprova o banco real.

| Migração | Classificação | Motivo principal |
|---|---|---|
| `20261119_inscricao_atomica.sql` | **PRECISA DE CORREÇÕES** | Não integrada à rota; RLS pode limitar a contagem; não resolve a constraint global para reinscrição. |
| `20261120_proposta_times.sql` | **BLOQUEADA POR INFORMAÇÕES** | Tabelas-alvo já existem; schema e policies reais ausentes; falta `solicitacoes_time`. |
| `20261120_proposta_arsenal.sql` | **COMPATÍVEL COM O SCHEMA REAL** | A tabela não existe e a proposta é aditiva; aprovação editorial e homologação ainda necessárias. |
| `20261120_proposta_inscricao_atomica_reinscricao.sql` | **BLOQUEADA POR INFORMAÇÕES** | Preserva a UNIQUE global e reativa a mesma linha; faltam tipos/colunas completos, RLS/grants e homologação. |
| `20261120_proposta_partidas_resultados_ivi.sql` | **BLOQUEADA POR INFORMAÇÕES** | Empate e decisão admin propostos; faltam colunas/status/checks restantes, RLS, grants, owner e revisão do backfill. |

O que falta para iniciar integração real: receber o inventário detalhado descrito nas seções 1 e 6, preparar homologação isolada, aprovar as regras pendentes e revisar cada migração com esse catálogo. Não acessar produção nem executar as propostas antes disso.
