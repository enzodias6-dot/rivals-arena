-- DIAGNOSTICO SOMENTE DE LEITURA — NÃO CRIA FUNÇÃO NEM EXCLUI DADOS.
-- O inventário real do Supabase mostrou FKs RESTRICT para campeonatos,
-- partidas e times, FKs CASCADE para desafios/inscricoes/membros_time,
-- e nenhuma FK de public.usuarios para auth.users.
-- Portanto, a exclusão física em cascata proposta anteriormente é incompatível
-- com o banco atual e poderia apagar histórico competitivo.
--
-- Esta consulta apenas lista as FKs que apontam para public.usuarios.
-- Não executar qualquer DELETE/ALTER/CREATE até aprovar uma política de
-- retenção/anonimização e validar todas as tabelas que armazenam dados pessoais.

SELECT
    tc.table_name AS tabela_dependente,
    kcu.column_name AS coluna_dependente,
    ccu.table_name AS tabela_referenciada,
    ccu.column_name AS coluna_referenciada,
    rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.constraint_schema = kcu.constraint_schema
JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.constraint_schema = tc.constraint_schema
JOIN information_schema.referential_constraints rc
    ON rc.constraint_name = tc.constraint_name
    AND rc.constraint_schema = tc.constraint_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND ccu.table_schema = 'public'
  AND ccu.table_name = 'usuarios'
ORDER BY tc.table_name, kcu.column_name;
