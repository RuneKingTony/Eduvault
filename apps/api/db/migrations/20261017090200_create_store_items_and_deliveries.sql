-- migrate:up
CREATE TABLE item (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('uniform', 'book')),
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  variant TEXT CHECK (char_length(btrim(variant)) BETWEEN 1 AND 40),
  class_level_id UUID,
  cost_price_minor BIGINT NOT NULL CHECK (cost_price_minor >= 0),
  sell_price_minor BIGINT NOT NULL,
  low_stock_level INTEGER NOT NULL DEFAULT 5 CHECK (low_stock_level >= 0),
  retired_at TIMESTAMPTZ,
  retired_by TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, organization_id),
  FOREIGN KEY (class_level_id, organization_id) REFERENCES class_level (id, organization_id),
  CONSTRAINT item_price_not_below_cost CHECK (sell_price_minor >= cost_price_minor),
  CONSTRAINT item_level_only_for_books CHECK ((kind = 'book') = (class_level_id IS NOT NULL)),
  CONSTRAINT item_variant_not_for_books CHECK (kind <> 'book' OR variant IS NULL)
);

CREATE UNIQUE INDEX item_active_key
  ON item (organization_id, kind, name, variant, class_level_id) NULLS NOT DISTINCT
  WHERE retired_at IS NULL;

CREATE INDEX item_listing_idx ON item (organization_id, kind, name);

-- Deleting a school cascades to its items, so a delete is allowed once the school row is gone.
CREATE FUNCTION school_is_gone(org TEXT) RETURNS boolean
  LANGUAGE sql STABLE AS $$
  SELECT NOT EXISTS (SELECT 1 FROM "organization" WHERE id = org);
$$;

CREATE FUNCTION item_never_deleted() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF school_is_gone(OLD.organization_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'an item is retired, never deleted'
    USING ERRCODE = 'check_violation', CONSTRAINT = 'item_never_deleted';
END;
$$;

CREATE TRIGGER item_never_deleted
  BEFORE DELETE ON item
  FOR EACH ROW EXECUTE FUNCTION item_never_deleted();

CREATE TABLE item_price_change (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE CASCADE,
  item_id UUID NOT NULL,
  old_cost_minor BIGINT NOT NULL,
  new_cost_minor BIGINT NOT NULL,
  old_price_minor BIGINT NOT NULL,
  new_price_minor BIGINT NOT NULL,
  changed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, organization_id),
  FOREIGN KEY (item_id, organization_id) REFERENCES item (id, organization_id)
);

CREATE INDEX item_price_change_item_idx ON item_price_change (organization_id, item_id, created_at DESC);

CREATE TABLE store (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE CASCADE,
  campus_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
  retired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, organization_id),
  UNIQUE (campus_id, name),
  UNIQUE (campus_id),
  FOREIGN KEY (campus_id, organization_id) REFERENCES campus (team_id, organization_id) ON DELETE CASCADE
);

INSERT INTO store (organization_id, campus_id, name)
SELECT c.organization_id, c.team_id, t."name" || ' campus store'
FROM campus c
JOIN "team" t ON t."id" = c.team_id;

