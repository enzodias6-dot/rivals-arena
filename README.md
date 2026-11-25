# Rivals Arena

Plataforma web acadêmica de torneios 1V1, ranking e perfil de combatentes. O projeto preserva o frontend em HTML, CSS e JavaScript puro e usa Node.js + Express 5 no backend. A persistência atual da aplicação foi migrada para Supabase (Auth e PostgreSQL).

## Objetivo do sistema

O objetivo do Rivals Arena é oferecer um ambiente digital para organizar e acompanhar competições de jogos eletrônicos, centralizando informações de jogadores, campeonatos, inscrições, partidas, desafios, equipes e classificações. A plataforma busca tornar a experiência dos participantes mais organizada e facilitar o acesso às informações competitivas.

## Funcionalidades

- **Cadastro e autenticação:** criação de conta e login com Supabase Auth.
- **Central do jogador:** página inicial com acesso aos módulos da plataforma.
- **Campeonatos:** consulta e gerenciamento de competições e inscrições.
- **Inscrições:** registro e consulta do estado das inscrições dos participantes.
- **Partidas e histórico:** consulta de partidas e resultados já registrados; fluxos avançados de agenda, confirmação e contestação dependem de homologação da migração correspondente.
- **Desafios:** recursos para organizar desafios entre jogadores.
- **Ranking:** consulta da classificação com base nos pontos, vitórias e derrotas registrados.
- **Perfil:** visualização de informações do jogador e edição do nome. A exclusão de conta está temporariamente indisponível até a aprovação de uma política segura de retenção e anonimização.
- **Como Usar:** guia de navegação com instruções para cadastro, Central, 1V1, ranking, Times e Perfil.
- **Times:** consulta de equipes ativas, busca por nome/descrição e visualização dos integrantes. Criação, solicitações e gerenciamento estão temporariamente indisponíveis porque o schema atual não possui as estruturas/RPCs necessárias.

> **Estado de integração:** algumas funcionalidades avançadas ainda dependem de revisão e homologação de schema, triggers, policies RLS, grants e migrações no Supabase. Os testes automatizados utilizam simulações e não substituem testes de integração no banco real.

## Tecnologias utilizadas

| Tecnologia | Utilização |
|---|---|
| HTML5 | Estrutura das páginas |
| CSS3 | Estilização e identidade visual |
| JavaScript | Interatividade do frontend |
| Node.js | Ambiente de execução do backend |
| Express 5 | Servidor HTTP e API |
| Supabase Auth | Autenticação e gerenciamento de sessão |
| PostgreSQL (Supabase) | Persistência dos dados |
| Vercel | Hospedagem e publicação |
| Git e GitHub | Versionamento e colaboração |

## Acessos do projeto

- **Site publicado:** https://rivals-arena-ten.vercel.app
- **Repositório GitHub:** https://github.com/enzodias6-dot/rivals-arena

## Documentação para consulta e entrega

Para encontrar os materiais sem precisar procurar em várias pastas, reunimos os documentos de apoio em `docs/`:

- **Modelagem do banco de dados:** [abrir o pacote de modelagem](./docs/modelagem-banco.zip). O ZIP reúne a modelagem conceitual, a modelagem lógica e o Diagrama Entidade-Relacionamento (DER), além dos diagramas em formatos de imagem e texto.
- **Instalação e utilização:** [ler o guia passo a passo](./docs/arquivos-adicionais/INSTALACAO_E_USO.md).
- **Arquivos adicionais:** [abrir a pasta de documentação](./docs/arquivos-adicionais/), com o índice e os scripts SQL de referência.

> **Nota sobre o banco:** os scripts SQL disponibilizados no projeto são do modelo legado em MySQL. A aplicação atual utiliza Supabase com PostgreSQL. Eles estão identificados dessa forma na documentação para evitar que sejam executados no banco errado. O repositório ainda não apresenta um script único, completo e homologado para recriar do zero toda a estrutura atual do Supabase.

## Requisitos

- Node.js 20 ou superior.
- Um projeto Supabase configurado com Auth, as tabelas e views descritas na seção abaixo.

## Executar no Codespaces ou localmente

```bash
npm install
cp .env.example .env
```

Edite `.env` com as credenciais públicas do seu projeto Supabase e inicie:

```bash
npm start
# http://localhost:3000
```

Para reiniciar o servidor ao alterar arquivos:

```bash
npm run dev
```

### Variáveis de ambiente

