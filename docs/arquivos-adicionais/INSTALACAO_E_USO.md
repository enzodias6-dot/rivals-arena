# Instalação e utilização do Rivals Arena

Este guia foi feito para acompanhar quem está instalando o projeto pela primeira vez. Não precisa conhecer todos os detalhes do código para seguir os passos: basta fazer cada etapa com calma e conferir os avisos.

## 1. O que é necessário antes de começar

No computador, instale:

- **Node.js 20 ou superior** — ele permite executar o servidor do projeto.
- **Git** — para baixar os arquivos do GitHub. Se preferir, também é possível baixar o repositório em formato ZIP.
- **Um projeto Supabase** — é o serviço utilizado atualmente para autenticação e armazenamento dos dados.

Depois de instalar o Node.js, abra o terminal e confira se ele está funcionando:

```bash
node --version
npm --version
```

Os dois comandos devem mostrar os números das versões instaladas.

## 2. Baixar o projeto

Abra o terminal na pasta em que deseja guardar o projeto e execute:

```bash
git clone https://github.com/enzodias6-dot/rivals-arena.git
cd rivals-arena
```

Se você baixou o projeto pelo botão **Code > Download ZIP** do GitHub, primeiro extraia o arquivo e depois abra o terminal dentro da pasta extraída.

## 3. Instalar as dependências

Com o terminal aberto na pasta principal do projeto, execute:

```bash
npm install
```

Esse comando instala as bibliotecas necessárias para o funcionamento do sistema. Aguarde até o processo terminar.

## 4. Preparar a conexão com o Supabase

O Rivals Arena utiliza o Supabase para fazer o cadastro, o login e acessar os dados. Por isso, é necessário ter um projeto Supabase preparado para a aplicação.

