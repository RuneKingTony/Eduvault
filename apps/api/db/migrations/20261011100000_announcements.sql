-- migrate:up
CREATE TABLE announcement (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE RESTRICT,
  campus_id TEXT,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  tag TEXT NOT NULL CHECK (tag IN ('general', 'academics', 'event', 'fees')),
  status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'withdrawn')),
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  published_on DATE,
  withdrawn_at TIMESTAMPTZ,
  created_by TEXT NOT NULL REFERENCES "user" ("id"),
  updated_by TEXT REFERENCES "user" ("id"),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (campus_id, organization_id) REFERENCES campus (team_id, organization_id),
  CHECK (NOT pinned OR status = 'published'),
  CHECK (status <> 'published' OR published_on IS NOT NULL)
);

CREATE INDEX announcement_status_published_idx ON announcement (organization_id, status, published_on DESC);

-- migrate:down
DROP TABLE announcement;
