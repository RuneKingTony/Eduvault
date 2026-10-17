-- migrate:up
CREATE TABLE store_sale (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE RESTRICT,
  number TEXT NOT NULL CHECK (char_length(btrim(number)) > 0),
  reference TEXT NOT NULL CHECK (char_length(btrim(reference)) BETWEEN 1 AND 80),
  request_hash TEXT NOT NULL,
  store_id UUID NOT NULL,
  student_id UUID NOT NULL,
  invoice_id UUID NOT NULL,
  payment_id UUID NOT NULL,
  sold_by TEXT REFERENCES "user" ("id") ON DELETE SET NULL,
  sold_on DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, reference),
  UNIQUE (organization_id, number),
  UNIQUE (organization_id, invoice_id),
  UNIQUE (organization_id, payment_id),
  FOREIGN KEY (store_id, organization_id) REFERENCES store (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (student_id, organization_id) REFERENCES student (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (invoice_id, organization_id) REFERENCES invoice (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (payment_id, organization_id) REFERENCES payment (id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX store_sale_store_idx ON store_sale (organization_id, store_id, sold_on);

CREATE INDEX store_sale_student_idx ON store_sale (organization_id, student_id);

CREATE TABLE store_sale_line (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE RESTRICT,
  store_sale_id UUID NOT NULL,
  item_id UUID NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_minor BIGINT NOT NULL CHECK (unit_price_minor > 0),
  cost_minor BIGINT NOT NULL CHECK (cost_minor >= 0),
  UNIQUE (id, organization_id),
  UNIQUE (store_sale_id, item_id),
  FOREIGN KEY (store_sale_id, organization_id) REFERENCES store_sale (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (item_id, organization_id) REFERENCES item (id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX store_sale_line_item_idx ON store_sale_line (organization_id, item_id);

CREATE TRIGGER store_sale_append_only
  BEFORE UPDATE OR DELETE ON store_sale
  FOR EACH ROW EXECUTE FUNCTION store_record_append_only();

CREATE TRIGGER store_sale_line_append_only
  BEFORE UPDATE OR DELETE ON store_sale_line
  FOR EACH ROW EXECUTE FUNCTION store_record_append_only();

CREATE FUNCTION store_sale_not_empty() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM store_sale_line
    WHERE store_sale_id = NEW.id AND organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'store sale % has no lines', NEW.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'store_sale_not_empty';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER store_sale_not_empty
  AFTER INSERT ON store_sale
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION store_sale_not_empty();

CREATE FUNCTION payment_store_sale_stays_posted() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'posted' AND EXISTS (
    SELECT 1 FROM store_sale
    WHERE payment_id = OLD.id AND organization_id = OLD.organization_id
  ) THEN
    RAISE EXCEPTION 'This payment is for a store sale. It can’t be cancelled on its own.'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'payment_store_sale_stays_posted';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER payment_store_sale_stays_posted
  BEFORE UPDATE ON payment
  FOR EACH ROW EXECUTE FUNCTION payment_store_sale_stays_posted();

-- migrate:down
DROP TRIGGER payment_store_sale_stays_posted ON payment;

DROP FUNCTION payment_store_sale_stays_posted();

DROP TRIGGER store_sale_not_empty ON store_sale;

DROP FUNCTION store_sale_not_empty();

DROP TRIGGER store_sale_line_append_only ON store_sale_line;

DROP TRIGGER store_sale_append_only ON store_sale;

DROP TABLE store_sale_line;

DROP TABLE store_sale;
