-- migrate:up
DROP TABLE fee_schedule;

-- migrate:down
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
