-- migrate:up
CREATE TABLE staff_leave (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK (type IN ('annual', 'sick', 'personal', 'study', 'parental')),
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  reason TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 500),
  cover TEXT CHECK (char_length(cover) <= 200),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'approved', 'rejected', 'cancelled')),
  created_by TEXT NOT NULL REFERENCES "user" ("id") ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_by TEXT REFERENCES "user" ("id") ON DELETE RESTRICT,
  approved_at TIMESTAMPTZ,
  rejected_by TEXT REFERENCES "user" ("id") ON DELETE RESTRICT,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT CHECK (char_length(btrim(rejection_reason)) BETWEEN 1 AND 500),
  cancelled_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, organization_id),
  CONSTRAINT staff_leave_dates CHECK (ends_on >= starts_on),
  CONSTRAINT staff_leave_approved_columns CHECK (
    (status = 'approved') = (approved_by IS NOT NULL AND approved_at IS NOT NULL)
  ),
  CONSTRAINT staff_leave_rejected_columns CHECK (
    (status = 'rejected') = (rejected_by IS NOT NULL AND rejected_at IS NOT NULL AND rejection_reason IS NOT NULL)
  ),
  CONSTRAINT staff_leave_cancelled_columns CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL)),
  CONSTRAINT staff_leave_approved_not_self CHECK (approved_by IS NULL OR approved_by <> created_by),
  CONSTRAINT staff_leave_rejected_not_self CHECK (rejected_by IS NULL OR rejected_by <> created_by),
  CONSTRAINT staff_leave_no_overlap EXCLUDE USING gist (
    organization_id WITH =,
    created_by WITH =,
    daterange(starts_on, ends_on, '[]') WITH &&
  ) WHERE (status IN ('submitted', 'approved'))
);

CREATE INDEX staff_leave_status_idx ON staff_leave (organization_id, status);

CREATE INDEX staff_leave_requester_idx ON staff_leave (organization_id, created_by, starts_on);

CREATE TRIGGER staff_leave_immutable
  BEFORE UPDATE OR DELETE ON staff_leave
  FOR EACH ROW EXECUTE FUNCTION approval_record_immutable();

-- migrate:down
DROP TRIGGER staff_leave_immutable ON staff_leave;

DROP TABLE staff_leave;
