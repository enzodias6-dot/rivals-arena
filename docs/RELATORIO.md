# Relatório — análise e reconstrução do Rivals Arena (v4 → v2.0.0)

Data: 06/11/2026 · Projeto de origem: `rivals-arena-v4-limpo.zip` (Node/Express 5, MySQL, HTML/CSS/JS puro).

> **Nota de versão:** as seções 1–6 abaixo são o registro histórico da versão MySQL. O estado atual após a migração para Supabase e os testes atuais estão no adendo de 19/11/2026; as verificações de MySQL, SQLite e navegador descritas acima não comprovam a integração Supabase real.

## 1. Resumo

O projeto original **não funcionava de ponta a ponta**: o login era sempre recusado, o banco não tinha estrutura versionada, a tela de acesso exibia os dois formulários ao mesmo tempo e a página 1V1 era toda demonstrativa (`alert()` e dados inventados). Foi reconstruído com estrutura organizada, banco documentado, inscrições e desafios reais, segurança reforçada e testes automatizados. A identidade visual foi mantida.

Como foi verificado: o projeto original foi executado antes da mudança (evidências abaixo); o novo foi validado com **45 testes de API**, **verificação estática de links/ids** e **59 verificações no navegador (Chromium)** em desktop, tablet (900 px) e celular (390 px). **O MySQL real não estava disponível no ambiente** (ver seção 6).

## 2. Problemas encontrados

### Críticos (impediam o funcionamento)
| # | Problema | Como foi confirmado |
|---|---|---|
| C1 | `JWT_SECRET` do `.env` tinha **3 caracteres**, mas o login exige ≥ 32 e só verificava isso *depois* de checar a senha → **todo login retornava 503**, mesmo com credenciais certas. | Leitura do código + tamanho do segredo no `.env` |
| C2 | **Não existia script SQL**: nem a tabela `usuarios` (com `pontos`, `vitorias`, `derrotas`), nem o `migracao.sql` e o "arquivo de instruções" citados nas mensagens de erro. Banco novo = cadastro, login, ranking e perfil falhando. | Busca nos arquivos |
| C3 | `acesso.html`: o CSS `.auth-form { display: grid }` anulava o atributo `hidden` → **os dois formulários apareciam juntos**; as abas não escondiam nada. | Navegador: login-form `hidden=true` com `display: grid` |

### Altos (comprometiam funcionalidades importantes)
| # | Problema |
|---|---|
| A1 | Inscrição em torneio e desafio eram só `alert()` — nada era salvo. Torneios, "ranking 1V1", contadores (24 jogadores, 18 partidas) e histórico eram **dados fixos inventados** (Nexus, Raven…), contradizendo a página de ranking real. |
| A2 | Faltava CSS de `.ticker`, `.ticker-track`, `.radar`, `.arsenal`, `.item`, `.locked`, `.rar`: faixa de alertas sem animação, arsenal sem grade, radar invisível. (confirmado: `display: block`, `animation: none`) |
| A3 | Nenhum `@font-face`: a Montserrat incluída nunca era carregada e a `LEIA-ME` da Phoenix Gaming prometia algo que o CSS não fazia. `fundo.jpg` não era usado em lugar nenhum. |
| A4 | Arquivo inexistente (`/js/x.js`, `/favicon.ico`) retornava **302 para uma página HTML** em vez de 404. (confirmado com curl) |
| A5 | Segurança: sem limite de tentativas (força bruta); tempo de resposta diferente para email existente × inexistente (enumeração de contas); sem cabeçalhos de segurança (CSP etc.); sem checagem de `Origin`; JWT sem algoritmo fixo; cookie malformado causava **erro 500**; senhas > 72 *bytes* eram truncadas em silêncio pelo bcrypt; JSON inválido devolvia HTML de erro do Express. |
| A6 | O ZIP incluía o **`.env` com a senha do banco** e `node_modules` (15 MB). |

### Médios
| # | Problema |
|---|---|
| M1 | Posição no perfil usava critério diferente do ranking (empates mostravam posições divergentes). |
| M2 | `central.html` era um arquivo com `meta refresh` servido pelo `express.static` antes da rota (rota era código morto) → salto duplo. |
| M3 | Painel "Eventos" e faixa de alertas citavam eventos fictícios ("Rivals Open", "Trials Cup", "DEMO") diferentes dos torneios da página 1V1. |
| M4 | Configuração não era validada na inicialização; `dotenv` carregado duas vezes (log duplicado). |
| M5 | Conta apagada com cookie ainda válido → perfil dava 404 sem encerrar a sessão. |
| M6 | Seleção de texto bloqueada em **todo** o site (impossível copiar conteúdo; ruim para acessibilidade). |
| M7 | Todas as páginas com o mesmo `<title>`; sem favicon nem `description`; `<main>` inconsistente; sem "pular para o conteúdo"; janela modal sem controle de foco; tabela sem `scope`. |
| M8 | Código morto/duplicado: tratador de `.card-action` (elemento inexistente), `#cta.href` redundante, `verify_paths.py` com caminho pessoal do Windows, mapeamento de erros de banco repetido 3×. |
| M9 | `app.js` monolítico (blocos por página); nomes misturando inglês/português; arquivos do backend com CRLF. |
| M10 | Rodapé "Protótipo" só na página Times. |
| M11 | Datas dos torneios (02/11 e 05/11/2026) já passadas, mas com status "Inscrições abertas". |

