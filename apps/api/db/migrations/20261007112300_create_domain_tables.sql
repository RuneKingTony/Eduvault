-- migrate:up
CREATE TABLE campus (
  team_id TEXT PRIMARY KEY REFERENCES "team" ("id") ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE CASCADE,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (team_id, organization_id)
);

CREATE INDEX campus_organization_id_idx ON campus (organization_id);

CREATE TABLE school_account (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL UNIQUE REFERENCES "organization" ("id") ON DELETE CASCADE,
  name TEXT NOT NULL,
  currency CHAR(3) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE fee_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE CASCADE,
  campus_id TEXT,
  name TEXT NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
  currency CHAR(3) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (campus_id, organization_id) REFERENCES campus (team_id, organization_id)
);

CREATE INDEX fee_schedule_organization_campus_idx ON fee_schedule (organization_id, campus_id);

CREATE TABLE student (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE CASCADE,
  campus_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  admission_number TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, admission_number),
  FOREIGN KEY (campus_id, organization_id) REFERENCES campus (team_id, organization_id)
);

CREATE INDEX student_organization_campus_idx ON student (organization_id, campus_id);

-- migrate:down
DROP TABLE student;

DROP TABLE fee_schedule;

DROP TABLE school_account;

DROP TABLE campus;
