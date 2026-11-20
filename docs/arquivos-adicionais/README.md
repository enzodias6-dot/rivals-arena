# Arquivos adicionais — Rivals Arena

Esta pasta foi organizada para facilitar a consulta dos materiais de apoio do projeto. A ideia é que qualquer pessoa da equipe, professor ou avaliador consiga localizar os arquivos sem precisar conhecer toda a estrutura do código.

## Guia de instalação e utilização

- [INSTALACAO_E_USO.md](./INSTALACAO_E_USO.md) — explica, passo a passo, os requisitos, como baixar o projeto, instalar as dependências, configurar a conexão com o Supabase, iniciar o servidor e navegar pelas áreas do sistema.

## Scripts SQL

Os scripts também estão reunidos nesta pasta para facilitar o acesso:

- [schema-mysql-legado.sql](./schema-mysql-legado.sql) — criação das tabelas do banco antigo em MySQL.
- [dados-iniciais-mysql-legado.sql](./dados-iniciais-mysql-legado.sql) — inserção de torneios de exemplo no mesmo banco MySQL.

Os arquivos originais continuam disponíveis em [database/](../../database/). As cópias desta pasta foram incluídas para atender à organização dos materiais de entrega; mantenha os arquivos sincronizados caso os scripts originais sejam atualizados.

### Importante: qual banco o sistema utiliza hoje?

O Rivals Arena atualmente utiliza **Supabase com PostgreSQL** para autenticação e persistência dos dados. Os dois scripts SQL desta pasta pertencem ao **modelo legado em MySQL**. Eles não criam nem configuram o banco PostgreSQL do Supabase e não devem ser executados nele.

Até o momento, o repositório não possui um script único, completo e homologado que crie do zero toda a estrutura atual do Supabase, incluindo tabelas, relacionamentos, funções, triggers e políticas de segurança (RLS). Por isso, antes de conectar uma instalação nova, a equipe precisa conferir e preparar o projeto Supabase utilizado pela aplicação.

As migrações que contêm a palavra “proposta” são materiais em avaliação. Não devem ser executadas em um banco real sem revisão e autorização da equipe responsável.

## Modelagem do banco de dados

- [modelagem-banco.zip](../modelagem-banco.zip) — pacote com a modelagem conceitual, a modelagem lógica e o Diagrama Entidade-Relacionamento (DER), além de arquivos de diagramas em formatos SVG, PNG e Mermaid.

## Acessos do projeto

- [Site publicado](https://rivals-arena-ten.vercel.app)
- [Repositório no GitHub](https://github.com/enzodias6-dot/rivals-arena)