### Baixos
Sem `:focus-visible` e sem `prefers-reduced-motion`; botão primário/secundário desalinhados nos grupos de ações; `<img>` do logo com `alt` redundante ao lado do texto; cabeçalho apertado entre 761 e 1100 px; mensagens de erro do banco pouco úteis.

## 3. O que foi feito

- **Banco** (`database/`): `schema.sql` (usuarios, torneios, inscricoes, desafios, partidas), `dados-iniciais.sql` (os 3 torneios do HTML original) e `npm run db:preparar`, que cria o banco, adapta as chaves ao tipo de `usuarios.id` já existente, adiciona colunas que faltem e **nunca apaga dados**.
- **Backend** reorganizado em `src/` (config, middlewares, rotas por assunto, validação); `createApp` testável; erro central em JSON; servidor valida o `.env` e recusa iniciar com segredo fraco, com mensagem clara; encerramento limpo.
- **Novas rotas reais**: `GET /torneios`, `POST|DELETE /torneios/:id/inscricao` (transação com trava, sem passar do limite de vagas), `GET /resumo`, `GET /partidas`, `GET|POST /desafios`, `PATCH /desafios/:id`.
- **Segurança**: limite de tentativas (login: 10 falhas/15 min; cadastro: 10/h; desafios: 20/min, por IP), hash falso para igualar tempo de resposta, CSP e demais cabeçalhos, checagem de `Origin` (anti-CSRF além de `SameSite=Strict`), JWT fixo em HS256 com emissor, cookie malformado tolerado, senha limitada a 72 bytes, nomes sem caracteres de controle, 404 real para arquivos, `urlencoded` removido (não era usado).
- **Frontend**: `app.js` dividido em `comum.js` + um script por página; página 1V1 alimentada pela API (cards, contadores, ranking, histórico, "Meus desafios" com aceitar/recusar, cancelar inscrição); central com eventos e faixa vindos do banco; CSS faltante criado; `[hidden]` corrigido; Montserrat carregada; Phoenix Gaming opcional e automática; `fundo.jpg` usado no hero; títulos/descrições/favicon por página; menu com `aria-current`, `Esc` fecha menu/modal, foco preso no modal; página 404 no estilo do site; `prefers-reduced-motion`.
- **Removidos** (redundantes): `central.html` (a URL continua funcionando pelo servidor), `verify_paths.py` (substituído por `scripts/verificar-links.js`), `.env` e `node_modules` do pacote.
- **Preservado**: identidade visual, textos, navegação, páginas Times e Arsenal (conteúdo declaradamente ilustrativo), regras de cadastro (nome 2–80, senha 8–72, email) e sessão de 2 h.

## 4. Funcionalidades testadas

**API (45 testes, banco SQLite em memória):** validação do segredo JWT; redirecionamento de visitantes; páginas liberadas/protegidas; 404 de arquivos e páginas; cabeçalhos de segurança; cadastro (campos inválidos, duplicidade sem diferenciar maiúsculas, hash bcrypt, senha > 72 bytes, JSON quebrado); login (senha errada × email inexistente com mesma resposta, cookie `HttpOnly`/`SameSite=Strict`, email case-insensitive); tokens forjados, `alg: none`, emissor errado, expirado e cookie malformado; logout; conta apagada; bloqueio de `Origin` externo; limite de tentativas (429); ranking (ordem, empates, sem dados sensíveis) e posição do perfil igual à do ranking; torneios (lista, inscrição, duplicada, lotada, fechada, inexistente, cancelamento, resumo, histórico); desafios (validações, nome ambíguo, duplicado nos dois sentidos, só o desafiado responde, uma vez); banco fora do ar/desatualizado → 503 claro; fonte opcional.

**Navegador (59 verificações, Chromium):** só um formulário visível e troca de abas; cadastro → login automático → central; nome na central; ticker animado; eventos/ranking vindos do banco; menu e link ativo em todas as páginas; arsenal em grade; perfil; modal (abrir, `Esc`, nome preenchido); inscrição, indicação de inscrito e cancelamento; desafio (erros, envio, recebimento por outro usuário, aceitar); busca no ranking; logout e proteção pós-logout; login errado/certo; email repetido; página 404; sem rolagem horizontal em 6 páginas a 390 px e a 900 px; menu mobile; **0 erros de console** além dos 404/401/409 provocados de propósito.