| Variável | Uso |
|---|---|
| `SUPABASE_URL` | URL HTTPS do projeto Supabase |
| `SUPABASE_ANON_KEY` | Chave anon ou publicável do projeto |
| `SUPABASE_PUBLISHABLE_KEY` | Alternativa à variável anterior para a chave publicável |
| `NODE_ENV` | Use `production` na publicação |
| `PORT` | Porta local (padrão `3000`) |
| `TRUST_PROXY` | Número de proxies confiáveis; configure como `1` na Vercel para IPs corretos e cabeçalhos HTTPS |

Somente `SUPABASE_URL` e uma das duas variáveis de chave são necessárias para a aplicação; as demais têm padrão. O servidor aceita chaves `sb_publishable_` e chaves JWT legadas com `role=anon`, e rejeita chaves privadas ou com outro papel. Nunca use chaves privadas nem `service_role` no frontend ou nas variáveis desta aplicação. Não versione `.env`.

O arquivo `.env.example` contém apenas valores fictícios. Não use a URL/chave de exemplo para uma conexão real.

## Supabase e autenticação

- O cadastro chama `supabase.auth.signUp()` com `options.data.nome` e pressupõe que o trigger existente no Supabase crie o perfil em `usuarios`; a aplicação não insere o perfil novamente nem armazena senhas nessa tabela. O inventário informa que o trigger está habilitado, mas seu corpo, owner, grants e compatibilidade com as colunas de `usuarios` ainda precisam ser confirmados.
- Se a confirmação de email estiver habilitada, o cadastro pode não retornar uma sessão. A tela informa que o usuário deve confirmar o email e depois entrar normalmente.
- O login usa Supabase Auth. A sessão fica em cookie `HttpOnly`, `SameSite=Strict` e `Secure` em produção. O backend valida o usuário com Supabase Auth, renova a sessão usando o refresh token e cria um cliente com o token daquele usuário para respeitar RLS.
- Tokens não são guardados no `localStorage` ou `sessionStorage`. O cache opcional do navegador contém apenas dados de exibição do usuário, nunca credenciais.
- O frontend e a API usam a mesma origem; operações que alteram dados também verificam o cabeçalho `Origin`.

### Schema usado pela aplicação

O inventário fornecido pela equipe confirma as tabelas `usuarios`, `campeonatos`, `inscricoes`, `partidas`, `desafios`, `times` e `membros_time`; `arsenal_itens` e `partida_resultados` não existem nesse inventário. Também foram informadas as views `vw_ranking`, `vw_ranking_publico` e `vw_perfis_publicos`. O inventário não inclui todas as colunas, constraints, funções, policies ou grants, portanto não confirma compatibilidade integral das rotas.

O inventário confirma `partidas.resultado` como `VARCHAR` com constraint de placar numérico, por exemplo `2-1`. O histórico `GET /api/partidas` usa esse campo como fonte do resultado final. O fluxo novo foi alinhado para receber placar textual e só gravar o resultado canônico em `partidas.resultado` após confirmação; relatos pendentes e eventos dependem da migração `database/migrations/20261120_proposta_partidas_resultados_ivi.sql`, ainda não executada. O inventário não confirma as demais colunas/constraints necessárias, então agenda, relato, confirmação e contestação seguem bloqueados para integração real. A proposta não altera `pontos` nem ativa IVI.

O inventário confirma `times` com `responsavel_id`, `status` e `publico`, e `membros_time` com `usuario_id`, `funcao` e `status`. Não foi encontrada a tabela `solicitacoes_time` nem RPCs de Times. As rotas foram limitadas à consulta de equipes ativas e integrantes usando esses campos confirmados. Criação, solicitações, edição, saída e transferência de liderança permanecem desabilitadas até existir desenho incremental e permissões homologadas. A migração atual de Times é de criação do zero e interrompe se encontrar as tabelas existentes; não deve ser aplicada.

O Arsenal consulta `arsenal_itens` publicados por API e oferece busca, categoria e detalhes. A tabela não existe no inventário fornecido. `database/migrations/20261120_proposta_arsenal.sql` propõe uma tabela nova com RLS e leitura de itens publicados por usuários autenticados; a migração não foi executada e não inclui itens fictícios. A página informa quando o catálogo está vazio.

O cálculo Elo proposto é isolado e testado em `src/domain/ivi.js`, com rating inicial 1000, K=32 e escala 400. Não é fórmula aprovada nem alimenta o ranking. O ranking existente continua usando os valores armazenados de `pontos`, vitórias e derrotas.

