# Modelo lógico preliminar

> Este modelo é uma organização lógica dos objetos informados; não substitui o DDL do Supabase. Tipos, nulabilidade, constraints, índices, FKs e regras ON DELETE precisam ser confirmados.

| Relação | Atributos conhecidos ou informados | Observações |
|---|---|---|
| `usuarios` | id, nome, email, perfil, nivel, pontos, vitorias, derrotas e datas | ID relacionado ao usuário Auth. Não presumir coluna `empates`. |
| `campeonatos` | id, nome, descrição, modalidade, formato, limite, status, criador e datas | Confirmar nomes e tipos no banco real. |
| `inscricoes` | id, campeonato_id, jogador_id, inscrito_em, status | UNIQUE global informada em campeonato/jogador. Reinscrição aprovada reutiliza a linha existente. |
| `partidas` | id, campeonato_id, jogador1/jogador2, vencedor_id, rodada/fase, status, resultado e datas | `resultado` informado como VARCHAR com constraint de placar numérico. Nulabilidade de vencedor deve ser confirmada para empates. |
| `desafios` | id, desafiante, desafiado, partida_id, data, status e resultado | Cardinalidade com partida depende de UNIQUE/FK reais. |
| `times` | id e demais atributos não inventariados integralmente | Tabela existente; schema detalhado desconhecido. |
| `membros_time` | id e vínculos time/usuário, demais atributos não inventariados integralmente | Tabela existente; schema detalhado desconhecido. |

## Supabase Auth
`auth.users` mantém a identidade e credenciais de autenticação. A tabela `usuarios` mantém o perfil da aplicação, criado por trigger informado como habilitado. Corpo, owner e grants do trigger ainda precisam de auditoria.

## Views informadas
- `vw_ranking`
- `vw_ranking_publico`
- `vw_perfis_publicos`

A view `vw_ranking_publico` foi informada com `security_invoker=false`; revisar definição, owner, campos expostos e grants. Não assumir que a view aplica RLS do chamador.

## Estruturas propostas, não existentes confirmadas
- `partida_resultados`: relatos/contestações temporários.
- `partida_empates`: registro de empate confirmado para cada participante.
- `partida_resultado_eventos`: trilha de auditoria/idempotência.

Essas relações só passam a integrar o modelo físico após migração aprovada e aplicada em homologação/produção. A coluna `usuarios.empates` não está confirmada no inventário.
