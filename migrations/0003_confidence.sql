-- 0003_confidence: columna confidence en receivables
-- confirmed = ya esta pactado y firmado, solo falta que llegue
-- estimated  = muy probable pero sin contrato
-- speculative = oportunidad, sin confirmacion

ALTER TABLE receivables ADD COLUMN confidence TEXT NOT NULL DEFAULT 'confirmed'
  CHECK (confidence IN ('confirmed','estimated','speculative'));

-- Seed con los valores del handoff
UPDATE receivables SET confidence = 'confirmed' WHERE id IN (1, 2, 3, 4);  -- GIM x3, SlowBurn liquidacion
UPDATE receivables SET confidence = 'estimated'  WHERE id = 5;             -- miPlata mayo