**Inicialização real (`node server.js`):** sem `.env` → recusa com mensagem; `.env` original (segredo de 3 caracteres) → recusa com mensagem; segredo forte + MySQL desligado → site abre, API responde 503 claro, `Ctrl+C` encerra limpo; `db:preparar` sem MySQL → erro explicativo.

**Estáticas:** `npm run check` (sintaxe de 26+ arquivos `.js`; 8 páginas HTML sem link/arquivo/id quebrado).

## 5. Como ficou a segurança do `.env` que você enviou

O ZIP trazia `DB_PASSWORD` e `JWT_SECRET` no `.env`. **Se o arquivo foi compartilhado ou versionado, troque a senha do banco.** O novo pacote não inclui `.env`; use `.env.example`.

## 6. Não resolvido / limitações (e motivo)

1. **MySQL real não testado.** O ambiente não tem MySQL. Os testes usam SQLite com as mesmas consultas, mas **não foram executados contra MySQL**: `schema.sql`, `npm run db:preparar` (incluindo a adaptação do tipo de `usuarios.id`), `SELECT … FOR UPDATE` das inscrições e `dateStrings`. Rode `npm run db:preparar` e `npm run test:api` no seu computador e me avise se algo falhar.
2. **Datas dos torneios** (02/11 e 05/11/2026) estão no passado e foram mantidas por serem do original; defina datas e status reais no banco.
3. **Sem tela de administração / resultados automáticos:** partidas e pontuação são lançadas direto no banco; o projeto não define regras de pontos, então não inventei.
4. **Times e Arsenal** continuam com conteúdo fixo (as próprias páginas se declaram protótipo/demonstração).
5. **Nome de combatente não é único** (nunca foi): desafios por nome repetido retornam aviso de ambiguidade. Tornar único exigiria decisão sua (e limpeza de duplicados já existentes).
6. **Fonte Phoenix Gaming** não está no pacote (nem estava no original); basta colocar o arquivo em `public/fonts/`.
7. **Produção:** HTTPS/`secure` do cookie e o limitador em memória (instância única) não puderam ser testados num ambiente real de hospedagem.
8. **Dependências:** sem acesso à internet, não rodei `npm audit` nem atualizei pacotes; foram mantidas as versões do `package.json` original (instaladas no seu `node_modules`).
9. **Compatibilidade de runtime (estado original):** os testes da versão MySQL exigiam Node 22.5+ (`node:sqlite`). Após a migração, `npm test` usa o mock Supabase e não importa esse helper; o SDK Supabase está fixado em `2.109.0`, cujos pacotes declaram suporte a Node 20+. `tests/helpers/bancoSqlite.js` permanece como utilitário legado sem uso pelos comandos atuais.

## Adendo — migração para Supabase (19/11/2026)

