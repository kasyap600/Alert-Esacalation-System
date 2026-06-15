-- Align DB with Sequelize models: device_id must be VARCHAR for string IDs (e.g. test-device-1).
-- Safe to run after 001; re-runnable on already-string columns in most PG versions.

BEGIN;

-- devices.device_id is already VARCHAR from 000; do not ALTER here (avoids duplicate / FK issues).

ALTER TABLE alerts
  ALTER COLUMN device_id TYPE VARCHAR(100) USING device_id::varchar;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'telemetry_data'
  ) THEN
    EXECUTE 'ALTER TABLE telemetry_data ALTER COLUMN device_id TYPE VARCHAR(100) USING device_id::varchar';
  END IF;
END $$;

COMMIT;
