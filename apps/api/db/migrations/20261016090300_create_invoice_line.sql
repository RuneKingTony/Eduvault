-- migrate:up
CREATE TABLE invoice_line (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE RESTRICT,
  invoice_id UUID NOT NULL,
  fee_line_id UUID,
  student_discount_id UUID,
  ledger_account_id UUID NOT NULL,
  description TEXT NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 300),
  amount_minor BIGINT NOT NULL CONSTRAINT invoice_line_amount_nonzero CHECK (amount_minor <> 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (invoice_id, organization_id) REFERENCES invoice (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (fee_line_id, organization_id) REFERENCES fee_line (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (student_discount_id, organization_id) REFERENCES student_discount (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (ledger_account_id, organization_id) REFERENCES ledger_account (id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT invoice_line_discount_negative CHECK ((student_discount_id IS NOT NULL) = (amount_minor < 0))
);

CREATE INDEX invoice_line_invoice_idx ON invoice_line (organization_id, invoice_id);

CREATE INDEX invoice_line_fee_line_idx ON invoice_line (organization_id, fee_line_id);

CREATE INDEX invoice_line_discount_idx ON invoice_line (organization_id, student_discount_id);

CREATE FUNCTION invoice_line_draft_only() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE
  parent_id UUID;
  parent_status TEXT;
BEGIN
  parent_id := CASE WHEN TG_OP = 'INSERT' THEN NEW.invoice_id ELSE OLD.invoice_id END;
  SELECT status INTO parent_status
  FROM invoice
  WHERE id = parent_id
    AND organization_id = CASE WHEN TG_OP = 'INSERT' THEN NEW.organization_id ELSE OLD.organization_id END;
  IF parent_status IS NOT NULL AND parent_status <> 'draft' THEN
    RAISE EXCEPTION 'the lines of a sent or cancelled charge cannot change'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'invoice_line_frozen';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.invoice_id <> OLD.invoice_id OR NEW.organization_id <> OLD.organization_id) THEN
    RAISE EXCEPTION 'a charge line cannot move to another charge'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'invoice_line_frozen';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER invoice_line_draft_only
  BEFORE INSERT OR UPDATE OR DELETE ON invoice_line
  FOR EACH ROW EXECUTE FUNCTION invoice_line_draft_only();

-- migrate:down
DROP TRIGGER invoice_line_draft_only ON invoice_line;

DROP FUNCTION invoice_line_draft_only();

DROP TABLE invoice_line;
