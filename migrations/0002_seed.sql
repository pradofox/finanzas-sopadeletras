-- 0002_seed: estado inicial al 2026-05-11
-- Roberto: cuentas, pipeline, suscripciones, metas y regla de asignacion.

-- Cuentas
INSERT INTO accounts (name, type, bank, last4, balance, credit_limit, apr, cut_day, due_day, active, notes, created_at, updated_at) VALUES
  ('BBVA Débito',      'debit',  'BBVA',    '9273', 617.98,     NULL,  NULL,  NULL, NULL, 1, NULL, strftime('%s','now')*1000, strftime('%s','now')*1000),
  ('BBVA Rayados',     'credit', 'BBVA',    '0770', -22593.82,  38100, 59.81, 21,   11,   1, NULL, strftime('%s','now')*1000, strftime('%s','now')*1000),
  ('Costco Banamex',   'credit', 'Banamex', '3476', -22443.48,  37000, NULL,  13,   11,   1, NULL, strftime('%s','now')*1000, strftime('%s','now')*1000),
  ('Hey Banco',        'debit',  'Hey',     NULL,   0,          NULL,  NULL,  NULL, NULL, 1, NULL, strftime('%s','now')*1000, strftime('%s','now')*1000),
  ('Efectivo Roberto', 'cash',   NULL,      NULL,   3000,       NULL,  NULL,  NULL, NULL, 1, NULL, strftime('%s','now')*1000, strftime('%s','now')*1000);

-- Pipeline (expected_date queda NULL para los que faltan confirmar)
INSERT INTO receivables (client, project, amount, expected_date, status, notes, created_at, updated_at) VALUES
  ('GIM (Héctor)',       'Pago 3 de 5',     50000, NULL, 'pending', 'IVA aparte. Pendiente confirmar fecha con Héctor.', strftime('%s','now')*1000, strftime('%s','now')*1000),
  ('GIM (Héctor)',       'Pago 4 de 5',     50000, NULL, 'pending', 'Pendiente confirmar fecha.',                         strftime('%s','now')*1000, strftime('%s','now')*1000),
  ('GIM (Héctor)',       'Pago 5 de 5',     50000, NULL, 'pending', 'Pendiente confirmar fecha.',                         strftime('%s','now')*1000, strftime('%s','now')*1000),
  ('SlowBurn (Debanhi)', 'Liquidación',     49880, NULL, 'pending', 'Sin gestionar aún - falta enviar recordatorio.',     strftime('%s','now')*1000, strftime('%s','now')*1000),
  ('miPlata',            'Mensual mayo',    20000, NULL, 'pending', 'En riesgo por atraso en entregables.',               strftime('%s','now')*1000, strftime('%s','now')*1000);

-- Suscripciones (account_id = 2 = BBVA Rayados TDC)
INSERT INTO subscriptions (service, amount_monthly, currency, account_id, active, notes, created_at) VALUES
  ('Adobe',                443.69, 'MXN', 2, 1, 'Verificar duplicado en abril ($944).',          strftime('%s','now')*1000),
  ('Apple iCloud',         179,    'MXN', 2, 1, NULL,                                            strftime('%s','now')*1000),
  ('Framer',               485,    'MXN', 2, 1, 'A CANCELAR.',                                   strftime('%s','now')*1000),
  ('Polar Framer',         103,    'MXN', 2, 1, 'A CANCELAR junto con Framer.',                  strftime('%s','now')*1000),
  ('Pampam.City',          143,    'MXN', 2, 1, 'A CANCELAR (¿qué es?).',                        strftime('%s','now')*1000),
  ('Lovable',              464,    'MXN', 2, 1, 'Bajar a plan starter $25 USD o cancelar.',      strftime('%s','now')*1000),
  ('Claude / Anthropic',   1500,   'MXN', 2, 1, 'Variable según uso.',                           strftime('%s','now')*1000),
  ('PayU Google Cloud',    226,    'MXN', 2, 1, 'A CANCELAR si no hay proyecto activo.',         strftime('%s','now')*1000),
  ('Shopify',              17,     'MXN', 2, 1, '¿Tienda activa?',                               strftime('%s','now')*1000);

-- Metas
INSERT INTO goals (name, target_amount, target_date, priority, notes, created_at) VALUES
  ('Boda 6-dic salón restante',                    160000, '2026-11-20', 1, NULL, strftime('%s','now')*1000),
  ('Boda traje + foto + video',                    60000,  '2026-11-30', 2, NULL, strftime('%s','now')*1000),
  ('Renta depa diciembre (depósito + primer mes)', 60000,  '2026-12-01', 3, NULL, strftime('%s','now')*1000),
  ('Liquidar BBVA TDC',                            22593,  '2026-06-30', 1, NULL, strftime('%s','now')*1000),
  ('Liquidar Costco Banamex',                      22443,  '2026-07-31', 2, NULL, strftime('%s','now')*1000);

-- Regla de asignacion (descriptiva, la aplica Claude/humano)
INSERT INTO allocation_rules (name, description, rule_json, created_at) VALUES
  ('Drop grande >30k',
   'Cuando entra un cobro mayor a 30k, asignar antes de tocar.',
   '{"trigger":"income_above_30k","allocations":[{"to":"reserva_fiscal","pct":15},{"to":"deuda_tdc","pct":35},{"to":"boda","pct":25},{"to":"vida","pct":20},{"to":"buffer","pct":5}]}',
   strftime('%s','now')*1000);
