-- Must run before 001: rules.device_id references devices.device_id.
-- PostgreSQL cannot ALTER rules.device_id to VARCHAR while FK exists and devices.device_id is INTEGER.
BEGIN;

ALTER TABLE rules DROP CONSTRAINT IF EXISTS fk_rules_device;

ALTER TABLE devices
  ALTER COLUMN device_id TYPE VARCHAR(100) USING device_id::varchar;

COMMIT;
