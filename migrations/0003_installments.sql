-- 0003_installments: planes de mensualidades (deudas a plazos con terceros)
-- Caso de uso inicial: pagos a Mamá de Roberto por Centro de lavado, Macbook, Abanicos, Refrigerador.
-- A diferencia de subscriptions, estos planes tienen un total que se liquida.

CREATE TABLE installment_plans (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  concept         TEXT NOT NULL,                       -- "Centro de lavado", "Macbook"
  creditor        TEXT NOT NULL,                       -- "Mamá de Roberto", "Apple Financing"
  total_amount    REAL NOT NULL,                       -- monto total adeudado al inicio
  monthly_amount  REAL NOT NULL,                       -- pago acordado por mes
  months_total    INTEGER NOT NULL,                    -- # de mensualidades pactadas
  start_date      TEXT,                                -- ISO YYYY-MM-DD, opcional
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','paid','cancelled')),
  notes           TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX idx_installment_plans_status ON installment_plans(status);
CREATE INDEX idx_installment_plans_creditor ON installment_plans(creditor);

CREATE TABLE installment_payments (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id         INTEGER NOT NULL REFERENCES installment_plans(id) ON DELETE CASCADE,
  date            TEXT NOT NULL,                       -- ISO YYYY-MM-DD del pago
  amount          REAL NOT NULL,                       -- monto pagado (puede no ser monthly_amount exacto)
  months_covered  INTEGER NOT NULL DEFAULT 1,          -- cuántas mensualidades cubre este pago
  account_id      INTEGER REFERENCES accounts(id),     -- de qué cuenta salió (opcional)
  movement_id     INTEGER REFERENCES movements(id),    -- movement auto-creado si se eligió cuenta
  notes           TEXT,
  created_at      INTEGER NOT NULL
);
CREATE INDEX idx_installment_payments_plan ON installment_payments(plan_id);
CREATE INDEX idx_installment_payments_date ON installment_payments(date);
