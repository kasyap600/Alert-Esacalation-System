BEGIN;

ALTER TABLE rules
  ALTER COLUMN device_id TYPE VARCHAR(100) USING device_id::varchar;

CREATE UNIQUE INDEX IF NOT EXISTS uq_rules_device_metric
  ON rules (device_id, metric_name);

CREATE INDEX IF NOT EXISTS idx_rules_enabled_device
  ON rules (enabled, device_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_escalation_rule_level
  ON escalation_policies (rule_id, level);

CREATE UNIQUE INDEX IF NOT EXISTS uq_alert_escalation_alert_level
  ON alert_escalations (alert_id, level);

CREATE INDEX IF NOT EXISTS idx_alerts_status_level
  ON alerts (status, current_level);

CREATE INDEX IF NOT EXISTS idx_alerts_device_metric
  ON alerts (device_id, metric_name);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_escalation_policy_rule_id'
  ) THEN
    ALTER TABLE escalation_policies
      ADD CONSTRAINT fk_escalation_policy_rule_id
      FOREIGN KEY (rule_id) REFERENCES rules(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_alert_rule_id'
  ) THEN
    ALTER TABLE alerts
      ADD CONSTRAINT fk_alert_rule_id
      FOREIGN KEY (rule_id) REFERENCES rules(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_alert_escalation_alert_id'
  ) THEN
    ALTER TABLE alert_escalations
      ADD CONSTRAINT fk_alert_escalation_alert_id
      FOREIGN KEY (alert_id) REFERENCES alerts(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Restore rules -> devices FK after both sides are VARCHAR (000 + rules ALTER above).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_rules_device'
  ) THEN
    ALTER TABLE rules
      ADD CONSTRAINT fk_rules_device
      FOREIGN KEY (device_id) REFERENCES devices (device_id) ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;
