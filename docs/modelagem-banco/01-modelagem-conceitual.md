# Modelo conceitual

## Objetivo
Representar os principais conceitos do Rivals Arena conforme o inventário parcial informado pela equipe. As cardinalidades abaixo são conceituais e dependem da confirmação das FKs e constraints reais.

## Entidades
- **Usuário/perfil:** dados públicos e estatísticas do participante. A autenticação é mantida por Supabase Auth em `auth.users`; o perfil da aplicação fica em `usuarios`.
- **Campeonato:** competição criada por um usuário.
- **Inscrição:** vínculo entre usuário e campeonato, com status e data.
- **Partida:** confronto entre dois jogadores, opcionalmente associado a campeonato.
- **Desafio:** convite ou solicitação de confronto entre usuários, possivelmente vinculado a partida.
- **Time:** agrupamento de usuários.
- **Membro de time:** vínculo de participação de usuário em time.

## Relacionamentos conceituais
- Um usuário Auth corresponde a um perfil da aplicação.
- Um usuário pode criar vários campeonatos.
- Usuários e campeonatos se relacionam por inscrições.
- Um campeonato pode possuir várias partidas.
- Cada partida envolve dois participantes; o vencedor pode ser nulo em caso de empate, se o schema e a migração aprovados permitirem.
- Um usuário pode desafiar e receber desafios de outros usuários.
- Usuários e times se relacionam por membros de time.

## Regras funcionais aprovadas
1. Reinscrição após cancelamento atualiza a mesma linha, preservando ID e data original, e retorna o status para pendente, exigindo nova aprovação.
2. Empate precisa ser confirmado pelos dois jogadores. Quando confirmado, registra um empate para cada jogador. A pontuação ainda não foi definida.
3. Em contestação, administrador pode escolher qualquer relato ou informar um terceiro resultado. Justificativa é obrigatória e a decisão deve registrar administrador, resultado final e justificativa no histórico de auditoria.

## Fora do modelo confirmado
As estruturas `partida_resultados`, `partida_empates` e `partida_resultado_eventos` pertencem à migração proposta e não devem ser desenhadas como tabelas existentes no schema base. Da mesma forma, não presumir coluna `usuarios.empates`, unicidades ou cardinalidades sem DDL.
