-- migrate:up
CREATE TABLE adjustment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE RESTRICT,
  number TEXT NOT NULL CHECK (char_length(btrim(number)) > 0),
  kind TEXT NOT NULL CHECK (kind IN ('credit_note', 'write_off', 'refund')),
  student_id UUID NOT NULL,
  invoice_id UUID,
  ledger_account_id UUID,
  money_account_id UUID,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  reason TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 200),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'approved', 'rejected')),
  created_by TEXT REFERENCES "user" ("id") ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_by TEXT REFERENCES "user" ("id") ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejected_by TEXT REFERENCES "user" ("id") ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT CHECK (char_length(btrim(rejection_reason)) BETWEEN 1 AND 500),
  journal_entry_id UUID,
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, number),
  FOREIGN KEY (student_id, organization_id) REFERENCES student (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (invoice_id, organization_id) REFERENCES invoice (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (ledger_account_id, organization_id) REFERENCES ledger_account (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (money_account_id, organization_id) REFERENCES money_account (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (journal_entry_id, organization_id) REFERENCES journal_entry (id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT adjustment_kind_shape CHECK (
    CASE kind
      WHEN 'credit_note' THEN ledger_account_id IS NOT NULL AND money_account_id IS NULL
      WHEN 'write_off' THEN ledger_account_id IS NULL AND money_account_id IS NULL AND invoice_id IS NULL
      ELSE money_account_id IS NOT NULL AND ledger_account_id IS NULL AND invoice_id IS NULL
    END
  ),
  CONSTRAINT adjustment_approved_columns CHECK ((status = 'approved') = (approved_at IS NOT NULL)),
  CONSTRAINT adjustment_rejected_columns CHECK (
    (status = 'rejected') = (rejected_at IS NOT NULL AND rejected_by IS NOT NULL AND rejection_reason IS NOT NULL)
  ),
  CONSTRAINT adjustment_approved_not_self CHECK (approved_by IS NULL OR approved_by <> created_by),
  CONSTRAINT adjustment_rejected_not_self CHECK (rejected_by IS NULL OR rejected_by <> created_by)
);

CREATE INDEX adjustment_student_idx ON adjustment (organization_id, student_id, status);

CREATE INDEX adjustment_listing_idx ON adjustment (organization_id, created_at DESC);

CREATE INDEX adjustment_ledger_account_idx ON adjustment (organization_id, ledger_account_id);

CREATE INDEX adjustment_money_account_idx ON adjustment (organization_id, money_account_id);

CREATE INDEX adjustment_invoice_idx ON adjustment (organization_id, invoice_id);

CREATE UNIQUE INDEX adjustment_journal_entry_key ON adjustment (journal_entry_id)
  WHERE journal_entry_id IS NOT NULL;

CREATE TABLE payment_void (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE RESTRICT,
  payment_id UUID NOT NULL,
  reason TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 500),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'approved', 'rejected')),
  created_by TEXT REFERENCES "user" ("id") ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_by TEXT REFERENCES "user" ("id") ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejected_by TEXT REFERENCES "user" ("id") ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT CHECK (char_length(btrim(rejection_reason)) BETWEEN 1 AND 500),
  journal_entry_id UUID,
  UNIQUE (id, organization_id),
  FOREIGN KEY (payment_id, organization_id) REFERENCES payment (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (journal_entry_id, organization_id) REFERENCES journal_entry (id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT payment_void_approved_columns CHECK ((status = 'approved') = (approved_at IS NOT NULL)),
  CONSTRAINT payment_void_rejected_columns CHECK (
    (status = 'rejected') = (rejected_at IS NOT NULL AND rejected_by IS NOT NULL AND rejection_reason IS NOT NULL)
  ),
  CONSTRAINT payment_void_approved_not_self CHECK (approved_by IS NULL OR approved_by <> created_by),
  CONSTRAINT payment_void_rejected_not_self CHECK (rejected_by IS NULL OR rejected_by <> created_by)
);

CREATE UNIQUE INDEX payment_void_open_key ON payment_void (payment_id)
  WHERE status IN ('submitted', 'approved');

CREATE INDEX payment_void_listing_idx ON payment_void (organization_id, created_at DESC);

CREATE UNIQUE INDEX payment_void_journal_entry_key ON payment_void (journal_entry_id)
  WHERE journal_entry_id IS NOT NULL;

CREATE INDEX adjustment_waiting_idx ON adjustment (organization_id, status)
  WHERE status = 'submitted';

CREATE INDEX payment_void_waiting_idx ON payment_void (organization_id, status)
  WHERE status = 'submitted';

CREATE INDEX student_discount_waiting_idx ON student_discount (organization_id, status)
  WHERE status = 'submitted';

CREATE FUNCTION approval_record_immutable() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'a % is never deleted', TG_TABLE_NAME
      USING ERRCODE = 'check_violation', CONSTRAINT = TG_TABLE_NAME || '_never_deleted';
  END IF;
  IF OLD.status <> 'submitted' THEN
    RAISE EXCEPTION 'a decided % cannot change', TG_TABLE_NAME
      USING ERRCODE = 'check_violation', CONSTRAINT = TG_TABLE_NAME || '_decided_frozen';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER adjustment_immutable
  BEFORE UPDATE OR DELETE ON adjustment
  FOR EACH ROW EXECUTE FUNCTION approval_record_immutable();

CREATE TRIGGER payment_void_immutable
  BEFORE UPDATE OR DELETE ON payment_void
  FOR EACH ROW EXECUTE FUNCTION approval_record_immutable();

ALTER TABLE school_setting
  ADD COLUMN approve_refund BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN approve_write_off BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN approve_credit_note BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN approve_discount BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN approve_payment_void BOOLEAN NOT NULL DEFAULT true;

-- migrate:down
ALTER TABLE school_setting
  DROP COLUMN approve_payment_void,
  DROP COLUMN approve_discount,
  DROP COLUMN approve_credit_note,
  DROP COLUMN approve_write_off,
  DROP COLUMN approve_refund;

DROP TRIGGER payment_void_immutable ON payment_void;

DROP TRIGGER adjustment_immutable ON adjustment;

DROP FUNCTION approval_record_immutable();

DROP INDEX student_discount_waiting_idx;

DROP TABLE payment_void;

DROP TABLE adjustment;
