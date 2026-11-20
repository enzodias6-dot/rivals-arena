# Diagrama entidade-relacionamento

O diagrama abaixo é conceitual e preliminar. As relações devem ser conferidas com as FKs, índices e constraints do schema exportado do Supabase. Não representa as tabelas propostas de resultados/empates/auditoria como objetos existentes.

Fonte editável: [der.mmd](der.mmd).

```mermaid
erDiagram
  AUTH_USERS ||--|| USUARIOS : "identidade/perfil"
  USUARIOS ||--o{ CAMPEONATOS : cria
  USUARIOS ||--o{ INSCRICOES : realiza
  CAMPEONATOS ||--o{ INSCRICOES : recebe
  CAMPEONATOS ||--o{ PARTIDAS : contem
  USUARIOS ||--o{ PARTIDAS : jogador_1
  USUARIOS ||--o{ PARTIDAS : jogador_2
  USUARIOS o|--o{ PARTIDAS : vencedor
  USUARIOS ||--o{ DESAFIOS : desafiante
  USUARIOS ||--o{ DESAFIOS : desafiado
  PARTIDAS o|--o{ DESAFIOS : vincula
  USUARIOS ||--o{ MEMBROS_TIME : participa
  TIMES ||--o{ MEMBROS_TIME : possui

  AUTH_USERS {
    uuid id PK
  }
  USUARIOS {
    uuid id PK,FK
    varchar nome
    varchar email
    varchar perfil
    integer pontos
    integer vitorias
    integer derrotas
  }
  CAMPEONATOS {
    uuid id PK
    uuid criador_id FK
    varchar nome
    varchar status
  }
  INSCRICOES {
    uuid id PK
    uuid campeonato_id FK
    uuid jogador_id FK
    varchar status
    timestamp inscrito_em
  }
  PARTIDAS {
    uuid id PK
    uuid campeonato_id FK
    uuid jogador1_id FK
    uuid jogador2_id FK
    uuid vencedor_id FK
    varchar resultado
    varchar status
  }
  DESAFIOS {
    uuid id PK
    uuid desafiante_id FK
    uuid desafiado_id FK
    uuid partida_id FK
    varchar status
  }
  TIMES {
    uuid id PK
    varchar nome
  }
  MEMBROS_TIME {
    uuid id PK
    uuid time_id FK
    uuid usuario_id FK
  }
```

**Atenção:** nomes/tipos de algumas colunas no desenho são ilustrativos e devem ser comparados com o DDL real. A relação desafio-partida depende da nulabilidade e unicidade de `desafios.partida_id`. A nulabilidade de `partidas.vencedor_id` para empate também precisa ser confirmada.
