// Schema do banco (PRD seção 9.3), com colunas extras em clientes para a
// base importada do relatório (cidade, região, última compra, ajustes).

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS campanhas (
  id              INTEGER PRIMARY KEY,
  nome            TEXT NOT NULL,
  data_inicio     TEXT NOT NULL,
  data_limite     TEXT NOT NULL,
  percentual      INTEGER NOT NULL CHECK (percentual BETWEEN 1 AND 90),
  status          TEXT NOT NULL DEFAULT 'RASCUNHO',
  motivo_pausa    TEXT
);

CREATE TABLE IF NOT EXISTS clientes (
  id                INTEGER PRIMARY KEY,
  campanha_id       INTEGER NOT NULL REFERENCES campanhas(id),
  id_externo        TEXT,
  telefone          TEXT NOT NULL,
  telefone_alt      TEXT,
  jid               TEXT,
  primeiro_nome     TEXT,
  nome_completo     TEXT NOT NULL,
  vendedora         TEXT,
  segmento          TEXT,
  versao_texto      TEXT,
  status            TEXT NOT NULL DEFAULT 'IMPORTADO',
  prioridade        INTEGER NOT NULL DEFAULT 0,
  tentativas        INTEGER NOT NULL DEFAULT 0,
  proxima_tentativa TEXT,
  enviado_em        TEXT,
  entregue_em       TEXT,
  lido_em           TEXT,
  respondido_em     TEXT,
  message_id        TEXT,
  texto_hash        TEXT,
  ultimo_erro       TEXT,
  cidade            TEXT,
  regiao            TEXT,
  ultima_compra     TEXT,
  ajustes           TEXT,
  atualizado_em     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (campanha_id, telefone)
);
CREATE INDEX IF NOT EXISTS idx_clientes_fila ON clientes (campanha_id, status, prioridade DESC, id);
CREATE INDEX IF NOT EXISTS idx_clientes_jid  ON clientes (jid);
CREATE INDEX IF NOT EXISTS idx_clientes_alt  ON clientes (telefone_alt);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hash   ON clientes (campanha_id, texto_hash) WHERE texto_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS mensagens (
  id            INTEGER PRIMARY KEY,
  cliente_id    INTEGER REFERENCES clientes(id),
  direcao       TEXT NOT NULL CHECK (direcao IN ('OUT','IN')),
  tipo          TEXT NOT NULL,
  message_id    TEXT UNIQUE,
  texto         TEXT,
  intencao      TEXT,
  http_status   INTEGER,
  latencia_ms   INTEGER,
  criado_em     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_mensagens_tempo ON mensagens (direcao, tipo, criado_em);

CREATE TABLE IF NOT EXISTS vouchers (
  codigo        TEXT PRIMARY KEY,
  campanha_id   INTEGER NOT NULL REFERENCES campanhas(id),
  cliente_id    INTEGER UNIQUE REFERENCES clientes(id),
  percentual    INTEGER NOT NULL,
  valido_ate    TEXT NOT NULL,
  enviado_em    TEXT,
  imagem_path   TEXT,
  imagem_hash   TEXT UNIQUE,
  lembrete_em   TEXT,
  usado_em      TEXT
);

CREATE TABLE IF NOT EXISTS supressao (
  telefone      TEXT PRIMARY KEY,
  motivo        TEXT NOT NULL,
  criado_em     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS eventos_processados (
  message_id    TEXT PRIMARY KEY,
  recebido_em   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inbound_desconhecido (
  id            INTEGER PRIMARY KEY,
  jid           TEXT NOT NULL,
  texto         TEXT,
  recebido_em   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contadores_diarios (
  dia           TEXT PRIMARY KEY,
  envios_ativos INTEGER NOT NULL DEFAULT 0,
  erros         INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS auditoria (
  id            INTEGER PRIMARY KEY,
  evento        TEXT NOT NULL,
  detalhe       TEXT,
  ator          TEXT NOT NULL,
  criado_em     TEXT NOT NULL DEFAULT (datetime('now'))
);
`;
