# Rivals Arena

Site acadêmico de torneios 1V1: cadastro/login, central, torneios com inscrição, desafios entre jogadores, ranking, perfil, arsenal e times.
Backend em **Node.js + Express 5** com **MySQL**; frontend em HTML/CSS/JavaScript puro (sem build).

## Situação atual e alinhamento acadêmico

Este pacote corresponde ao **site/plataforma web** da Rivals Arena. Ele contém frontend, backend Express, rotas de API, scripts SQL e testes. O material de Projeto Integrador enviado também solicita responsividade, API RESTful, CRUD, regras de negócio, banco de dados integrado e documentação dos endpoints.

**Estado técnico:** o código presente nesta entrega ainda utiliza MySQL. A migração para Supabase é a próxima etapa planejada, não uma funcionalidade concluída. O documento `docs/REQUISITOS_PROJETO_INTEGRADOR.md` relaciona os requisitos acadêmicos ao estado atual e aponta o que falta. O PDF de Jogos descreve um projeto de jogo temático separado; este ZIP não afirma entregar esse jogo.

Não execute `npm run db:preparar` para configurar o Supabase: esse comando pertence ao banco MySQL atual.

## Requisitos

- **Node.js 20 ou superior** (os testes automatizados exigem Node 22.5+)
- **MySQL 5.7+ / 8.x** (ou MariaDB 10.4+) em execução

## Instalação e execução

```bash
# 1. dependências
npm install

# 2. configuração
cp .env.example .env          # no Windows: copy .env.example .env
npm run segredo               # gera um valor aleatório -> cole em JWT_SECRET no .env
# edite o .env: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME

# 3. banco de dados (cria o banco, as tabelas e os torneios iniciais; pode rodar várias vezes)
npm run db:preparar

# 4. iniciar
npm start                     # http://localhost:3000   (npm run dev reinicia ao salvar)
```

Se você já tinha um `.env` da versão anterior, pode reaproveitá-lo (os nomes das variáveis são os mesmos),
**mas troque o `JWT_SECRET`**: ele precisa ter no mínimo 32 caracteres, senão o servidor se recusa a iniciar.

### Variáveis do `.env`

| Variável | Para que serve |
|---|---|
| `PORT` | Porta do site (padrão 3000) |
| `JWT_SECRET` | Assina o cookie de login. Mínimo 32 caracteres, gere com `npm run segredo` |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Conexão MySQL (padrões: 127.0.0.1, 3306, root, vazio, rivals_arena) |
| `TRUST_PROXY` | (opcional) nº de proxies à frente do site, ex. `1`. Necessário atrás de HTTPS/proxy para o cookie `secure` e o limite por IP |

## Estrutura

```
server.js                 ponto de entrada (valida .env, conecta o banco, inicia o servidor)
src/
  app.js                  monta o Express: segurança, API, páginas protegidas, 404, erros
  config/                 env.js (variáveis e validações) · db.js (pool MySQL)
  middlewares/            auth.js · seguranca.js (cabeçalhos, anti-CSRF) · limitador.js
  routes/                 autenticacao · jogadores (perfil, ranking) · torneios · desafios
  utils/validacao.js      validação de entradas
database/
  schema.sql              tabelas (usuarios, torneios, inscricoes, desafios, partidas)
  dados-iniciais.sql      torneios iniciais (só entram se a tabela estiver vazia)
public/                   frontend (css/, js/, img/, fonts/, pages/, acesso.html, index.html, 404.html)
scripts/                  preparar-banco · gerar-segredo · verificar-sintaxe · verificar-links
tests/                    testes automatizados da API (+ banco SQLite em memória para testes)
docs/RELATORIO.md         relatório da análise e das correções
```

## Páginas e rotas

| Rota | Acesso | O que é |
|---|---|---|
| `/acesso.html` | público | Login e cadastro |
| `/` (ou `/central.html`) | logado | Central |
| `/pages/campeonatos.html` | logado | 1V1: torneios, inscrição, desafios, ranking, histórico |
| `/pages/ranking.html`, `perfil.html`, `arsenal.html`, `times.html` | logado | demais páginas |
| `/api/...` | ver abaixo | API JSON |

Visitantes sem sessão são redirecionados para `/acesso.html`. A sessão dura 2 horas (cookie `HttpOnly`, `SameSite=Strict`).

### API

Públicas: `GET /api/status` · `POST /api/usuarios` (cadastro) · `POST /api/login` · `POST /api/logout`
Exigem login: `GET /api/perfil` · `GET /api/ranking` · `GET /api/resumo` · `GET /api/partidas` ·
`GET /api/torneios` · `POST|DELETE /api/torneios/:id/inscricao` ·
`GET|POST /api/desafios` · `PATCH /api/desafios/:id` (`{"acao":"aceitar"|"recusar"}`)

## Administração (sem tela de admin nesta versão)

- **Torneios**: edite a tabela `torneios` (colunas `inicio`, `vagas`, `status` = `aberto`/`em_breve`/`encerrado`).
  ⚠️ As datas de início iniciais (02/11/2026 e 05/11/2026) são as do projeto original e já passaram: ajuste-as.
- **Resultados**: insira em `partidas` (vencedor, perdedor, placares, fase) e atualize `pontos`, `vitorias` e `derrotas` em `usuarios`.
  Essas contas ainda não são automáticas porque o projeto não define regras de pontuação.

## Testes e verificações

```bash
npm run check      # sintaxe de todos os .js + links, arquivos e ids das páginas
npm run test:api   # 45 testes de integração da API (precisa de Node 22.5+)
npm test           # os dois acima
node tests/helpers/servidor-teste.js 3100   # site completo com banco em memória, para testar no navegador sem MySQL
```

## Fonte opcional "Phoenix Gaming"

Não acompanha o projeto. Coloque `PhoenixGaming.woff2` (ou `.woff`, `.ttf`, `.otf`) em `public/fonts/` e reinicie: o servidor detecta e aplica nos títulos. Veja `public/fonts/LEIA-ME.txt`.

## Publicação (produção)

- Defina `NODE_ENV=production` e use HTTPS (o cookie só é marcado `secure` em conexões HTTPS; atrás de proxy defina `TRUST_PROXY`).
- Nunca versione o `.env` (já está no `.gitignore`).
- O limitador de tentativas é em memória: com várias instâncias, use um armazenamento compartilhado (ex.: Redis).

## Solução de problemas

| Sintoma | Causa provável |
|---|---|
| "JWT_SECRET ... muito curto" ao iniciar | Gere outro com `npm run segredo` e coloque no `.env` |
| "Banco de dados indisponível" | MySQL desligado ou `DB_*` errados (confira a porta) |
| "estrutura do banco desatualizada" | Rode `npm run db:preparar` |
| "Muitas tentativas" (429) | Limite de login/cadastro; aguarde alguns minutos |
