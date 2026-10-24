-- migrate:up
CREATE TABLE wallet_auto_pay_setting (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence BIGINT GENERATED ALWAYS AS IDENTITY,
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE RESTRICT,
  guardian_id UUID NOT NULL,
  enabled BOOLEAN NOT NULL,
  reference TEXT NOT NULL CHECK (char_length(btrim(reference)) BETWEEN 1 AND 80),
  created_by TEXT NOT NULL REFERENCES "user" ("id") ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, reference),
  FOREIGN KEY (organization_id, guardian_id) REFERENCES wallet (organization_id, guardian_id) ON DELETE RESTRICT
);

CREATE INDEX wallet_auto_pay_setting_latest_idx
  ON wallet_auto_pay_setting (organization_id, guardian_id, sequence DESC);

CREATE TRIGGER wallet_auto_pay_setting_append_only
  BEFORE UPDATE OR DELETE ON wallet_auto_pay_setting
  FOR EACH ROW EXECUTE FUNCTION wallet_append_only();

-- migrate:down
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM wallet_auto_pay_setting) THEN
    RAISE EXCEPTION 'auto-pay settings have been recorded, so this migration cannot be rolled back'
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

DROP TABLE wallet_auto_pay_setting;
