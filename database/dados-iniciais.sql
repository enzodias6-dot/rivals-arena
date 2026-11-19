-- Torneios que já apareciam na página 1V1 da versão anterior do projeto.
-- Inseridos por "npm run db:preparar" somente se a tabela torneios estiver vazia.
-- ATENÇÃO: as datas de início abaixo são as originais e já passaram; atualize-as no banco
-- (coluna "inicio") e o "status" ('aberto', 'em_breve' ou 'encerrado') conforme seu calendário real.

INSERT INTO torneios (nome, descricao, formato, vagas, inicio, premiacao, status) VALUES
  ('Rivals Solo Open', 'O torneio principal para jogadores que querem conquistar seu lugar na arena.', 'eliminação simples', 16, '2026-11-02', 'pontos no ranking', 'aberto'),
  ('Zombie Trials 1V1', 'Uma disputa rápida para testar habilidade, estratégia e consistência.', 'eliminação simples', 8, '2026-11-05', 'destaque no perfil', 'aberto'),
  ('Arena Night Clash', 'Uma nova chave individual será aberta quando as inscrições forem liberadas.', 'eliminação simples', 32, NULL, NULL, 'em_breve');
