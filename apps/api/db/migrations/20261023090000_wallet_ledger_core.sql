-- migrate:up
ALTER TABLE ledger_account
  ADD COLUMN requires_family BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE journal_line ADD COLUMN family_id UUID;

ALTER TABLE journal_line
  ADD CONSTRAINT journal_line_family_fkey
  FOREIGN KEY (family_id, organization_id) REFERENCES guardian (id, organization_id) ON DELETE RESTRICT;

CREATE INDEX journal_line_family_idx ON journal_line (organization_id, ledger_account_id, family_id)
  INCLUDE (debit_minor, credit_minor);

CREATE FUNCTION journal_line_requires_family() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE
  needs_family BOOLEAN;
BEGIN
  SELECT requires_family INTO needs_family
  FROM ledger_account
  WHERE id = NEW.ledger_account_id AND organization_id = NEW.organization_id;
  IF COALESCE(needs_family, FALSE) AND NEW.family_id IS NULL THEN
    RAISE EXCEPTION 'a line on this account needs a family'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'journal_line_requires_family';
  END IF;
  IF NOT COALESCE(needs_family, FALSE) AND NEW.family_id IS NOT NULL THEN
    RAISE EXCEPTION 'a line on this account cannot carry a family'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'journal_line_refuses_family';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER journal_line_requires_family
  BEFORE INSERT ON journal_line
  FOR EACH ROW EXECUTE FUNCTION journal_line_requires_family();

ALTER TABLE journal_entry DROP CONSTRAINT journal_entry_kind_check;

ALTER TABLE journal_entry
  ADD CONSTRAINT journal_entry_kind_check CHECK (
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
      'store_count',
      'wallet_topup',
      'wallet_spend'
    )
  );

ALTER TABLE file_object DROP CONSTRAINT file_object_kind_check;

ALTER TABLE file_object
  ADD CONSTRAINT file_object_kind_check CHECK (
    kind IN ('school_logo', 'guardian_photo', 'payment_proof', 'wallet_proof')
  );

CREATE OR REPLACE FUNCTION seed_ledger_accounts(org TEXT) RETURNS void
  LANGUAGE plpgsql AS $$
DECLARE
  money_parent UUID;
  gateway_code INTEGER;
  gateway_name TEXT := 'Monnify collections';
  gateway_ledger UUID;
BEGIN
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

  INSERT INTO ledger_account (organization_id, code, name, type, system_key, requires_family)
  VALUES (org, 2200, 'Student wallets', 'liability', 'student_wallets', TRUE)
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

  SELECT id INTO money_parent
  FROM ledger_account
  WHERE organization_id = org AND system_key = 'money_accounts';

  SELECT id INTO gateway_ledger
  FROM ledger_account
  WHERE organization_id = org AND system_key = 'monnify_collections';

  IF gateway_ledger IS NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM ledger_account WHERE organization_id = org AND code = 1230
    ) THEN
      gateway_code := 1230;
    ELSE
      SELECT GREATEST(1200, COALESCE(MAX(code), 0)) + 10 INTO gateway_code
      FROM ledger_account
      WHERE organization_id = org AND parent_id = money_parent;
      WHILE EXISTS (
        SELECT 1 FROM ledger_account WHERE organization_id = org AND code = gateway_code
      ) LOOP
        gateway_code := gateway_code + 10;
      END LOOP;
    END IF;
    IF EXISTS (
      SELECT 1 FROM ledger_account
      WHERE organization_id = org AND parent_id = money_parent AND lower(name) = lower(gateway_name)
    ) THEN
      gateway_name := 'Monnify collections (gateway)';
    END IF;
    INSERT INTO ledger_account (organization_id, code, name, type, parent_id, system_key)
    VALUES (org, gateway_code, gateway_name, 'asset', money_parent, 'monnify_collections')
    RETURNING id INTO gateway_ledger;
  END IF;

  INSERT INTO money_account (organization_id, ledger_account_id, name, kind)
  SELECT org, gateway_ledger, 'Monnify collections', 'gateway'
  WHERE NOT EXISTS (
    SELECT 1 FROM money_account WHERE organization_id = org AND ledger_account_id = gateway_ledger
  );
END;
$$;

SELECT seed_ledger_accounts("id") FROM "organization";

CREATE FUNCTION wallet_append_only() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME
    USING ERRCODE = 'check_violation', CONSTRAINT = 'wallet_append_only';
END;
$$;

CREATE TABLE wallet (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE RESTRICT,
  guardian_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, guardian_id),
  FOREIGN KEY (guardian_id, organization_id) REFERENCES guardian (id, organization_id) ON DELETE RESTRICT
);

CREATE TRIGGER wallet_append_only
  BEFORE UPDATE OR DELETE ON wallet
  FOR EACH ROW EXECUTE FUNCTION wallet_append_only();

CREATE FUNCTION guardian_student_creates_wallet() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.pays_fees THEN
    INSERT INTO wallet (organization_id, guardian_id)
    VALUES (NEW.organization_id, NEW.guardian_id)
    ON CONFLICT (organization_id, guardian_id) DO NOTHING;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER guardian_student_creates_wallet
  AFTER INSERT OR UPDATE OF pays_fees ON guardian_student
  FOR EACH ROW EXECUTE FUNCTION guardian_student_creates_wallet();

INSERT INTO wallet (organization_id, guardian_id)
SELECT DISTINCT organization_id, guardian_id
FROM guardian_student
WHERE pays_fees
ON CONFLICT (organization_id, guardian_id) DO NOTHING;

