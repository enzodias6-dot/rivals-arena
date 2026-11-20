# Instalação e uso

## Requisitos
- Node.js 20 ou superior.
- npm.
- Projeto Supabase configurado para Auth e PostgreSQL, com schema, views, trigger e RLS compatíveis.

## Instalação
Na raiz do repositório:

```bash
npm ci
```

Se estiver configurando um ambiente novo e **não existir** um arquivo `.env`, copie o modelo:

```bash
cp .env.example .env
```

Se `.env` já existir, não execute o comando acima: preserve o arquivo e edite somente as variáveis necessárias. Nunca compartilhe nem versione esse arquivo.

Configure `SUPABASE_URL` e uma chave anon/publicável em `.env`. Não use `service_role`, chave privada ou credenciais no frontend.

## Executar
```bash
npm start
```

A aplicação inicia na porta 3000 por padrão. Acesse `http://localhost:3000`. Para desenvolvimento com reinicialização automática:

```bash
npm run dev
```

## Verificações
```bash
npm run check
npm run test:api
npm test
```

Os testes de API usam Supabase simulado. Eles verificam contratos e lógica da aplicação, mas não homologam schema, RLS, grants, triggers, locks ou RPCs no Supabase real.

## Scripts
- `npm start`: inicia `server.js`.
- `npm run dev`: inicia Node com watch.
- `npm run check`: verifica sintaxe JavaScript e integridade de links/IDs HTML.
- `npm run test:api`: executa testes automatizados da API, domínio e migrações.
- `npm test`: executa as verificações e os testes.
- `npm run db:preparar`: ferramenta legada exclusiva do MySQL; não configura o Supabase.

## Observações de segurança
- Não envie `.env`, tokens, senhas ou chaves em mensagens, issues ou commits.
- Não execute migrações propostas no Supabase de produção sem inventário, homologação e autorização explícita.
- O arquivo `.env.example` contém valores fictícios e não conecta a um projeto real.
- Para publicação na Vercel, configure as variáveis no painel da plataforma e valide cookies HTTPS, domínio e URLs de redirecionamento do Supabase Auth. Este documento não afirma que o site esteja publicado.
