-- migrate:up
ALTER TABLE school_account ADD COLUMN suspended_at TIMESTAMPTZ;

ALTER TABLE school_account ADD COLUMN suspended_by TEXT REFERENCES "user" ("id") ON DELETE RESTRICT;

ALTER TABLE school_account
  ADD CONSTRAINT school_account_suspended_check CHECK ((suspended_at IS NULL) = (suspended_by IS NULL));

CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('acting', 'platform')),
  actor_user_id TEXT NOT NULL REFERENCES "user" ("id") ON DELETE RESTRICT,
  organization_id TEXT REFERENCES "organization" ("id") ON DELETE RESTRICT,
  method TEXT,
  action TEXT CHECK (action IN ('school.create', 'school.suspend', 'school.reactivate', 'school.replaceOwner')),
  path TEXT NOT NULL,
  status SMALLINT NOT NULL,
  reason TEXT CHECK (char_length(reason) BETWEEN 1 AND 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT audit_log_shape_check CHECK (
    (kind = 'acting' AND method IS NOT NULL AND organization_id IS NOT NULL AND action IS NULL)
    OR (kind = 'platform' AND action IS NOT NULL AND method IS NULL)
  )
);

CREATE INDEX audit_log_organization_created_idx ON audit_log (organization_id, created_at DESC);

CREATE INDEX audit_log_created_idx ON audit_log (created_at DESC);

CREATE FUNCTION audit_log_refuse_change() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$;

CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_refuse_change();

-- migrate:down
DROP TRIGGER audit_log_append_only ON audit_log;

DROP FUNCTION audit_log_refuse_change();

DROP TABLE audit_log;

ALTER TABLE school_account DROP CONSTRAINT school_account_suspended_check;

ALTER TABLE school_account DROP COLUMN suspended_by;

ALTER TABLE school_account DROP COLUMN suspended_at;
