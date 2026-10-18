-- migrate:up
ALTER TABLE invoice
  ADD COLUMN reference TEXT CHECK (char_length(btrim(reference)) BETWEEN 1 AND 80),
  ADD COLUMN request_hash TEXT,
  ADD CONSTRAINT invoice_adhoc_reference CHECK (
    (kind = 'adhoc') = (reference IS NOT NULL AND request_hash IS NOT NULL)
  );

CREATE UNIQUE INDEX invoice_reference_key ON invoice (organization_id, reference)
  WHERE reference IS NOT NULL;

CREATE OR REPLACE FUNCTION invoice_immutable() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'a charge is never deleted'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'invoice_never_deleted';
  END IF;
  IF OLD.status <> 'draft' THEN
    RAISE EXCEPTION 'a sent or cancelled charge cannot change'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'invoice_frozen';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.student_id IS DISTINCT FROM OLD.student_id
    OR NEW.term_id IS DISTINCT FROM OLD.term_id
    OR NEW.campus_id IS DISTINCT FROM OLD.campus_id
    OR NEW.billing_run_id IS DISTINCT FROM OLD.billing_run_id
    OR NEW.kind IS DISTINCT FROM OLD.kind
    OR NEW.reference IS DISTINCT FROM OLD.reference
    OR NEW.request_hash IS DISTINCT FROM OLD.request_hash
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'only the status, number and issue details of a draft charge can change'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'invoice_frozen_fields';
  END IF;
  RETURN NEW;
END;
$$;

-- migrate:down
CREATE OR REPLACE FUNCTION invoice_immutable() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'a charge is never deleted'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'invoice_never_deleted';
  END IF;
  IF OLD.status <> 'draft' THEN
    RAISE EXCEPTION 'a sent or cancelled charge cannot change'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'invoice_frozen';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.student_id IS DISTINCT FROM OLD.student_id
    OR NEW.term_id IS DISTINCT FROM OLD.term_id
    OR NEW.campus_id IS DISTINCT FROM OLD.campus_id
    OR NEW.billing_run_id IS DISTINCT FROM OLD.billing_run_id
    OR NEW.kind IS DISTINCT FROM OLD.kind
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'only the status, number and issue details of a draft charge can change'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'invoice_frozen_fields';
  END IF;
  RETURN NEW;
END;
$$;

DROP INDEX invoice_reference_key;

ALTER TABLE invoice
  DROP CONSTRAINT invoice_adhoc_reference,
  DROP COLUMN request_hash,
  DROP COLUMN reference;
