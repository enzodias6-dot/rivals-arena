-- Rivals Arena — estrutura do banco de dados (MySQL 5.7+ / 8.x ou MariaDB 10.4+)
--
-- Use preferencialmente "npm run db:preparar", que cria o banco informado em DB_NAME,
-- aplica este arquivo, adiciona colunas que faltem em uma tabela "usuarios" antiga
-- e insere os torneios iniciais (database/dados-iniciais.sql) se ainda não houver nenhum.
--
-- Execução manual (alternativa):
--   mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS rivals_arena CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
--   mysql -u root -p rivals_arena < database/schema.sql
--   mysql -u root -p rivals_arena < database/dados-iniciais.sql
--
-- As linhas marcadas com "fk_usuario" são ajustadas pelo script para o mesmo tipo da coluna
-- usuarios.id já existente (necessário para criar chaves estrangeiras em bancos antigos).

CREATE TABLE IF NOT EXISTS usuarios (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome VARCHAR(80) NOT NULL,
  email VARCHAR(254) NOT NULL,
  senha VARCHAR(255) NOT NULL,
  pontos INT NOT NULL DEFAULT 0,
  vitorias INT UNSIGNED NOT NULL DEFAULT 0,
  derrotas INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_usuarios_email (email),
  KEY idx_usuarios_ranking (pontos, vitorias)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS torneios (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome VARCHAR(80) NOT NULL,
  descricao VARCHAR(255) NOT NULL,
  formato VARCHAR(60) NOT NULL DEFAULT 'eliminação simples',
  vagas SMALLINT UNSIGNED NOT NULL,
  inicio DATE NULL,
  premiacao VARCHAR(120) NULL,
  status ENUM('aberto', 'em_breve', 'encerrado') NOT NULL DEFAULT 'aberto',
  PRIMARY KEY (id),
  UNIQUE KEY uq_torneios_nome (nome)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inscricoes (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  torneio_id INT UNSIGNED NOT NULL,
  usuario_id INT UNSIGNED NOT NULL, /* fk_usuario */
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_inscricoes_torneio_usuario (torneio_id, usuario_id),
  KEY idx_inscricoes_usuario (usuario_id),
  CONSTRAINT fk_inscricoes_torneio FOREIGN KEY (torneio_id) REFERENCES torneios (id) ON DELETE CASCADE,
  CONSTRAINT fk_inscricoes_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS desafios (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  desafiante_id INT UNSIGNED NOT NULL, /* fk_usuario */
  desafiado_id INT UNSIGNED NOT NULL, /* fk_usuario */
  status ENUM('pendente', 'aceito', 'recusado') NOT NULL DEFAULT 'pendente',
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  respondido_em TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_desafios_desafiante (desafiante_id),
  KEY idx_desafios_desafiado (desafiado_id),
  CONSTRAINT fk_desafios_desafiante FOREIGN KEY (desafiante_id) REFERENCES usuarios (id) ON DELETE CASCADE,
  CONSTRAINT fk_desafios_desafiado FOREIGN KEY (desafiado_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS partidas (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  torneio_id INT UNSIGNED NULL,
  vencedor_id INT UNSIGNED NOT NULL, /* fk_usuario */
  perdedor_id INT UNSIGNED NOT NULL, /* fk_usuario */
  placar_vencedor TINYINT UNSIGNED NOT NULL DEFAULT 0,
  placar_perdedor TINYINT UNSIGNED NOT NULL DEFAULT 0,
  fase VARCHAR(40) NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_partidas_vencedor (vencedor_id),
  KEY idx_partidas_perdedor (perdedor_id),
  CONSTRAINT fk_partidas_torneio FOREIGN KEY (torneio_id) REFERENCES torneios (id) ON DELETE SET NULL,
  CONSTRAINT fk_partidas_vencedor FOREIGN KEY (vencedor_id) REFERENCES usuarios (id) ON DELETE CASCADE,
  CONSTRAINT fk_partidas_perdedor FOREIGN KEY (perdedor_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
