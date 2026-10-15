-- migrate:up
ALTER TABLE document_sequence DROP CONSTRAINT document_sequence_kind_check;

ALTER TABLE document_sequence
  ADD CONSTRAINT document_sequence_kind_check CHECK (
    kind IN (
      'admission',
      'invoice',
      'payment',
      'billing_run',
      'adjustment',
      'store_sale',
      'delivery',
      'stock_count'
    )
  );

CREATE TABLE ledger_account (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE CASCADE,
  code INTEGER NOT NULL CHECK (code > 0),
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  type TEXT NOT NULL CHECK (type IN ('asset', 'liability', 'equity', 'income', 'expense')),
  parent_id UUID,
  system_key TEXT,
  requires_student BOOLEAN NOT NULL DEFAULT FALSE,
  retired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, code),
  UNIQUE (organization_id, system_key),
  FOREIGN KEY (parent_id, organization_id) REFERENCES ledger_account (id, organization_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX ledger_account_sibling_name_key ON ledger_account (organization_id, parent_id, lower(name)) NULLS NOT DISTINCT;

CREATE TABLE money_account (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE RESTRICT,
  ledger_account_id UUID NOT NULL,
  campus_id TEXT,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  kind TEXT NOT NULL CHECK (kind IN ('cash', 'bank', 'pos', 'gateway')),
  bank_name TEXT CHECK (char_length(btrim(bank_name)) BETWEEN 1 AND 80),
  account_last4 TEXT CHECK (account_last4 ~ '^[0-9]{4}$'),
  retired_at TIMESTAMPTZ,
  created_by TEXT REFERENCES "user" ("id") ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, organization_id),
  UNIQUE (ledger_account_id),
  FOREIGN KEY (ledger_account_id, organization_id) REFERENCES ledger_account (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (campus_id, organization_id) REFERENCES campus (team_id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT money_account_bank_name_for_bank CHECK (bank_name IS NULL OR kind = 'bank')
);

CREATE INDEX money_account_campus_idx ON money_account (organization_id, campus_id);

CREATE TABLE journal_entry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE RESTRICT,
  reference TEXT NOT NULL CHECK (char_length(btrim(reference)) > 0),
  sequence BIGINT GENERATED ALWAYS AS IDENTITY,
  kind TEXT NOT NULL CHECK (
    kind IN (
      'invoice',
      'adhoc',
      'payment',
      'payment_void',
      'adjustment',
      'opening',
      'store',
      'store_receive',
      'store_cost',
      'store_count'
    )
  ),
  source_id UUID,
  effective_on DATE NOT NULL,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  posted_by TEXT,
  memo TEXT CHECK (char_length(memo) <= 500),
  reverses_entry_id UUID,
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, reference),
  FOREIGN KEY (reverses_entry_id, organization_id) REFERENCES journal_entry (id, organization_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX journal_entry_reverses_key ON journal_entry (reverses_entry_id) WHERE reverses_entry_id IS NOT NULL;

CREATE INDEX journal_entry_effective_idx ON journal_entry (organization_id, effective_on DESC, sequence DESC);

CREATE TABLE journal_line (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE RESTRICT,
  entry_id UUID NOT NULL,
  ledger_account_id UUID NOT NULL,
  student_id UUID,
  campus_id TEXT,
  debit_minor BIGINT NOT NULL DEFAULT 0,
  credit_minor BIGINT NOT NULL DEFAULT 0,
  FOREIGN KEY (entry_id, organization_id) REFERENCES journal_entry (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (ledger_account_id, organization_id) REFERENCES ledger_account (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (student_id, organization_id) REFERENCES student (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (campus_id, organization_id) REFERENCES campus (team_id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT journal_line_one_side CHECK (
    (debit_minor > 0 AND credit_minor = 0)
    OR (credit_minor > 0 AND debit_minor = 0)
  )
);

CREATE INDEX journal_line_account_student_idx ON journal_line (organization_id, ledger_account_id, student_id);

CREATE INDEX journal_line_entry_idx ON journal_line (entry_id);

CREATE FUNCTION journal_entry_balanced() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE
  totals RECORD;
BEGIN
  SELECT count(*) AS lines,
    COALESCE(sum(debit_minor), 0) AS debits,
    COALESCE(sum(credit_minor), 0) AS credits
  INTO totals
  FROM journal_line
  WHERE entry_id = NEW.entry_id AND organization_id = NEW.organization_id;
  IF totals.lines < 2 OR totals.debits <> totals.credits THEN
    RAISE EXCEPTION 'journal entry % is not balanced', NEW.entry_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'journal_entry_balanced';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER journal_entry_balanced
  AFTER INSERT ON journal_line
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION journal_entry_balanced();

CREATE FUNCTION journal_entry_not_empty() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM journal_line
    WHERE entry_id = NEW.id AND organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'journal entry % has no lines', NEW.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'journal_entry_not_empty';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER journal_entry_not_empty
  AFTER INSERT ON journal_entry
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION journal_entry_not_empty();

CREATE FUNCTION journal_append_only() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME
    USING ERRCODE = 'check_violation', CONSTRAINT = 'journal_append_only';
END;
$$;

CREATE TRIGGER journal_entry_append_only
  BEFORE UPDATE OR DELETE ON journal_entry
  FOR EACH ROW EXECUTE FUNCTION journal_append_only();

CREATE TRIGGER journal_line_append_only
  BEFORE UPDATE OR DELETE ON journal_line
  FOR EACH ROW EXECUTE FUNCTION journal_append_only();

CREATE FUNCTION journal_line_requires_student() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.student_id IS NULL AND EXISTS (
    SELECT 1 FROM ledger_account
    WHERE id = NEW.ledger_account_id
      AND organization_id = NEW.organization_id
      AND requires_student
  ) THEN
    RAISE EXCEPTION 'a line on this account needs a student'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'journal_line_requires_student';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER journal_line_requires_student
  BEFORE INSERT ON journal_line
  FOR EACH ROW EXECUTE FUNCTION journal_line_requires_student();

CREATE FUNCTION ledger_account_system_fixed() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.system_key IS NOT NULL AND (
    NEW.type IS DISTINCT FROM OLD.type
    OR NEW.parent_id IS DISTINCT FROM OLD.parent_id
    OR NEW.system_key IS DISTINCT FROM OLD.system_key
    OR NEW.retired_at IS DISTINCT FROM OLD.retired_at
  ) THEN
    RAISE EXCEPTION 'built-in account % cannot be changed', OLD.code
      USING ERRCODE = 'check_violation', CONSTRAINT = 'ledger_account_system_fixed';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ledger_account_system_fixed
  BEFORE UPDATE ON ledger_account
  FOR EACH ROW EXECUTE FUNCTION ledger_account_system_fixed();

CREATE FUNCTION seed_ledger_accounts(org TEXT) RETURNS void
  LANGUAGE sql AS $$
  INSERT INTO ledger_account (organization_id, code, name, type, system_key, requires_student)
  VALUES
    (org, 1100, 'Fees owed to the school', 'asset', 'fees_receivable', TRUE),
    (org, 1200, 'Money accounts', 'asset', 'money_accounts', FALSE),
    (org, 1300, 'Store stock (books and uniforms)', 'asset', 'store_stock', FALSE),
    (org, 2100, 'Refunds owed to families', 'liability', 'customer_credit_refunds', FALSE),
    (org, 3000, 'Opening balance', 'equity', 'opening_balance_equity', FALSE),
    (org, 4000, 'Fee income', 'income', 'fee_income', FALSE),
    (org, 4500, 'Store sales', 'income', 'store_sales', FALSE),
    (org, 5000, 'Discounts given', 'expense', 'discounts_given', FALSE),
    (org, 5100, 'Bad debt', 'expense', 'bad_debt', FALSE),
    (org, 5200, 'Cost of store items sold', 'expense', 'store_cost', FALSE),
    (org, 5300, 'Store stock losses', 'expense', 'store_losses', FALSE)
  ON CONFLICT DO NOTHING;

  INSERT INTO ledger_account (organization_id, code, name, type, parent_id, system_key)
  SELECT org, fee.code, fee.name, 'income', parent.id, fee.system_key
  FROM (
    VALUES
      (4010, 'Tuition', NULL),
      (4020, 'PTA fee', NULL),
      (4030, 'School bus', NULL),
      (4040, 'Development levy', NULL),
      (4050, 'Laboratory fee', NULL),
      (4060, 'Other charges', 'other_charges'),
      (4070, 'Excursion levy', NULL),
      (4080, 'Graduation fee', NULL)
  ) AS fee (code, name, system_key)
  JOIN ledger_account parent
    ON parent.organization_id = org AND parent.system_key = 'fee_income'
  ON CONFLICT DO NOTHING;
$$;

SELECT seed_ledger_accounts("id") FROM "organization";

-- migrate:down
DROP TRIGGER journal_line_requires_student ON journal_line;

DROP TRIGGER journal_line_append_only ON journal_line;

DROP TRIGGER journal_entry_append_only ON journal_entry;

DROP TRIGGER journal_entry_balanced ON journal_line;

DROP TRIGGER journal_entry_not_empty ON journal_entry;

DROP TRIGGER ledger_account_system_fixed ON ledger_account;

DROP TABLE journal_line;

DROP TABLE journal_entry;

DROP TABLE money_account;

DROP TABLE ledger_account;

DROP FUNCTION seed_ledger_accounts(TEXT);

DROP FUNCTION ledger_account_system_fixed();

DROP FUNCTION journal_line_requires_student();

DROP FUNCTION journal_append_only();

DROP FUNCTION journal_entry_not_empty();

DROP FUNCTION journal_entry_balanced();

DELETE FROM document_sequence WHERE kind <> 'admission';

ALTER TABLE document_sequence DROP CONSTRAINT document_sequence_kind_check;

ALTER TABLE document_sequence
  ADD CONSTRAINT document_sequence_kind_check CHECK (kind IN ('admission'));
