-- migrate:up
CREATE TABLE file_object (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('school_logo')),
  storage_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size > 0),
  sha256 TEXT NOT NULL,
  original_name TEXT NOT NULL,
  uploaded_by TEXT REFERENCES "user" ("id") ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, organization_id)
);

CREATE INDEX file_object_organization_uploaded_idx ON file_object (organization_id, uploaded_at);

CREATE TABLE file_blob (
  file_id UUID PRIMARY KEY,
  organization_id TEXT NOT NULL,
  bytes BYTEA NOT NULL,
  FOREIGN KEY (file_id, organization_id) REFERENCES file_object (id, organization_id) ON DELETE CASCADE
);

UPDATE school_account SET name = left(name, 120) WHERE char_length(name) > 120;

UPDATE school_account SET city = left(city, 80) WHERE char_length(city) > 80;

ALTER TABLE school_account
  ADD COLUMN address TEXT,
  ADD COLUMN phone TEXT,
  ADD COLUMN email TEXT,
  ADD COLUMN logo_file_id UUID,
  ADD COLUMN updated_by TEXT REFERENCES "user" ("id") ON DELETE SET NULL,
  ADD CONSTRAINT school_account_logo_file_id_key UNIQUE (logo_file_id),
  ADD CONSTRAINT school_account_logo_file_fkey FOREIGN KEY (logo_file_id, organization_id)
    REFERENCES file_object (id, organization_id) ON DELETE SET NULL (logo_file_id),
  ADD CONSTRAINT school_account_name_check CHECK (char_length(name) BETWEEN 1 AND 120),
  ADD CONSTRAINT school_account_city_check CHECK (char_length(city) <= 80),
  ADD CONSTRAINT school_account_address_check CHECK (char_length(address) <= 200),
  ADD CONSTRAINT school_account_phone_check CHECK (char_length(phone) <= 30);

CREATE TABLE school_setting (
  organization_id TEXT PRIMARY KEY REFERENCES "organization" ("id") ON DELETE CASCADE,
  max_guardians SMALLINT NOT NULL DEFAULT 4 CHECK (max_guardians BETWEEN 1 AND 6),
  require_guardian BOOLEAN NOT NULL DEFAULT true,
  updated_by TEXT REFERENCES "user" ("id") ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO school_account (organization_id, name, currency, admission_prefix)
SELECT
  o.id,
  left(COALESCE(NULLIF(btrim(o.name), ''), 'School'), 120),
  'NGN',
  CASE
    WHEN length(regexp_replace(o.slug, '[^A-Za-z]', '', 'g')) < 2 THEN 'SCH'
    ELSE upper(left(regexp_replace(o.slug, '[^A-Za-z]', '', 'g'), 3))
  END
FROM "organization" o
WHERE NOT EXISTS (SELECT 1 FROM school_account sa WHERE sa.organization_id = o.id);

INSERT INTO school_setting (organization_id)
SELECT id FROM "organization"
ON CONFLICT DO NOTHING;

ALTER TABLE audit_log DROP CONSTRAINT audit_log_organization_id_fkey;

-- migrate:down
ALTER TABLE audit_log
  ADD CONSTRAINT audit_log_organization_id_fkey FOREIGN KEY (organization_id)
    REFERENCES "organization" ("id") ON DELETE RESTRICT NOT VALID;

DROP TABLE school_setting;

ALTER TABLE school_account
  DROP CONSTRAINT school_account_phone_check,
  DROP CONSTRAINT school_account_address_check,
  DROP CONSTRAINT school_account_city_check,
  DROP CONSTRAINT school_account_name_check,
  DROP CONSTRAINT school_account_logo_file_fkey,
  DROP CONSTRAINT school_account_logo_file_id_key,
  DROP COLUMN updated_by,
  DROP COLUMN logo_file_id,
  DROP COLUMN email,
  DROP COLUMN phone,
  DROP COLUMN address;

DROP TABLE file_blob;

DROP TABLE file_object;
