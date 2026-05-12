-- 0001_init: schema base de finanzas.sopadeletras.art
-- Convenciones:
--   - timestamps en milisegundos unix (entero)
--   - strings en lowercase
--   - ids de sesion/otp/token tipo uuid v4 generados en el Worker
--   - dinero en MXN, 2 decimales (almacenado como REAL)

-- ---------------------------------------------------------------------------
-- Auth: allowlist, OTPs, sesiones
-- ---------------------------------------------------------------------------

CREATE TABLE users (
  email          TEXT PRIMARY KEY,
  display_name   TEXT,
  created_at     INTEGER NOT NULL
);

INSERT INTO users (email, display_name, created_at) VALUES
  ('pradofox@sopadeletras.art', 'Roberto', strftime('%s','now') * 1000),
  ('balderez@sopadeletras.art', 'Lili',    strftime('%s','now') * 1000);

CREATE TABLE otp_codes (
  id           TEXT PRIMARY KEY,
  email        TEXT NOT NULL,
  code_hash    TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  consumed_at  INTEGER,
  attempts     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_otp_email ON otp_codes(email);
CREATE INDEX idx_otp_expires ON otp_codes(expires_at);

CREATE TABLE sessions (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,
  device_label  TEXT,
  last_seen_at  INTEGER NOT NULL
);
CREATE INDEX idx_sessions_email ON sessions(email);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- API tokens para Claude / agentes externos. Se guarda solo el hash.
CREATE TABLE api_tokens (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  token_hash    TEXT NOT NULL UNIQUE,
  scope         TEXT NOT NULL DEFAULT 'admin' CHECK (scope IN ('read','write','admin')),
  created_at    INTEGER NOT NULL,
  last_used_at  INTEGER,
  revoked_at    INTEGER
);
CREATE INDEX idx_api_tokens_hash ON api_tokens(token_hash);

-- ---------------------------------------------------------------------------
-- Cuentas: bancos, TDCs, efectivo
-- ---------------------------------------------------------------------------

CREATE TABLE accounts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('debit','credit','cash','wallet')),
  bank          TEXT,
  last4         TEXT,
  balance       REAL NOT NULL DEFAULT 0,   -- saldo actual; negativo = deuda en TDC
  credit_limit  REAL,                       -- solo TDC
  apr           REAL,                       -- tasa anual, solo TDC
  cut_day       INTEGER,                    -- dia del mes de corte (TDC)
  due_day       INTEGER,                    -- dia del mes de pago (TDC)
  active        INTEGER NOT NULL DEFAULT 1,
  notes         TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX idx_accounts_active ON accounts(active);

-- ---------------------------------------------------------------------------
-- Movimientos: ingresos, gastos, transferencias, pagos y cargos a TDC
-- ---------------------------------------------------------------------------

CREATE TABLE movements (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  date                    TEXT NOT NULL,                      -- ISO date YYYY-MM-DD
  account_id              INTEGER NOT NULL REFERENCES accounts(id),
  kind                    TEXT NOT NULL CHECK (kind IN ('income','expense','transfer','cc_payment','cc_charge')),
  amount                  REAL NOT NULL,                      -- siempre positivo; el signo lo determina kind
  category                TEXT,
  counterparty            TEXT,
  description             TEXT,
  notes                   TEXT,
  reconciled              INTEGER NOT NULL DEFAULT 0,
  related_receivable_id   INTEGER REFERENCES receivables(id),
  related_account_id      INTEGER REFERENCES accounts(id),    -- para transfer y cc_payment: cuenta destino/origen
  created_at              INTEGER NOT NULL
);
CREATE INDEX idx_movements_date ON movements(date);
CREATE INDEX idx_movements_account ON movements(account_id);
CREATE INDEX idx_movements_kind ON movements(kind);
CREATE INDEX idx_movements_category ON movements(category);

-- ---------------------------------------------------------------------------
-- Pipeline: cobros pendientes
-- ---------------------------------------------------------------------------

CREATE TABLE receivables (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  client          TEXT NOT NULL,
  project         TEXT,
  amount          REAL NOT NULL,
  expected_date   TEXT,                                       -- ISO date YYYY-MM-DD, NULL si no confirmado
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','partial','paid','late','cancelled')),
  paid_amount     REAL NOT NULL DEFAULT 0,
  paid_date       TEXT,
  notes           TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX idx_receivables_status ON receivables(status);
CREATE INDEX idx_receivables_expected ON receivables(expected_date);

-- ---------------------------------------------------------------------------
-- Suscripciones recurrentes
-- ---------------------------------------------------------------------------

CREATE TABLE subscriptions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  service         TEXT NOT NULL,
  amount_monthly  REAL NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'MXN',
  account_id      INTEGER REFERENCES accounts(id),
  active          INTEGER NOT NULL DEFAULT 1,
  cancelled_at    INTEGER,
  notes           TEXT,
  created_at      INTEGER NOT NULL
);
CREATE INDEX idx_subscriptions_active ON subscriptions(active);

-- ---------------------------------------------------------------------------
-- Metas (boda, depa, liquidar deuda, etc.)
-- ---------------------------------------------------------------------------

CREATE TABLE goals (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  target_amount   REAL,
  current_amount  REAL NOT NULL DEFAULT 0,
  target_date     TEXT,
  priority        INTEGER NOT NULL DEFAULT 0,
  notes           TEXT,
  achieved_at     INTEGER,
  created_at      INTEGER NOT NULL
);

-- ---------------------------------------------------------------------------
-- Reglas de asignacion (v1: solo descriptivas, las aplica el humano/Claude)
-- ---------------------------------------------------------------------------

CREATE TABLE allocation_rules (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  description  TEXT,
  rule_json    TEXT NOT NULL,
  active       INTEGER NOT NULL DEFAULT 1,
  created_at   INTEGER NOT NULL
);