CREATE TABLE stock_delivery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE RESTRICT,
  number TEXT NOT NULL CHECK (char_length(btrim(number)) > 0),
  reference TEXT NOT NULL CHECK (char_length(btrim(reference)) BETWEEN 1 AND 80),
  request_hash TEXT NOT NULL,
  store_id UUID NOT NULL,
  supplier_name TEXT NOT NULL CHECK (char_length(btrim(supplier_name)) BETWEEN 1 AND 120),
  money_account_id UUID,
  is_opening BOOLEAN NOT NULL DEFAULT FALSE,
  received_on DATE NOT NULL,
  received_by TEXT,
  total_minor BIGINT NOT NULL CHECK (total_minor > 0),
  journal_entry_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, number),
  UNIQUE (organization_id, reference),
  FOREIGN KEY (store_id, organization_id) REFERENCES store (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (money_account_id, organization_id) REFERENCES money_account (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (journal_entry_id, organization_id) REFERENCES journal_entry (id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT stock_delivery_opening_has_no_account CHECK (is_opening = (money_account_id IS NULL))
);

CREATE UNIQUE INDEX stock_delivery_opening_key ON stock_delivery (store_id) WHERE is_opening;

CREATE UNIQUE INDEX stock_delivery_journal_entry_key ON stock_delivery (journal_entry_id);

CREATE INDEX stock_delivery_listing_idx ON stock_delivery (organization_id, received_on DESC, created_at DESC);

CREATE TABLE stock_delivery_line (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE RESTRICT,
  stock_delivery_id UUID NOT NULL,
  item_id UUID NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost_minor BIGINT NOT NULL CHECK (unit_cost_minor > 0),
  UNIQUE (id, organization_id),
  UNIQUE (stock_delivery_id, item_id),
  FOREIGN KEY (stock_delivery_id, organization_id) REFERENCES stock_delivery (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (item_id, organization_id) REFERENCES item (id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX stock_delivery_line_item_idx ON stock_delivery_line (organization_id, item_id);

CREATE TABLE stock_movement (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE RESTRICT,
  store_id UUID NOT NULL,
  item_id UUID NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity <> 0),
  kind TEXT NOT NULL CHECK (kind IN ('opening', 'receive', 'sell', 'count')),
  value_minor BIGINT NOT NULL,
  reference TEXT NOT NULL CHECK (char_length(btrim(reference)) > 0),
  source_id UUID,
  moved_by TEXT,
  moved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, reference, store_id, item_id),
  FOREIGN KEY (store_id, organization_id) REFERENCES store (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (item_id, organization_id) REFERENCES item (id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX stock_movement_stock_idx ON stock_movement (organization_id, store_id, item_id);

CREATE FUNCTION store_record_append_only() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME
    USING ERRCODE = 'check_violation', CONSTRAINT = 'store_record_append_only';
END;
$$;

CREATE FUNCTION item_price_change_append_only() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND school_is_gone(OLD.organization_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME
    USING ERRCODE = 'check_violation', CONSTRAINT = 'store_record_append_only';
END;
$$;

CREATE TRIGGER item_price_change_append_only
  BEFORE UPDATE OR DELETE ON item_price_change
  FOR EACH ROW EXECUTE FUNCTION item_price_change_append_only();

CREATE TRIGGER stock_delivery_append_only
  BEFORE UPDATE OR DELETE ON stock_delivery
  FOR EACH ROW EXECUTE FUNCTION store_record_append_only();

CREATE TRIGGER stock_delivery_line_append_only
  BEFORE UPDATE OR DELETE ON stock_delivery_line
  FOR EACH ROW EXECUTE FUNCTION store_record_append_only();

CREATE FUNCTION stock_movement_append_only() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'a stock movement is never changed or deleted'
    USING ERRCODE = 'check_violation', CONSTRAINT = 'stock_movement_append_only';
END;
$$;

CREATE TRIGGER stock_movement_append_only
  BEFORE UPDATE OR DELETE ON stock_movement
  FOR EACH ROW EXECUTE FUNCTION stock_movement_append_only();

CREATE FUNCTION stock_delivery_not_empty() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM stock_delivery_line
    WHERE stock_delivery_id = NEW.id AND organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'stock delivery % has no lines', NEW.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'stock_delivery_not_empty';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER stock_delivery_not_empty
  AFTER INSERT ON stock_delivery
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION stock_delivery_not_empty();

-- migrate:down
DROP TRIGGER stock_delivery_not_empty ON stock_delivery;

DROP FUNCTION stock_delivery_not_empty();

DROP TRIGGER stock_movement_append_only ON stock_movement;

DROP FUNCTION stock_movement_append_only();

DROP TRIGGER stock_delivery_line_append_only ON stock_delivery_line;

DROP TRIGGER stock_delivery_append_only ON stock_delivery;

DROP TRIGGER item_price_change_append_only ON item_price_change;

DROP FUNCTION item_price_change_append_only();

DROP FUNCTION store_record_append_only();

DROP TABLE stock_movement;

DROP TABLE stock_delivery_line;

DROP TABLE stock_delivery;

DROP TABLE store;

DROP TABLE item_price_change;

DROP TRIGGER item_never_deleted ON item;

DROP FUNCTION item_never_deleted();

DROP TABLE item;

DROP FUNCTION school_is_gone(TEXT);
