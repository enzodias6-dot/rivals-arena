# Arquivos adicionais — Rivals Arena

Esta pasta reúne os materiais de apoio para instalar, executar e entender melhor o projeto.

A ideia é deixar tudo fácil de encontrar, inclusive para quem está conhecendo o Rivals Arena agora.

## O que você encontra aqui

- [Instalação e utilização do sistema](./INSTALACAO_E_USO.md) — guia passo a passo com os requisitos, download do projeto, instalação das dependências, configuração do Supabase, execução local, uso das páginas e verificações.

## Scripts SQL disponíveis no repositório

Os scripts estão na pasta `database/`:

- [schema.sql](../../database/schema.sql) — script de criação das tabelas do modelo legado em **MySQL**.
- [dados-iniciais.sql](../../database/dados-iniciais.sql) — script de inserção de torneios de exemplo no mesmo banco MySQL.

### Atenção sobre o banco de dados atual

A aplicação atual utiliza **Supabase com PostgreSQL**. Os dois arquivos SQL acima pertencem ao modelo MySQL legado e não devem ser executados no Supabase.

O repositório ainda não possui um script único, completo e homologado para criar do zero todo o banco PostgreSQL utilizado atualmente, incluindo tabelas, relacionamentos, funções, triggers e políticas de segurança (RLS). Por isso, a configuração do Supabase deve ser conferida com a equipe antes de conectar um projeto novo.

As migrações identificadas como propostas também não devem ser executadas em um banco real sem revisão e autorização da equipe responsável.

## Acessos do projeto

- [Site publicado](https://rivals-arena-ten.vercel.app)
- [Repositório no GitHub](https://github.com/enzodias6-dot/rivals-arena)
- [Documentação de modelagem do banco](../modelagem-banco.zip)
