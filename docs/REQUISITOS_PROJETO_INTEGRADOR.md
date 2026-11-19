# Rivals Arena — alinhamento com os requisitos do Projeto Integrador

Documento elaborado a partir do arquivo **EP 190 - RIVAL ARENA - Desenvolvimento de Sistemas** enviado pelo usuário.

## Objetivo descrito no material

Desenvolver uma plataforma web responsiva para a comunidade gamer, com campeonatos, times, ranking, perfil de jogador e interação entre usuários. A entrega acadêmica contempla Front-end, Back-end/API RESTful e Banco de Dados integrado.

## Requisitos destacados no documento

- Interface responsiva, moderna e funcional.
- Autenticação de usuários.
- API RESTful com operações CRUD para as principais entidades.
- Banco de dados modelado nos níveis conceitual, lógico e físico.
- Tabelas normalizadas, chaves primárias e estrangeiras.
- Integração entre frontend, backend e banco de dados.
- Regras de negócio, incluindo limites de participantes/times, pontuação, ranking e validação de datas.
- Código organizado em repositório Git e README de instruções.
- Documentação dos endpoints (Swagger ou equivalente).

## O que existe neste pacote

- Frontend HTML, CSS e JavaScript com central, acesso, campeonatos, ranking, perfil, arsenal e times.
- Backend Node.js + Express.
- Rotas para cadastro/login, perfil, ranking, torneios, inscrições e desafios.
- Persistência atual configurada para MySQL.
- Scripts SQL, preparação do banco, verificações e testes automatizados.

## Situação conhecida e pontos pendentes

- O código-fonte deste pacote ainda utiliza MySQL. A migração para Supabase foi escolhida como direção do projeto, mas não está implementada aqui.
- A página Times e o Arsenal ainda possuem conteúdo demonstrativo/fixo, conforme descrito no relatório técnico existente.
- Não há painel administrativo completo para CRUD de todas as entidades.
- A documentação OpenAPI/Swagger ainda precisa ser criada.
- Regras de pontuação e atualização automática de resultados precisam ser definidas pela equipe antes de serem implementadas.
- A integração real com MySQL precisa ser validada no ambiente de execução do projeto.
- O documento EP 190 - RIVALS ARENA - Jogos descreve um projeto separado de jogo temático (GDD e publicação, por exemplo); este pacote é o site/plataforma web e não inclui um jogo completo.

## Próxima etapa técnica

Antes de alterar o banco, revisar o esquema Supabase já criado e suas políticas RLS. Depois, migrar autenticação e rotas preservando os contratos usados pelo frontend. Não executar `npm run db:preparar` para preparar o Supabase: esse script é exclusivo do MySQL atual.
