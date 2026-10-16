-- migrate:up
CREATE TABLE billing_run (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE RESTRICT,
  number TEXT NOT NULL CHECK (char_length(btrim(number)) > 0),
  term_id UUID NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('school', 'campus', 'level')),
  scope_campus_id TEXT,
  scope_class_level_id UUID,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'cancelled')),
  created_by TEXT REFERENCES "user" ("id") ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  issued_by TEXT REFERENCES "user" ("id") ON DELETE SET NULL,
  issued_at TIMESTAMPTZ,
  cancelled_by TEXT REFERENCES "user" ("id") ON DELETE SET NULL,
  cancelled_at TIMESTAMPTZ,
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, number),
  FOREIGN KEY (term_id, organization_id) REFERENCES term (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (scope_campus_id, organization_id) REFERENCES campus (team_id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (scope_class_level_id, organization_id) REFERENCES class_level (id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT billing_run_scope_matches CHECK (
    (scope = 'school' AND scope_campus_id IS NULL AND scope_class_level_id IS NULL)
    OR (scope = 'campus' AND scope_campus_id IS NOT NULL AND scope_class_level_id IS NULL)
    OR (scope = 'level' AND scope_campus_id IS NULL AND scope_class_level_id IS NOT NULL)
  ),
  CONSTRAINT billing_run_issued_columns CHECK ((status = 'issued') = (issued_at IS NOT NULL)),
  CONSTRAINT billing_run_cancelled_columns CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL))
);

CREATE INDEX billing_run_term_idx ON billing_run (organization_id, term_id);

CREATE INDEX billing_run_created_idx ON billing_run (organization_id, created_at DESC);

CREATE INDEX billing_run_scope_campus_idx ON billing_run (organization_id, scope_campus_id);

-- migrate:down
DROP TABLE billing_run;
