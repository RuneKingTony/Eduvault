-- migrate:up
CREATE TABLE invoice (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE RESTRICT,
  student_id UUID NOT NULL,
  term_id UUID NOT NULL,
  campus_id TEXT NOT NULL,
  billing_run_id UUID,
  kind TEXT NOT NULL CHECK (kind IN ('term', 'store', 'adhoc')),
  number TEXT CHECK (char_length(btrim(number)) > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'cancelled')),
  created_by TEXT REFERENCES "user" ("id") ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  issued_at TIMESTAMPTZ,
  issued_by TEXT REFERENCES "user" ("id") ON DELETE SET NULL,
  journal_entry_id UUID,
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, number),
  FOREIGN KEY (student_id, organization_id) REFERENCES student (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (term_id, organization_id) REFERENCES term (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (campus_id, organization_id) REFERENCES campus (team_id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (billing_run_id, organization_id) REFERENCES billing_run (id, organization_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (journal_entry_id, organization_id) REFERENCES journal_entry (id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT invoice_issued_columns CHECK (
    (status = 'issued' AND number IS NOT NULL AND issued_at IS NOT NULL AND journal_entry_id IS NOT NULL)
    OR (status <> 'issued' AND number IS NULL AND issued_at IS NULL AND journal_entry_id IS NULL)
  ),
  CONSTRAINT invoice_term_in_round CHECK (kind <> 'term' OR billing_run_id IS NOT NULL)
);

CREATE UNIQUE INDEX invoice_term_student_live_key ON invoice (student_id, term_id)
  WHERE kind = 'term' AND status <> 'cancelled';

CREATE UNIQUE INDEX invoice_journal_entry_key ON invoice (journal_entry_id)
  WHERE journal_entry_id IS NOT NULL;

CREATE INDEX invoice_run_idx ON invoice (organization_id, billing_run_id);

CREATE INDEX invoice_student_idx ON invoice (organization_id, student_id, created_at DESC);

CREATE INDEX invoice_campus_idx ON invoice (organization_id, campus_id);

CREATE INDEX invoice_term_idx ON invoice (organization_id, term_id, status);

CREATE FUNCTION invoice_immutable() RETURNS trigger
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

CREATE TRIGGER invoice_immutable
  BEFORE UPDATE OR DELETE ON invoice
  FOR EACH ROW EXECUTE FUNCTION invoice_immutable();

-- migrate:down
DROP TRIGGER invoice_immutable ON invoice;

DROP FUNCTION invoice_immutable();

DROP TABLE invoice;
