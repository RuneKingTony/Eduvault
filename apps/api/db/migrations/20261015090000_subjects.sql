-- migrate:up
CREATE TABLE subject (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE RESTRICT,
  code TEXT NOT NULL CHECK (code ~ '^[A-Z]{1,5}$'),
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  retired_at TIMESTAMPTZ,
  retired_by TEXT REFERENCES "user" ("id") ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, organization_id),
  CONSTRAINT subject_code_unique UNIQUE (organization_id, code)
);

CREATE TABLE level_subject (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE RESTRICT,
  class_level_id UUID NOT NULL,
  subject_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('core', 'elective')),
  sequence INTEGER NOT NULL CHECK (sequence >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, organization_id),
  CONSTRAINT level_subject_level_subject_key UNIQUE (class_level_id, subject_id),
  FOREIGN KEY (class_level_id, organization_id) REFERENCES class_level (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (subject_id, organization_id) REFERENCES subject (id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX level_subject_subject_idx ON level_subject (organization_id, subject_id);

CREATE TABLE student_subject (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE RESTRICT,
  enrollment_id UUID NOT NULL,
  subject_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, organization_id),
  CONSTRAINT student_subject_enrollment_subject_key UNIQUE (enrollment_id, subject_id),
  FOREIGN KEY (enrollment_id, organization_id) REFERENCES student_enrollment (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (subject_id, organization_id) REFERENCES subject (id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX student_subject_subject_idx ON student_subject (organization_id, subject_id);

CREATE TABLE subject_teacher (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE RESTRICT,
  class_arm_id UUID NOT NULL,
  subject_id UUID NOT NULL,
  term_id UUID NOT NULL,
  user_id TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  assigned_by TEXT REFERENCES "user" ("id") ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, organization_id),
  CONSTRAINT subject_teacher_arm_subject_term_key UNIQUE (class_arm_id, subject_id, term_id),
  FOREIGN KEY (class_arm_id, organization_id) REFERENCES class_arm (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (subject_id, organization_id) REFERENCES subject (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (term_id, organization_id) REFERENCES term (id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX subject_teacher_scope_idx ON subject_teacher (organization_id, term_id, user_id);

CREATE INDEX subject_teacher_arm_idx ON subject_teacher (organization_id, class_arm_id, term_id);

-- migrate:down
DROP TABLE subject_teacher;

DROP TABLE student_subject;

DROP TABLE level_subject;

DROP TABLE subject;
