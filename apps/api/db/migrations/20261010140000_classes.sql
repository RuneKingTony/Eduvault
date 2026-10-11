-- migrate:up
INSERT INTO class_level (organization_id, code, name, sequence)
SELECT o.id, l.code, l.name, l.sequence
FROM "organization" o
CROSS JOIN (
  VALUES
    ('P1', 'Primary 1', 1),
    ('P2', 'Primary 2', 2),
    ('P3', 'Primary 3', 3),
    ('P4', 'Primary 4', 4),
    ('P5', 'Primary 5', 5),
    ('P6', 'Primary 6', 6),
    ('JSS1', 'JSS 1', 7),
    ('JSS2', 'JSS 2', 8),
    ('JSS3', 'JSS 3', 9),
    ('SS1', 'SS 1', 10),
    ('SS2', 'SS 2', 11),
    ('SS3', 'SS 3', 12)
) AS l (code, name, sequence)
WHERE NOT EXISTS (
  SELECT 1 FROM class_level c WHERE c.organization_id = o.id
);

UPDATE class_level AS current
SET next_level_id = next.id
FROM class_level AS next
WHERE next.organization_id = current.organization_id
  AND next.sequence = current.sequence + 1
  AND current.next_level_id IS NULL;

CREATE TABLE class_arm (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE CASCADE,
  class_level_id UUID NOT NULL,
  campus_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (btrim(name) <> ''),
  retired_at TIMESTAMPTZ,
  retired_by TEXT REFERENCES "user" ("id") ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, organization_id),
  CONSTRAINT class_arm_name_unique UNIQUE (class_level_id, campus_id, name),
  FOREIGN KEY (class_level_id, organization_id) REFERENCES class_level (id, organization_id),
  FOREIGN KEY (campus_id, organization_id) REFERENCES campus (team_id, organization_id)
);

CREATE INDEX class_arm_scope_idx ON class_arm (organization_id, campus_id);

CREATE TABLE class_arm_teacher (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE CASCADE,
  class_arm_id UUID NOT NULL,
  session_id UUID NOT NULL,
  user_id TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('lead', 'assistant', 'uniform')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT REFERENCES "user" ("id") ON DELETE SET NULL,
  CONSTRAINT class_arm_teacher_unique UNIQUE (class_arm_id, session_id, user_id),
  FOREIGN KEY (class_arm_id, organization_id) REFERENCES class_arm (id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (session_id, organization_id) REFERENCES academic_session (id, organization_id)
);

CREATE UNIQUE INDEX class_arm_teacher_one_lead ON class_arm_teacher (class_arm_id, session_id) WHERE role = 'lead';

CREATE INDEX class_arm_teacher_scope_idx ON class_arm_teacher (organization_id, session_id, user_id);

-- migrate:down
DROP TABLE class_arm_teacher;

DROP TABLE class_arm;
