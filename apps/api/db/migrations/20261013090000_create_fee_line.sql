-- migrate:up
CREATE TABLE fee_line (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE RESTRICT,
  term_id UUID NOT NULL,
  class_level_id UUID NOT NULL,
  ledger_account_id UUID NOT NULL,
  campus_id TEXT,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  amount_minor BIGINT NOT NULL CONSTRAINT fee_line_amount_positive CHECK (amount_minor > 0),
  applies_to TEXT NOT NULL DEFAULT 'all' CHECK (applies_to IN ('all', 'new', 'returning')),
  is_optional BOOLEAN NOT NULL DEFAULT FALSE,
  retired_at TIMESTAMPTZ,
  created_by TEXT REFERENCES "user" ("id") ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, organization_id),
  FOREIGN KEY (term_id, organization_id) REFERENCES term (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (class_level_id, organization_id) REFERENCES class_level (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (ledger_account_id, organization_id) REFERENCES ledger_account (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (campus_id, organization_id) REFERENCES campus (team_id, organization_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX fee_line_live_key ON fee_line (
  organization_id,
  term_id,
  class_level_id,
  ledger_account_id,
  COALESCE(campus_id, '')
) WHERE retired_at IS NULL;

CREATE INDEX fee_line_term_idx ON fee_line (organization_id, term_id, class_level_id);

CREATE INDEX fee_line_campus_idx ON fee_line (organization_id, campus_id);

CREATE INDEX fee_line_ledger_account_idx ON fee_line (organization_id, ledger_account_id);

CREATE FUNCTION fee_line_fee_income_child() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM ledger_account child
    JOIN ledger_account parent
      ON parent.id = child.parent_id AND parent.organization_id = child.organization_id
    WHERE child.id = NEW.ledger_account_id
      AND child.organization_id = NEW.organization_id
      AND parent.system_key = 'fee_income'
  ) THEN
    RAISE EXCEPTION 'a fee line needs a fee type under Fee income'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'fee_line_fee_income_child';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER fee_line_fee_income_child
  BEFORE INSERT ON fee_line
  FOR EACH ROW EXECUTE FUNCTION fee_line_fee_income_child();

-- migrate:down
DROP TRIGGER fee_line_fee_income_child ON fee_line;

DROP FUNCTION fee_line_fee_income_child();

DROP TABLE fee_line;