O inventário informa RLS habilitada nas sete tabelas existentes, mas não inclui as policies nem os grants completos. `vw_ranking_publico` usa `security_invoker=false` e requer revisão da definição, owner, colunas e grants; `vw_perfis_publicos` usa `security_invoker=true`. O trigger de criação de perfil foi informado como habilitado, mas o corpo da função não está versionado neste repositório. Nenhum SQL foi executado e nenhuma policy remota foi alterada. As operações autenticadas usam o token do próprio usuário; um bloqueio RLS não é contornado.

As decisões, pressupostos, riscos e limitações técnicas também são explicados ao longo deste README e no [guia de instalação e utilização](./docs/arquivos-adicionais/INSTALACAO_E_USO.md).

A constraint informada `inscricoes_campeonato_id_jogador_id_key` impede nova linha para o mesmo jogador/campeonato mesmo após cancelamento. A rota verifica vagas antes do insert, mas isso não é atômico. A migração [20261120_proposta_inscricao_atomica_reinscricao.sql](./database/migrations/20261120_proposta_inscricao_atomica_reinscricao.sql) identifica somente essa constraint exata, bloqueia constraints/índices equivalentes adicionais e dependências FK, e a substitui por unicidade parcial de inscrições ativas. Não foi executada; colunas, estados, RLS/grants e dependências ainda precisam de homologação. A aplicação não chama a RPC antiga em [database/migrations/20261119_inscricao_atomica.sql](./database/migrations/20261119_inscricao_atomica.sql), que também não resolve a constraint global atual.

As contagens de inscrições/resumo seguem exatamente o que as policies RLS deixam o usuário ler. Se o projeto restringir essas tabelas às próprias linhas, as contagens exibidas não serão globais e a verificação de vagas também não verá todas as inscrições.

## Páginas e API

| Página | Acesso |
|---|---|
| `/acesso.html` | Login e cadastro |
| `/` ou `/index.html` | Central (usuário autenticado) |
| `/pages/campeonatos.html` | Campeonatos, desafios, agenda/resultado preparado e histórico |
| `/pages/ranking.html`, `/pages/perfil.html` | Ranking e perfil |
| `/pages/como-usar.html` | Guia de utilização da plataforma |
| `/pages/arsenal.html` | Catálogo dinâmico; vazio até publicar itens reais no banco |
| `/pages/times.html` | Consulta de equipes ativas, busca e visualização de integrantes |

Endpoints públicos: `GET /api/status`, `POST /api/usuarios`, `POST /api/login`, `POST /api/logout`.

Endpoints autenticados incluem perfil, ranking, resumo, histórico, campeonatos, inscrições, desafios, Times (`/api/times`), Arsenal (`/api/arsenal`) e solicitação de exclusão de conta (`DELETE /api/conta`, atualmente bloqueada com HTTP 503). O histórico `GET /api/partidas` permanece compatível. `/api/partidas/agenda`, envio/confirmação/contestação de resultados e agendamento dependem da migração de partidas ainda não aplicada.

Os endpoints de torneios continuam com esse nome por compatibilidade com o frontend; os dados são lidos de `campeonatos`. A criação define `status` como `aberto` e deriva `criador_id` do usuário autenticado para atender à policy RLS, sem aceitar esse identificador do navegador.

`POST /api/torneios` recebe `nome`, `descricao`, `modalidade`, `formato`, `max_participantes`, `premio`, `inicio_em` e `encerramento_em`. A modalidade aceita `1v1`, `dupla`, `equipes` ou `solo`; o formato aceita `eliminacao_simples`, `grupos` ou `pontos`. As datas são timestamps ISO 8601 com fuso horário e podem ser omitidas.

O histórico de inscrições consulta `inscricoes` usando o ID do usuário autenticado e inclui os status `pendente`, `aprovada` e `cancelada`, mantendo os IDs de inscrição e campeonato.

### Exclusão de conta

A exclusão de conta está bloqueada no Perfil e a API `DELETE /api/conta` retorna HTTP 503 sem chamar RPC, encerrar a sessão ou alterar dados. O inventário real mostrou relações `RESTRICT` e `CASCADE` que tornam a exclusão física em cascata inadequada para preservar partidas, campeonatos e inscrições. O arquivo [20261125_proposta_exclusao_conta.sql](./database/migrations/20261125_proposta_exclusao_conta.sql) contém apenas diagnóstico de leitura. Antes de reativar essa função, é necessário aprovar uma política de retenção, anonimização dos dados pessoais e tratamento de contas responsáveis por times/campeonatos.

