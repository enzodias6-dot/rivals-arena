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
- Integração da aplicação com Supabase Auth/PostgreSQL.
- Scripts SQL e preparação MySQL legados, verificações e testes automatizados.

## Situação conhecida e pontos pendentes

- O backend usa Supabase Auth e PostgREST com o token da sessão do jogador. O cadastro pressupõe o trigger existente que cria `usuarios`; a existência e as permissões devem ser confirmadas no projeto real.
- Ranking e perfil exibem valores armazenados (`pontos`, `vitorias`, `derrotas`). Foi adicionada uma calculadora Elo isolada, com parâmetros propostos (rating 1000, K=32, escala 400), mas não é uma fórmula aprovada e não atualiza banco ou ranking.
- Campeonatos, inscrições, cancelamentos e histórico permanecem integrados. Uma migração PostgreSQL prepara controle atômico de vagas e reinscrição com histórico; não foi executada. A constraint remota ainda precisa ser conferida.
- Times tem agora rotas e interface para criar/editar, solicitar/aprovar membros, sair/remover e transferir liderança. Depende de migração SQL proposta, ainda não aplicada, e das políticas/grants compatíveis. O limite de cinco e a participação em múltiplos times são decisões pendentes.
- Arsenal passou a consumir um catálogo publicado, com busca/filtro/detalhes e estado vazio sem inventar itens. A tabela proposta não foi criada e ainda depende de conteúdo real da equipe.
- A leitura histórica de partidas foi preservada. Foram preparadas APIs e UI para agendamento, relato, confirmação e contestação, com funções SQL propostas; não são funcionais contra Supabase até que a migração seja aprovada e aplicada. A criação de partidas e a resolução administrativa de divergências seguem pendentes.
- O estado atual das policies RLS, grants, constraints e definição das views não está versionado. Os testes automatizados simulam PostgREST/Auth, portanto não comprovam a integração real.
- As migrações novas são PostgreSQL propostas, distintas do schema MySQL legado. Nenhuma SQL foi executada nem banco remoto alterado.
- Permanecem pendentes painel administrativo, documentação OpenAPI/Swagger, decisão da fórmula IVI e autenticação server-to-server para a futura integração com o jogo. O jogo não está incluído neste pacote.

O inventário, as propostas de regra, detalhes de migração, fluxo de jogo, reversão e critérios de validação estão em [PLANO_FUNCIONALIDADES_PENDENTES.md](./PLANO_FUNCIONALIDADES_PENDENTES.md).

## Próxima etapa técnica

Em ambiente de homologação, confirmar DDL/constraints/RLS/grants, aprovar e revisar cada migração proposta, validar concorrência e fluxo de resultado com contas reais controladas e cadastrar dados reais de Arsenal. Configurar somente `SUPABASE_URL` e uma chave anon/publicável para o site, além das variáveis de execução exigidas pela hospedagem. O preparador `npm run db:preparar` é exclusivo do MySQL legado e não deve ser usado para criar Supabase.
