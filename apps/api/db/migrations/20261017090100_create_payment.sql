-- migrate:up
CREATE TABLE payment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE RESTRICT,
  reference TEXT NOT NULL CHECK (char_length(btrim(reference)) BETWEEN 1 AND 80),
  receipt_number TEXT NOT NULL CHECK (char_length(btrim(receipt_number)) > 0),
  payer_guardian_id UUID,
  payer_name TEXT NOT NULL CHECK (char_length(btrim(payer_name)) BETWEEN 1 AND 120),
  money_account_id UUID NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('cash', 'transfer', 'pos')),
  provider_reference TEXT CHECK (char_length(btrim(provider_reference)) BETWEEN 1 AND 80),
  proof_file_id UUID,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  paid_on DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'void_pending', 'voided')),
  request_hash TEXT NOT NULL,
  journal_entry_id UUID NOT NULL,
  created_by TEXT REFERENCES "user" ("id") ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, reference),
  UNIQUE (organization_id, receipt_number),
  FOREIGN KEY (payer_guardian_id, organization_id) REFERENCES guardian (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (money_account_id, organization_id) REFERENCES money_account (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (proof_file_id, organization_id) REFERENCES file_object (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (journal_entry_id, organization_id) REFERENCES journal_entry (id, organization_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX payment_provider_reference_key ON payment (organization_id, provider_reference)
  WHERE provider_reference IS NOT NULL;

CREATE UNIQUE INDEX payment_proof_file_key ON payment (proof_file_id)
  WHERE proof_file_id IS NOT NULL;

CREATE UNIQUE INDEX payment_journal_entry_key ON payment (journal_entry_id);

CREATE INDEX payment_listing_idx ON payment (organization_id, paid_on DESC, created_at DESC);

CREATE INDEX payment_payer_idx ON payment (organization_id, payer_guardian_id);

CREATE TABLE payment_allocation (
  payment_id UUID NOT NULL,
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE RESTRICT,
  student_id UUID NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  PRIMARY KEY (payment_id, student_id),
  FOREIGN KEY (payment_id, organization_id) REFERENCES payment (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (student_id, organization_id) REFERENCES student (id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX payment_allocation_student_idx ON payment_allocation (organization_id, student_id);

CREATE FUNCTION payment_immutable() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'a payment is never deleted'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'payment_never_deleted';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.reference IS DISTINCT FROM OLD.reference
    OR NEW.receipt_number IS DISTINCT FROM OLD.receipt_number
    OR NEW.payer_guardian_id IS DISTINCT FROM OLD.payer_guardian_id
    OR NEW.payer_name IS DISTINCT FROM OLD.payer_name
    OR NEW.money_account_id IS DISTINCT FROM OLD.money_account_id
    OR NEW.method IS DISTINCT FROM OLD.method
    OR NEW.provider_reference IS DISTINCT FROM OLD.provider_reference
    OR NEW.proof_file_id IS DISTINCT FROM OLD.proof_file_id
    OR NEW.amount_minor IS DISTINCT FROM OLD.amount_minor
    OR NEW.paid_on IS DISTINCT FROM OLD.paid_on
    OR NEW.request_hash IS DISTINCT FROM OLD.request_hash
    OR NEW.journal_entry_id IS DISTINCT FROM OLD.journal_entry_id
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'only the status of a payment can change'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'payment_frozen_fields';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER payment_immutable
  BEFORE UPDATE OR DELETE ON payment
  FOR EACH ROW EXECUTE FUNCTION payment_immutable();

CREATE FUNCTION payment_allocation_immutable() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'a payment allocation cannot change'
    USING ERRCODE = 'check_violation', CONSTRAINT = 'payment_allocation_frozen';
END;
$$;

CREATE TRIGGER payment_allocation_immutable
  BEFORE UPDATE OR DELETE ON payment_allocation
  FOR EACH ROW EXECUTE FUNCTION payment_allocation_immutable();

-- migrate:down
DROP TRIGGER payment_allocation_immutable ON payment_allocation;

DROP FUNCTION payment_allocation_immutable();

DROP TRIGGER payment_immutable ON payment;

DROP FUNCTION payment_immutable();

DROP TABLE payment_allocation;

DROP TABLE payment;
