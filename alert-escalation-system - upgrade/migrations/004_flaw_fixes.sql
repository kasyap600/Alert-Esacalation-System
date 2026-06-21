-- Migration 004: flaw fixes
-- 1. Add FK from alerts.rule_id → rules.id with SET NULL on delete
--    (was previously unconstrained; existing orphaned rows keep their rule_id
--     value as NULL after the FK is applied — no data is lost)
-- 2. Change rules.min_value / rules.max_value from FLOAT to DOUBLE PRECISION
--    to match the DOUBLE type already used in alerts
-- 3. Add unique constraint on telemetry_data(device_id, timestamp)

BEGIN;

-- 1. Drop any existing unnamed FK on alerts.rule_id before adding named one
ALTER TABLE alerts
  DROP CONSTRAINT IF EXISTS alerts_rule_id_fkey;

-- Allow NULL so rows survive rule deletion (SET NULL)
ALTER TABLE alerts
  ALTER COLUMN rule_id DROP NOT NULL;

ALTER TABLE alerts
  ADD CONSTRAINT alerts_rule_id_fkey
  FOREIGN KEY (rule_id) REFERENCES rules(id)
  ON DELETE SET NULL
  DEFERRABLE INITIALLY DEFERRED;

-- 2. Widen threshold columns to double precision
ALTER TABLE rules
  ALTER COLUMN min_value TYPE DOUBLE PRECISION,
  ALTER COLUMN max_value TYPE DOUBLE PRECISION;

-- 3. Unique constraint on telemetry to prevent duplicate persistence under
--    concurrent worker reclaim races
ALTER TABLE telemetry_data
  DROP CONSTRAINT IF EXISTS telemetry_data_device_id_timestamp_key;

ALTER TABLE telemetry_data
  ADD CONSTRAINT telemetry_data_device_id_timestamp_key
  UNIQUE (device_id, timestamp);

COMMIT;
