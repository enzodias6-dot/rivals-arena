# Modelagem do banco — Rivals Arena

Esta pasta documenta uma modelagem preliminar baseada no inventário Supabase fornecido pela equipe. Não é uma exportação do schema físico remoto e não confirma tipos, constraints, índices, FKs, policies ou grants.

## Documentos
- [Modelo conceitual](01-modelagem-conceitual.md)
- [Modelo lógico](02-modelagem-logica.md)
- [Diagrama entidade-relacionamento](03-der.md)
- [Fonte Mermaid do DER](der.mmd)

## Escopo conhecido
O inventário informa sete tabelas: `usuarios`, `campeonatos`, `inscricoes`, `partidas`, `desafios`, `times` e `membros_time`. Também informa as views `vw_ranking`, `vw_ranking_publico` e `vw_perfis_publicos`. Credenciais de autenticação pertencem ao Supabase Auth (`auth.users`); `usuarios` representa o perfil da aplicação.

## Limitações importantes
- O modelo base não presume a existência de `usuarios.empates`.
- As tabelas `partida_resultados`, `partida_empates` e `partida_resultado_eventos` são estruturas de migração propostas, ainda não confirmadas como existentes.
- A regra aprovada de empate exige confirmação dos dois jogadores; quando confirmada, gera um registro de empate para cada jogador. Não foi definida pontuação.
- A resolução administrativa de contestação permite escolher qualquer relato ou um terceiro resultado, com justificativa obrigatória e auditoria.
- Reinscrição reutiliza a mesma linha cancelada, preservando ID e data original.
- A view `vw_ranking_publico` foi informada com `security_invoker=false`; revisar owner, colunas e grants antes de exposição pública.

Atualizar os modelos somente após receber o DDL real do Supabase.