A página de Times oferece busca, atualização e consulta de integrantes. As rotas usam os campos confirmados `times.responsavel_id` e `membros_time.usuario_id`. Criação, solicitações, edição, saída e transferência de liderança continuam indisponíveis: o banco não possui a tabela de solicitações nem as RPCs necessárias. A migração de Times existente é uma proposta de criação do zero e aborta quando encontra `times` ou `membros_time`; **não a execute no banco atual**. A próxima etapa é desenhar e homologar uma migração incremental, com policies e RPCs específicas.

## Diagnóstico de Times no Supabase

O arquivo [20261126_times_schema_readonly.sql](./database/diagnostics/20261126_times_schema_readonly.sql) coleta colunas, constraints, índices, policies RLS, grants, triggers, funções, valores de status e a definição da view de perfis. Ele usa uma transação `READ ONLY` e termina com `ROLLBACK`; não cria nem altera objetos ou dados. Execute-o no SQL Editor apenas para diagnóstico antes de habilitar criação de equipes, solicitações, aprovação, saída ou transferência de liderança.

## Testes

```bash
npm run check       # sintaxe JavaScript e integridade de links/IDs HTML
npm run test:api    # testes HTTP com cliente Supabase simulado
npm test            # executa as duas verificações
```

Os testes usam um mock em memória e cobrem autenticação, perfil/ranking, consulta de Times, Arsenal, inscrições, resultados/idempotência e regressões das rotas atuais; os testes de Elo e estados de resultado são puros. A simulação de RPC não comprova RLS, triggers, locks, constraints ou integração com Supabase real. As migrações SQL são propostas e não foram executadas.

Para testar a interface no navegador sem Supabase, inicie `node tests/helpers/servidor-teste.js 3100` e crie uma conta no próprio ambiente simulado. Os dados são temporários e desaparecem ao parar o processo.

## Publicação futura na Vercel

O `vercel.json` encaminha as rotas do Express para `api/index.js` e inclui os arquivos de `public/`. Na configuração de ambiente da Vercel, cadastre `SUPABASE_URL`, `SUPABASE_ANON_KEY` (ou `SUPABASE_PUBLISHABLE_KEY`) e `NODE_ENV=production`. Não publique chaves privadas. Também configure no Supabase os domínios de redirect/URL de email apropriados para o domínio final, sem desabilitar confirmação de email.

Configure `TRUST_PROXY=1` nas variáveis da Vercel. As variáveis atuais necessárias continuam sendo `SUPABASE_URL` e uma chave anon/publicável; as variáveis `DB_*` são somente para o preparador MySQL legado. A integração futura com o jogo deve ser jogo-servidor → API Express autenticada, nunca cliente do jogo → Supabase. Planeja-se uma credencial de servidor separada, mantida apenas em ambiente de backend, com hash armazenado, autorização de escopo restrito e chave de idempotência. Esse endpoint ainda não foi implementado; nenhum segredo de jogo é necessário hoje.

O limitador de tentativas atual é mantido em memória por instância e não fornece um limite global entre instâncias serverless; um armazenamento compartilhado seria necessário para isso. A renovação paralela também é deduplicada apenas dentro de cada instância, então confira no painel Supabase a configuração de reutilização/rotação de refresh tokens para suportar requisições simultâneas em instâncias diferentes.

Esta configuração prepara a aplicação, mas não publica o site nem valida a configuração remota. A primeira publicação ainda precisa confirmar execução da função, entrega dos arquivos estáticos, HTTPS/cookies, Site URL e allow-list de redirects do Auth, e acesso RLS.

## MySQL legado

O código de rotas e autenticação da aplicação usa Supabase. Os arquivos `database/schema.sql`, `database/dados-iniciais.sql`, `src/config/db.js` e `scripts/preparar-banco.js` são legados MySQL e foram mantidos; `mysql2` só é necessário ao preparador legado. `bcrypt` e `jsonwebtoken` não eram usados pelo código atual e foram removidos das dependências. `npm run db:preparar` é exclusivo do banco MySQL legado: **não o execute para configurar o Supabase**. Para usá-lo, configure separadamente `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` e `DB_NAME`; essas variáveis não são necessárias para a aplicação Supabase.
