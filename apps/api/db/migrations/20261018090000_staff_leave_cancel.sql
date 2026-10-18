-- migrate:up
ALTER TABLE staff_leave
  ADD COLUMN cancelled_by TEXT REFERENCES "user" ("id") ON DELETE RESTRICT,
  ADD COLUMN cancellation_reason TEXT CHECK (char_length(btrim(cancellation_reason)) BETWEEN 1 AND 500);

ALTER TABLE staff_leave
  DROP CONSTRAINT staff_leave_approved_columns,
  ADD CONSTRAINT staff_leave_approved_columns CHECK (
    (status = 'approved' OR cancelled_by IS NOT NULL) = (approved_by IS NOT NULL AND approved_at IS NOT NULL)
  ),
  ADD CONSTRAINT staff_leave_cancelled_by_columns CHECK (
    (cancelled_by IS NOT NULL) = (cancellation_reason IS NOT NULL)
  ),
  ADD CONSTRAINT staff_leave_cancelled_by_status CHECK (cancelled_by IS NULL OR status = 'cancelled'),
  ADD CONSTRAINT staff_leave_cancelled_not_self CHECK (cancelled_by IS NULL OR cancelled_by <> created_by);

CREATE FUNCTION staff_leave_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE
  cancel_columns CONSTANT text[] := ARRAY['status', 'cancelled_by', 'cancelled_at', 'cancellation_reason', 'updated_at'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'a staff_leave is never deleted'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'staff_leave_never_deleted';
  END IF;
  IF OLD.status = 'submitted' THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'approved' AND NEW.status = 'cancelled'
    AND to_jsonb(NEW) - cancel_columns = to_jsonb(OLD) - cancel_columns THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'a decided staff_leave cannot change'
    USING ERRCODE = 'check_violation', CONSTRAINT = 'staff_leave_decided_frozen';
END;
$$;

DROP TRIGGER staff_leave_immutable ON staff_leave;

CREATE TRIGGER staff_leave_immutable
  BEFORE UPDATE OR DELETE ON staff_leave
  FOR EACH ROW EXECUTE FUNCTION staff_leave_guard();

CREATE TABLE staff_leave_seen (
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  seen_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (organization_id, user_id)
);

INSERT INTO staff_leave_seen (organization_id, user_id, seen_at)
SELECT organization_id, created_by, now()
FROM staff_leave
GROUP BY organization_id, created_by;

-- migrate:down
DROP TABLE staff_leave_seen;

DROP TRIGGER staff_leave_immutable ON staff_leave;

ALTER TABLE staff_leave
  DROP CONSTRAINT staff_leave_cancelled_not_self,
  DROP CONSTRAINT staff_leave_cancelled_by_status,
  DROP CONSTRAINT staff_leave_cancelled_by_columns,
  DROP CONSTRAINT staff_leave_approved_columns;

UPDATE staff_leave
  SET approved_by = NULL, approved_at = NULL
  WHERE cancelled_by IS NOT NULL;

ALTER TABLE staff_leave
  DROP COLUMN cancellation_reason,
  DROP COLUMN cancelled_by,
  ADD CONSTRAINT staff_leave_approved_columns CHECK (
    (status = 'approved') = (approved_by IS NOT NULL AND approved_at IS NOT NULL)
  );

CREATE TRIGGER staff_leave_immutable
  BEFORE UPDATE OR DELETE ON staff_leave
  FOR EACH ROW EXECUTE FUNCTION approval_record_immutable();

DROP FUNCTION staff_leave_guard();