1. Acesse [supabase.com](https://supabase.com/) e entre na sua conta.
2. Crie ou abra o projeto Supabase que será utilizado pela equipe.
3. No painel do projeto, localize as informações de conexão da API.
4. Copie a **Project URL** e a chave **anon/publicável**.
5. Na pasta principal do Rivals Arena, faça uma cópia do arquivo `.env.example` e dê o nome `.env`.

No Windows PowerShell, você pode criar essa cópia com:

```powershell
Copy-Item .env.example .env
```

No macOS, Linux ou Git Bash, use:

```bash
cp .env.example .env
```

Abra o arquivo `.env` em um editor de texto e substitua os valores de exemplo:

```env
NODE_ENV=development
PORT=3000
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_ANON_KEY=sua-chave-publica
```

Use os valores reais do seu próprio projeto. Se preferir, a variável `SUPABASE_PUBLISHABLE_KEY` pode ser usada no lugar de `SUPABASE_ANON_KEY`.

**Importante:** a chave usada aqui deve ser a chave pública/anon do Supabase. Nunca coloque uma chave `service_role`, chave secreta ou senha do banco no frontend ou neste arquivo de exemplo. Também não envie o seu arquivo `.env` para o GitHub. Ele contém configurações privadas e deve permanecer somente no seu computador ou no ambiente seguro de hospedagem.

### Um cuidado importante com a estrutura do banco

O banco utilizado pela aplicação é PostgreSQL no Supabase. O repositório registra as tabelas e views esperadas, mas não contém, neste momento, um script único e homologado que crie do zero toda a estrutura Supabase, suas relações, funções, triggers, permissões e políticas RLS.

Antes de conectar um projeto Supabase novo, a equipe precisa conferir se ele já possui a estrutura necessária e se as permissões foram configuradas corretamente. Não execute migrações identificadas como propostas apenas para tentar completar essa configuração: elas ainda não foram homologadas para aplicação no banco real.

## 5. Iniciar o sistema

Depois de configurar o arquivo `.env`, volte ao terminal, confirme que está na pasta principal do projeto e execute:

```bash
npm start
```

Se estiver tudo certo, o terminal mostrará uma mensagem indicando que o Rivals Arena está disponível em:

[http://localhost:3000](http://localhost:3000)

Abra esse endereço no navegador para acessar o sistema.

Para conferir se o servidor está respondendo, você também pode abrir:

[http://localhost:3000/api/status](http://localhost:3000/api/status)

Quando quiser encerrar o servidor, volte ao terminal e pressione **Ctrl + C**.

### Durante o desenvolvimento

Se estiver programando e quiser que o servidor reinicie automaticamente quando os arquivos forem alterados, use:

```bash
npm run dev
```

## 6. Como utilizar o sistema

A navegação pode variar conforme o estado da integração e as permissões do banco. De forma geral, o caminho de utilização é:

1. **Acesso:** abra a página de login e cadastro.
2. **Cadastro:** informe os dados solicitados para criar uma conta. Se a confirmação de e-mail estiver ativada no Supabase, confira sua caixa de entrada antes de tentar entrar.
3. **Login:** entre com a conta cadastrada.
4. **Central do jogador:** depois de entrar, utilize a página inicial para acessar as áreas disponíveis.
5. **Campeonatos:** consulte as competições e as informações de inscrição que estiverem disponíveis.
6. **Ranking:** veja a classificação apresentada pelo sistema.
7. **Perfil:** consulte as informações do jogador.
8. **Times, desafios e Arsenal:** essas áreas possuem interfaces e rotas no projeto, mas algumas operações dependem da confirmação da estrutura e das permissões correspondentes no Supabase.

Nem todas as funções planejadas devem ser consideradas concluídas. Em especial, recursos avançados de partidas, confirmação e contestação de resultados, integração completa de Times e catálogo do Arsenal dependem de etapas adicionais de configuração e homologação. Se uma área apresentar aviso, lista vazia ou mensagem de indisponibilidade, isso não significa necessariamente que a instalação local falhou.

## 7. Executar as verificações do projeto

Para conferir a sintaxe dos arquivos e a integridade de links e identificadores HTML, execute:

```bash
npm run check
```

Para executar os testes automatizados:

```bash
npm test
```

Os testes de API utilizam um ambiente simulado. Eles ajudam a encontrar problemas no código, mas não substituem a validação com um projeto Supabase real, nem comprovam as políticas RLS, triggers, permissões ou relacionamentos do banco remoto.

Também existe um modo de teste da interface sem conexão com o Supabase:

```bash
node tests/helpers/servidor-teste.js 3100
```

Nesse caso, acesse [http://localhost:3100](http://localhost:3100). Os dados desse ambiente são temporários e são perdidos quando o processo é encerrado. Não confunda esse modo de demonstração com o ambiente real da aplicação.

## 8. Sobre os arquivos SQL incluídos no repositório

Na pasta `database/` estão disponíveis:

- [schema.sql](../../database/schema.sql) — cria as tabelas do modelo antigo em **MySQL**.
- [dados-iniciais.sql](../../database/dados-iniciais.sql) — adiciona alguns torneios de exemplo ao banco MySQL antigo.

Esses arquivos foram mantidos como parte do histórico técnico do projeto. **Eles não criam o banco PostgreSQL do Supabase utilizado atualmente pela aplicação.** Não execute esses scripts no Supabase: a sintaxe e o modelo são diferentes.

Se a equipe precisar reproduzir o banco legado em MySQL, deverá utilizar um servidor MySQL compatível e criar um banco separado para essa finalidade. O projeto também possui o comando `npm run db:preparar`, destinado exclusivamente à preparação desse banco MySQL legado e dependente das variáveis `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` e `DB_NAME`. Esse comando não configura o Supabase.

As datas dos torneios de exemplo no arquivo de inserção são datas antigas e devem ser atualizadas antes de qualquer demonstração que dependa de um calendário atual.

## 9. Problemas comuns

**O comando `node` ou `npm` não é reconhecido**

O Node.js provavelmente não foi instalado corretamente ou o terminal estava aberto durante a instalação. Instale o Node.js 20 ou superior, feche e abra o terminal novamente e confira as versões.

**O sistema informa que faltam dados do Supabase**

Confira se o arquivo se chama exatamente `.env`, se está na pasta principal e se contém a URL e a chave pública corretas. Não mantenha os valores de exemplo.

**A página abre, mas os dados não aparecem**

Confira se o projeto Supabase está ativo, se as tabelas e views necessárias existem e se as políticas de acesso permitem a operação. Uma instalação local correta, sozinha, não garante que o banco remoto esteja pronto.

**A porta 3000 já está em uso**

Feche o outro programa que está utilizando essa porta ou altere o valor de `PORT` no arquivo `.env`. Depois, inicie o servidor novamente.

**O cadastro pede confirmação de e-mail**

Isso pode ser uma configuração normal do Supabase. Confira a caixa de entrada e a pasta de spam e siga o link de confirmação antes de fazer login.

## 10. Links úteis

- [Site publicado do Rivals Arena](https://rivals-arena-ten.vercel.app)
- [Repositório do projeto no GitHub](https://github.com/enzodias6-dot/rivals-arena)
- [Documentação oficial do Supabase](https://supabase.com/docs)
- [Documentação oficial do Node.js](https://nodejs.org/docs)

---

Este documento descreve o procedimento de instalação e uso com base na estrutura atual do repositório. Como o projeto continua em desenvolvimento, algumas telas e operações podem mudar conforme as próximas etapas de integração e validação.
