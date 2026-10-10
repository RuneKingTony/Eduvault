-- migrate:up
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE academic_session (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (name ~ '^\d{4}/\d{4}$'),
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, name),
  UNIQUE (id, organization_id),
  CHECK (ends_on - starts_on >= 84),
  CONSTRAINT academic_session_no_overlap EXCLUDE USING gist (
    organization_id WITH =,
    daterange(starts_on, ends_on, '[]') WITH &&
  )
);

CREATE TABLE term (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE CASCADE,
  session_id UUID NOT NULL,
  sequence SMALLINT NOT NULL CHECK (sequence BETWEEN 1 AND 3),
  name TEXT NOT NULL,
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, sequence),
  UNIQUE (id, organization_id),
  CHECK (starts_on <= ends_on),
  FOREIGN KEY (session_id, organization_id) REFERENCES academic_session (id, organization_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX term_one_current ON term (organization_id) WHERE is_current;

CREATE TABLE school_holiday (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE CASCADE,
  term_id UUID NOT NULL,
  date DATE NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, date),
  FOREIGN KEY (term_id, organization_id) REFERENCES term (id, organization_id) ON DELETE CASCADE
);

-- migrate:down
DROP TABLE school_holiday;

DROP TABLE term;

DROP TABLE academic_session;