CREATE TABLE wallet_topup (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE RESTRICT,
  wallet_id UUID NOT NULL,
  reference TEXT NOT NULL CHECK (char_length(btrim(reference)) BETWEEN 1 AND 80),
  money_account_id UUID NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('cash', 'transfer', 'pos')),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  received_on DATE NOT NULL,
  depositor_name TEXT CHECK (char_length(btrim(depositor_name)) BETWEEN 1 AND 120),
  proof_file_id UUID NOT NULL,
  request_hash TEXT NOT NULL,
  journal_entry_id UUID NOT NULL,
  created_by TEXT NOT NULL REFERENCES "user" ("id") ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, reference),
  UNIQUE (proof_file_id),
  UNIQUE (journal_entry_id),
  FOREIGN KEY (wallet_id, organization_id) REFERENCES wallet (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (money_account_id, organization_id) REFERENCES money_account (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (proof_file_id, organization_id) REFERENCES file_object (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (journal_entry_id, organization_id) REFERENCES journal_entry (id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX wallet_topup_wallet_idx ON wallet_topup (organization_id, wallet_id, created_at DESC);

CREATE TRIGGER wallet_topup_append_only
  BEFORE UPDATE OR DELETE ON wallet_topup
  FOR EACH ROW EXECUTE FUNCTION wallet_append_only();

CREATE TABLE wallet_spend (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE RESTRICT,
  wallet_id UUID NOT NULL,
  reference TEXT NOT NULL CHECK (char_length(btrim(reference)) BETWEEN 1 AND 80),
  request_hash TEXT NOT NULL,
  journal_entry_id UUID NOT NULL,
  created_by TEXT NOT NULL REFERENCES "user" ("id") ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, reference),
  UNIQUE (journal_entry_id),
  FOREIGN KEY (wallet_id, organization_id) REFERENCES wallet (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (journal_entry_id, organization_id) REFERENCES journal_entry (id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX wallet_spend_wallet_idx ON wallet_spend (organization_id, wallet_id, created_at DESC);

CREATE TRIGGER wallet_spend_append_only
  BEFORE UPDATE OR DELETE ON wallet_spend
  FOR EACH ROW EXECUTE FUNCTION wallet_append_only();

CREATE TABLE wallet_earmark (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE RESTRICT,
  wallet_id UUID NOT NULL,
  student_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('set', 'release', 'spend')),
  delta_minor BIGINT NOT NULL,
  reference TEXT NOT NULL CHECK (char_length(btrim(reference)) > 0),
  journal_entry_id UUID,
  created_by TEXT NOT NULL REFERENCES "user" ("id") ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, reference),
  FOREIGN KEY (wallet_id, organization_id) REFERENCES wallet (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (student_id, organization_id) REFERENCES student (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (journal_entry_id, organization_id) REFERENCES journal_entry (id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT wallet_earmark_sign CHECK (
    (kind = 'set' AND delta_minor > 0)
    OR (kind IN ('release', 'spend') AND delta_minor < 0)
  ),
  CONSTRAINT wallet_earmark_spend_entry CHECK ((kind = 'spend') = (journal_entry_id IS NOT NULL))
);

CREATE INDEX wallet_earmark_wallet_idx ON wallet_earmark (organization_id, wallet_id, student_id);

CREATE TRIGGER wallet_earmark_append_only
  BEFORE UPDATE OR DELETE ON wallet_earmark
  FOR EACH ROW EXECUTE FUNCTION wallet_append_only();

-- migrate:down
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM wallet_topup)
    OR EXISTS (SELECT 1 FROM wallet_spend)
    OR EXISTS (SELECT 1 FROM wallet_earmark)
    OR EXISTS (SELECT 1 FROM journal_line WHERE family_id IS NOT NULL)
    OR EXISTS (SELECT 1 FROM journal_entry WHERE kind IN ('wallet_topup', 'wallet_spend'))
  THEN
    RAISE EXCEPTION 'wallet money has been posted, so this migration cannot be rolled back'
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

ALTER TABLE journal_entry DROP CONSTRAINT journal_entry_kind_check;

ALTER TABLE journal_entry
  ADD CONSTRAINT journal_entry_kind_check CHECK (
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
  );

DROP TABLE wallet_earmark;

DROP TABLE wallet_spend;

DROP TABLE wallet_topup;

DROP TRIGGER guardian_student_creates_wallet ON guardian_student;

DROP FUNCTION guardian_student_creates_wallet();

DROP TABLE wallet;

DROP FUNCTION wallet_append_only();

DELETE FROM file_object WHERE kind = 'wallet_proof';

ALTER TABLE file_object DROP CONSTRAINT file_object_kind_check;

ALTER TABLE file_object
  ADD CONSTRAINT file_object_kind_check CHECK (
    kind IN ('school_logo', 'guardian_photo', 'payment_proof')
  );

DROP TRIGGER journal_line_requires_family ON journal_line;

DROP FUNCTION journal_line_requires_family();

DROP INDEX journal_line_family_idx;

ALTER TABLE journal_line
  DROP CONSTRAINT journal_line_family_fkey,
  DROP COLUMN family_id;

DELETE FROM money_account
WHERE ledger_account_id IN (
  SELECT id FROM ledger_account WHERE system_key = 'monnify_collections'
);

DELETE FROM ledger_account WHERE system_key IN ('monnify_collections', 'student_wallets');

CREATE OR REPLACE FUNCTION seed_ledger_accounts(org TEXT) RETURNS void
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

ALTER TABLE ledger_account DROP COLUMN requires_family;
