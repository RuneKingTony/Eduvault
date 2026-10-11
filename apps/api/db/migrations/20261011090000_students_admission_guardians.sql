-- migrate:up
DROP TABLE student;

CREATE TABLE student (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE RESTRICT,
  campus_id TEXT NOT NULL,
  first_name TEXT NOT NULL CHECK (char_length(btrim(first_name)) BETWEEN 1 AND 80),
  last_name TEXT NOT NULL CHECK (char_length(btrim(last_name)) BETWEEN 1 AND 80),
  gender TEXT NOT NULL CHECK (gender IN ('F', 'M')),
  date_of_birth DATE NOT NULL,
  admission_number TEXT NOT NULL,
  admitted_on DATE NOT NULL,
  user_id TEXT REFERENCES "user" ("id") ON DELETE SET NULL,
  created_by TEXT REFERENCES "user" ("id") ON DELETE SET NULL,
  not_seen_since DATE,
  not_seen_by TEXT REFERENCES "user" ("id") ON DELETE SET NULL,
  not_seen_note TEXT CHECK (char_length(not_seen_note) <= 500),
  exit_kind TEXT CHECK (exit_kind IN ('left', 'graduated')),
  exit_reason TEXT CHECK (
    exit_reason IN (
      'did_not_return',
      'relocated',
      'transferred',
      'fees',
      'expelled',
      'other',
      'completed'
    )
  ),
  exit_note TEXT CHECK (char_length(exit_note) <= 500),
  last_day DATE,
  graduated_session_id UUID,
  archived_at TIMESTAMPTZ,
  archived_by TEXT REFERENCES "user" ("id") ON DELETE SET NULL,
  archived_term_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, admission_number),
  UNIQUE (organization_id, user_id),
  FOREIGN KEY (campus_id, organization_id) REFERENCES campus (team_id, organization_id),
  FOREIGN KEY (graduated_session_id, organization_id) REFERENCES academic_session (id, organization_id),
  FOREIGN KEY (archived_term_id, organization_id) REFERENCES term (id, organization_id),
  CONSTRAINT student_not_seen_together CHECK (
    not_seen_since IS NOT NULL OR (not_seen_by IS NULL AND not_seen_note IS NULL)
  ),
  CONSTRAINT student_exit_together CHECK (
    (
      exit_kind IS NULL
      AND exit_reason IS NULL
      AND exit_note IS NULL
      AND last_day IS NULL
      AND graduated_session_id IS NULL
      AND archived_at IS NULL
      AND archived_by IS NULL
      AND archived_term_id IS NULL
    )
    OR (
      exit_kind IS NOT NULL
      AND exit_reason IS NOT NULL
      AND archived_at IS NOT NULL
      AND archived_term_id IS NOT NULL
    )
  ),
  CONSTRAINT student_exit_completed_check CHECK (
    exit_kind IS NULL OR ((exit_kind = 'graduated') = (exit_reason = 'completed'))
  )
);

CREATE INDEX student_organization_campus_idx ON student (organization_id, campus_id);

CREATE INDEX student_organization_name_idx ON student (organization_id, last_name, first_name);

CREATE INDEX student_duplicate_idx ON student (
  organization_id,
  lower(last_name),
  lower(first_name),
  date_of_birth
);

CREATE TABLE student_enrollment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE RESTRICT,
  student_id UUID NOT NULL,
  session_id UUID NOT NULL,
  class_level_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'withdrawn', 'completed')),
  is_new_student BOOLEAN NOT NULL DEFAULT FALSE,
  created_by TEXT REFERENCES "user" ("id") ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, organization_id),
  CONSTRAINT student_enrollment_student_session_key UNIQUE (student_id, session_id),
  FOREIGN KEY (student_id, organization_id) REFERENCES student (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (session_id, organization_id) REFERENCES academic_session (id, organization_id),
  FOREIGN KEY (class_level_id, organization_id) REFERENCES class_level (id, organization_id)
);

CREATE INDEX student_enrollment_session_idx ON student_enrollment (organization_id, session_id);

