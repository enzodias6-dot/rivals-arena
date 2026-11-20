# Modelagem conceitual — Rivals Arena

## 1. Objetivo

Representar, em nível conceitual, as principais informações utilizadas pelo Rivals Arena: jogadores, campeonatos, inscrições, partidas, desafios e equipes.

Esta documentação considera o inventário do banco Supabase/PostgreSQL informado para o projeto. Ela não substitui a conferência do catálogo real do banco.

## 2. Entidades e responsabilidades

| Entidade | Responsabilidade |
|---|---|
| **Usuário** | Representa o jogador cadastrado na plataforma e seus dados de perfil e desempenho. |
| **Campeonato** | Armazena as informações de uma competição organizada na plataforma. |
| **Inscrição** | Registra a participação de um jogador em um campeonato e o estado dessa inscrição. |
| **Partida** | Representa uma disputa entre jogadores, podendo estar vinculada a um campeonato. |
| **Desafio** | Registra um convite de disputa enviado por um jogador a outro. |
| **Time** | Representa uma equipe criada na plataforma. |
| **Membro de time** | Registra a participação de um usuário em uma equipe. |

## 3. Relacionamentos conceituais

- Um **jogador** pode realizar várias **inscrições**; cada inscrição está associada a um jogador.
- Um **campeonato** pode receber várias **inscrições**; cada inscrição pertence a um campeonato.
- Um **campeonato** pode estar associado a várias **partidas**. A obrigatoriedade desse vínculo depende das regras da partida.
- Um **usuário** pode participar de partidas como jogador. Os campos exatos que identificam os participantes devem ser confirmados no schema PostgreSQL.
- Um **usuário** pode enviar e receber vários **desafios**.
- Um **time** pode possuir vários registros de **membros de time**, e cada registro associa um usuário a uma equipe.

Essas associações descrevem o domínio funcional do sistema. O inventário disponível confirma a existência das sete tabelas, mas não contém a definição completa das chaves estrangeiras. Portanto, as relações acima são conceituais e não devem ser interpretadas como confirmação de constraints físicas no banco.

## 4. Regras de negócio identificadas

1. O e-mail do usuário deve ser único, conforme a regra de cadastro da aplicação.
2. Uma inscrição relaciona um jogador a um campeonato.
3. O inventário informa uma restrição única em `inscricoes(campeonato_id, jogador_id)`. Essa regra atualmente impede mais de uma linha para o mesmo par, inclusive em cenários de reinscrição, até que uma migração aprovada altere a estrutura.
4. O resultado atualmente confirmado de uma partida é armazenado em `partidas.resultado`, do tipo textual (`VARCHAR`), com uma constraint de validação de placar.
5. O sistema mantém equipes e seus membros em tabelas separadas.
6. As sete tabelas existentes têm Row Level Security (RLS) habilitada. As permissões efetivas dependem das policies e grants configurados.

## 5. Escopo e limitações

O inventário confirma as tabelas `usuarios`, `campeonatos`, `inscricoes`, `partidas`, `desafios`, `times` e `membros_time`. Também confirma as views `vw_ranking`, `vw_ranking_publico` e `vw_perfis_publicos`.

Não foram fornecidos os tipos e todas as colunas, as chaves primárias e estrangeiras completas, as policies RLS nem as definições das views. Por isso, esta modelagem não inventa esses detalhes.

As tabelas `arsenal_itens` e `partida_resultados` não constavam no inventário consultado e não fazem parte do modelo confirmado. Migrações propostas para criar novas estruturas não são consideradas tabelas existentes.

## 6. Referências

- Inventário do banco Supabase documentado em [Auditoria final do Supabase](AUDITORIA_FINAL_SUPABASE.md).
- Estrutura MySQL antiga em `database/schema.sql`: arquivo legado, não representa o schema PostgreSQL atual.
