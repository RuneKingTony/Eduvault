-- migrate:up
ALTER TABLE school_account ADD COLUMN city TEXT;

ALTER TABLE school_account ADD COLUMN admission_prefix TEXT;

UPDATE school_account sa
SET admission_prefix = CASE
  WHEN length(regexp_replace(o.slug, '[^A-Za-z]', '', 'g')) < 2 THEN 'SCH'
  ELSE upper(left(regexp_replace(o.slug, '[^A-Za-z]', '', 'g'), 3))
END
FROM "organization" o
WHERE o.id = sa.organization_id;

ALTER TABLE school_account ALTER COLUMN admission_prefix SET NOT NULL;

ALTER TABLE school_account
  ADD CONSTRAINT school_account_admission_prefix_check CHECK (admission_prefix ~ '^[A-Z]{2,6}$');

CREATE TABLE class_level (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE CASCADE,
  code TEXT NOT NULL CHECK (code ~ '^[A-Z0-9]{2,8}$'),
  name TEXT NOT NULL,
  sequence INT NOT NULL,
  next_level_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, code),
  UNIQUE (organization_id, sequence),
  UNIQUE (id, organization_id),
  FOREIGN KEY (next_level_id, organization_id) REFERENCES class_level (id, organization_id),
  CHECK (next_level_id <> id)
);

-- migrate:down
DROP TABLE class_level;

ALTER TABLE school_account DROP CONSTRAINT school_account_admission_prefix_check;

ALTER TABLE school_account DROP COLUMN admission_prefix;

ALTER TABLE school_account DROP COLUMN city;
