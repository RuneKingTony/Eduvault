-- migrate:up
CREATE TABLE stock_count (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE RESTRICT,
  number TEXT NOT NULL CHECK (char_length(btrim(number)) > 0),
  store_id UUID NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('matched', 'submitted', 'approved', 'rejected')),
  note TEXT CHECK (char_length(btrim(note)) BETWEEN 1 AND 500),
  journal_entry_id UUID,
  created_by TEXT REFERENCES "user" ("id") ON DELETE SET NULL,
  approved_by TEXT REFERENCES "user" ("id") ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejected_by TEXT REFERENCES "user" ("id") ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT CHECK (char_length(btrim(rejection_reason)) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, number),
  FOREIGN KEY (store_id, organization_id) REFERENCES store (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (journal_entry_id, organization_id) REFERENCES journal_entry (id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT stock_count_approved_columns CHECK ((status = 'approved') = (approved_at IS NOT NULL)),
  CONSTRAINT stock_count_rejected_columns CHECK (
    (status = 'rejected') = (rejected_at IS NOT NULL AND rejected_by IS NOT NULL AND rejection_reason IS NOT NULL)
  ),
  CONSTRAINT stock_count_approved_not_self CHECK (approved_by IS NULL OR approved_by <> created_by),
  CONSTRAINT stock_count_rejected_not_self CHECK (rejected_by IS NULL OR rejected_by <> created_by)
);

CREATE UNIQUE INDEX stock_count_waiting_key ON stock_count (store_id) WHERE status = 'submitted';

CREATE UNIQUE INDEX stock_count_journal_entry_key ON stock_count (journal_entry_id)
  WHERE journal_entry_id IS NOT NULL;

CREATE INDEX stock_count_listing_idx ON stock_count (organization_id, created_at DESC);

CREATE INDEX stock_count_waiting_idx ON stock_count (organization_id, status)
  WHERE status = 'submitted';

CREATE TRIGGER stock_count_immutable
  BEFORE UPDATE OR DELETE ON stock_count
  FOR EACH ROW EXECUTE FUNCTION approval_record_immutable();

CREATE TABLE stock_count_line (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE RESTRICT,
  stock_count_id UUID NOT NULL,
  item_id UUID NOT NULL,
  expected_quantity INTEGER NOT NULL CHECK (expected_quantity >= 0),
  counted_quantity INTEGER NOT NULL CHECK (counted_quantity >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, organization_id),
  UNIQUE (stock_count_id, item_id),
  FOREIGN KEY (stock_count_id, organization_id) REFERENCES stock_count (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (item_id, organization_id) REFERENCES item (id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX stock_count_line_item_idx ON stock_count_line (organization_id, item_id);

CREATE TRIGGER stock_count_line_append_only
  BEFORE UPDATE OR DELETE ON stock_count_line
  FOR EACH ROW EXECUTE FUNCTION store_record_append_only();

CREATE FUNCTION stock_count_not_empty() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM stock_count_line
    WHERE stock_count_id = NEW.id AND organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'stock count % has no lines', NEW.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'stock_count_not_empty';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER stock_count_not_empty
  AFTER INSERT ON stock_count
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION stock_count_not_empty();

-- migrate:down
DROP TRIGGER stock_count_not_empty ON stock_count;

DROP FUNCTION stock_count_not_empty();

DROP TRIGGER stock_count_line_append_only ON stock_count_line;

DROP TABLE stock_count_line;

DROP TRIGGER stock_count_immutable ON stock_count;

DROP TABLE stock_count;