- O backend de autenticação e as rotas de perfil, ranking, campeonatos, inscrições, partidas e desafios foram migrados para Supabase Auth/PostgreSQL. Os IDs são tratados como UUID e cada operação autenticada usa o token do próprio usuário.
- O cadastro usa `options.data.nome`; a aplicação não grava senha nem cria um segundo perfil em `usuarios`. A tela também contempla cadastro sem sessão imediata quando a confirmação de email está ativa.
- O histórico passou a exibir somente os campos existentes (`jogador_1_id`, `jogador_2_id`, `vencedor_id`, `resultado`, `fase`, entre outros). Não são mais montados placares nem `perdedor_id` inexistentes no schema Supabase.
- O arquivo `vercel.json` e `api/index.js` preparam a função Express para futura publicação. Nenhuma publicação foi feita.
- Validação local desta migração: `npm test` passou (`npm run check`: 31 arquivos JavaScript e 8 páginas HTML; `npm run test:api`: 34 testes com Supabase simulado). Os testes também cobrem email não confirmado, renovação concorrente dentro de uma instância, rate limit ao renovar sem encerrar a sessão, paginação acima do limite configurado de linhas, respostas de rate limit e rejeição de colunas de partidas não documentadas. Também foi iniciado o servidor local simulado, que respondeu com HTTP 200 para `/acesso.html` e `status: ok` para `/api/status`.
- O SDK Supabase foi fixado em `2.109.0`: versões posteriores da linha instalada exigem Node 22, incompatível com o mínimo Node 20 declarado pelo projeto. A árvore instalada foi verificada e os pacotes Supabase usados aceitam Node 20.
- **A integração real não foi testada**: nenhum valor de configuração local foi lido nem foi feita conexão com o Supabase. As policies RLS ativas, o trigger de criação de perfil e as colunas reais das views não estão versionados e não foram alterados. É necessário conferir no painel Supabase que `vw_perfis_publicos` e `vw_ranking_publico` expõem as colunas consultadas e que as policies permitem as operações necessárias.
- A contagem de inscrições depende das linhas visíveis via RLS; políticas que escondam inscrições de outros jogadores produzem contagens parciais. Além disso, sem transação ou RPC já existente, a checagem de última vaga não é atômica.
- A paginação e as contagens agora pedem contagem exata ao PostgREST para não truncar silenciosamente nos limites de linhas. Ainda refletem apenas as linhas visíveis conforme RLS, e podem variar durante alterações concorrentes.
- Na Vercel, configure `TRUST_PROXY=1`. O limitador por IP e a deduplicação de refresh token são locais a cada instância; não oferecem coordenação global entre funções serverless. O Supabase precisa estar configurado para tolerar a rotação concorrente de refresh tokens.
- Os scripts, schema e configuração MySQL legados foram mantidos; `mysql2` é usado somente pelo preparador legado. As dependências `bcrypt` e `jsonwebtoken` foram removidas por não terem uso no código atual. `npm run db:preparar` continua sendo somente para MySQL e não deve ser executado para esta migração Supabase.
- A rota de partidas solicita somente colunas documentadas, filtra jogos concluídos que envolvem o jogador autenticado e limita o histórico a 10 resultados. Na validação de 19/11, Times e Arsenal ainda eram demonstrativos; a situação foi atualizada no adendo de 20/11/2026 abaixo.
- Foi preparada uma proposta de RPC atômica para inscrições em `database/migrations/20261119_inscricao_atomica.sql`; ela não foi aplicada e a rota ainda não a utiliza. A aplicação depende de aprovação e conferência das policies RLS antes da integração.

## Adendo — módulos de Times, Arsenal e resultados (20/11/2026)

Esta etapa acrescentou páginas/APIs reais para Times e Arsenal, uma calculadora Elo proposta, uma máquina de estados de resultados, endpoints de agenda/resultado e quatro propostas de migração PostgreSQL. **Nenhum SQL foi executado e o Supabase remoto não foi acessado.** As páginas e rotas novas não devem ser consideradas integradas até as respectivas migrações serem validadas e aprovadas.

- Times: a API deriva o líder e o ator de `req.usuario`; a proposta SQL inclui RLS, funções transacionais para operações sensíveis, lock de capacidade e histórico de memberships. O limite de cinco é apenas proposta. A participação simultânea em mais de um time fica permitida no desenho atual, aguardando decisão.
- Arsenal: removeu o catálogo demonstrativo e agora apresenta somente registros publicados. A página tem busca, filtro de categoria e detalhes; sem itens publicados, mostra estado vazio.
- Elo/IVI: calculadora pura foi implementada e testada. Rating 1000, K=32 e escala 400 são valores não aprovados; nenhuma pontuação é gravada e o ranking existente permanece inalterado.
- Partidas: o histórico anterior continua. APIs novas preveem agendamento pelo criador, relato por participante, confirmação pelo adversário e estado `disputada` em caso de divergência. Migração proposta impede escrita direta relevante e grava estatísticas uma vez na confirmação; cálculo IVI continua desativado. Criação de partidas e arbitragem/resolução de divergências não foram implementadas.
- Inscrições: foi preparada uma migração separada com trigger transacional e índice parcial para inscrição ativa, preservando inscrições canceladas. A aplicação ainda faz uma pré-contagem para UX, mas a proteção real depende da migração. A RPC antiga segue sem uso.
- Integração com jogo: documentado desenho server-to-server sem credenciais Supabase no cliente do jogo; endpoint, credencial e fluxo automatizado ainda não existem.

As propostas estão em `database/migrations/20261120_proposta_times.sql`, `database/migrations/20261120_proposta_arsenal.sql`, `database/migrations/20261120_proposta_inscricao_atomica_reinscricao.sql` e `database/migrations/20261120_proposta_partidas_resultados_ivi.sql`. As dependências, grants, policies, reversão e critérios de validação estão descritos em [PLANO_FUNCIONALIDADES_PENDENTES.md](./PLANO_FUNCIONALIDADES_PENDENTES.md).

**Validação desta etapa:** `npm test` passou com 50/50 testes; a verificação de sintaxe passou em 38 arquivos JavaScript e a verificação estática confirmou links, arquivos e IDs nas 8 páginas HTML. `npm ls --depth=0`, sincronização do `package.json` com o `package-lock.json` e `git diff --check HEAD` também passaram. Os testes de API usam Supabase simulado: não comprovam policies, triggers, locks concorrentes nem o schema real. Não houve acesso ao Supabase nem execução de SQL.