CREATE TABLE enrollment_placement (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE RESTRICT,
  enrollment_id UUID NOT NULL,
  term_id UUID NOT NULL,
  class_arm_id UUID NOT NULL,
  campus_id TEXT NOT NULL,
  created_by TEXT REFERENCES "user" ("id") ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT enrollment_placement_enrollment_term_key UNIQUE (enrollment_id, term_id),
  FOREIGN KEY (enrollment_id, organization_id) REFERENCES student_enrollment (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (term_id, organization_id) REFERENCES term (id, organization_id),
  FOREIGN KEY (class_arm_id, organization_id) REFERENCES class_arm (id, organization_id),
  FOREIGN KEY (campus_id, organization_id) REFERENCES campus (team_id, organization_id)
);

CREATE INDEX enrollment_placement_campus_idx ON enrollment_placement (organization_id, term_id, campus_id);

CREATE INDEX enrollment_placement_arm_idx ON enrollment_placement (organization_id, term_id, class_arm_id);

CREATE TABLE guardian (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE RESTRICT,
  full_name TEXT NOT NULL CHECK (char_length(btrim(full_name)) BETWEEN 1 AND 120),
  phone TEXT NOT NULL CHECK (char_length(phone) BETWEEN 7 AND 20),
  email TEXT,
  address TEXT CHECK (char_length(address) <= 200),
  photo_file_id UUID,
  user_id TEXT NOT NULL REFERENCES "user" ("id") ON DELETE RESTRICT,
  created_by TEXT REFERENCES "user" ("id") ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, user_id),
  CONSTRAINT guardian_photo_file_id_key UNIQUE (photo_file_id),
  CONSTRAINT guardian_photo_file_fkey FOREIGN KEY (photo_file_id, organization_id)
    REFERENCES file_object (id, organization_id) ON DELETE SET NULL (photo_file_id)
);

CREATE UNIQUE INDEX guardian_email_unique ON guardian (organization_id, lower(email))
  WHERE email IS NOT NULL;

CREATE INDEX guardian_user_idx ON guardian (user_id);

CREATE TABLE guardian_student (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE RESTRICT,
  guardian_id UUID NOT NULL,
  student_id UUID NOT NULL,
  relationship TEXT NOT NULL CHECK (relationship IN ('mother', 'father', 'guardian')),
  pays_fees BOOLEAN NOT NULL DEFAULT FALSE,
  created_by TEXT REFERENCES "user" ("id") ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT guardian_student_guardian_student_key UNIQUE (guardian_id, student_id),
  FOREIGN KEY (guardian_id, organization_id) REFERENCES guardian (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (student_id, organization_id) REFERENCES student (id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX guardian_student_student_idx ON guardian_student (organization_id, student_id);

CREATE TABLE document_sequence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('admission')),
  year SMALLINT,
  next_value INTEGER NOT NULL CHECK (next_value > 0),
  CONSTRAINT document_sequence_key UNIQUE NULLS NOT DISTINCT (organization_id, kind, year)
);

CREATE TABLE activity_event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE RESTRICT,
  campus_id TEXT,
  pillar TEXT NOT NULL CHECK (pillar IN ('foundation', 'finance', 'access', 'platform')),
  kind TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  text TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (campus_id, organization_id) REFERENCES campus (team_id, organization_id)
);

CREATE INDEX activity_event_time_idx ON activity_event (organization_id, occurred_at DESC);

CREATE INDEX activity_event_subject_idx ON activity_event (organization_id, subject_type, subject_id);

CREATE FUNCTION activity_event_refuse_change() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'activity_event is append-only';
END;
$$;

CREATE TRIGGER activity_event_append_only
  BEFORE UPDATE OR DELETE ON activity_event
  FOR EACH ROW EXECUTE FUNCTION activity_event_refuse_change();

ALTER TABLE file_object DROP CONSTRAINT file_object_kind_check;

ALTER TABLE file_object
  ADD CONSTRAINT file_object_kind_check CHECK (kind IN ('school_logo', 'guardian_photo'));

-- migrate:down
DELETE FROM file_object WHERE kind = 'guardian_photo';

ALTER TABLE file_object DROP CONSTRAINT file_object_kind_check;

ALTER TABLE file_object
  ADD CONSTRAINT file_object_kind_check CHECK (kind = 'school_logo');

DROP TRIGGER activity_event_append_only ON activity_event;

DROP FUNCTION activity_event_refuse_change();

DROP TABLE activity_event;

DROP TABLE document_sequence;

DROP TABLE guardian_student;

DROP TABLE guardian;

DROP TABLE enrollment_placement;

DROP TABLE student_enrollment;

DROP TABLE student;

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
