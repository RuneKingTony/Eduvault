-- migrate:up
CREATE TABLE student_discount (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE RESTRICT,
  student_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('percent', 'fixed')),
  value BIGINT NOT NULL CONSTRAINT student_discount_value_positive CHECK (value > 0),
  ledger_account_id UUID,
  reason TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 200),
  from_term_id UUID NOT NULL,
  to_term_id UUID,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'approved', 'rejected')),
  created_by TEXT REFERENCES "user" ("id") ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_by TEXT REFERENCES "user" ("id") ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejected_by TEXT REFERENCES "user" ("id") ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT CHECK (char_length(btrim(rejection_reason)) BETWEEN 1 AND 500),
  ended_at TIMESTAMPTZ,
  ended_by TEXT REFERENCES "user" ("id") ON DELETE SET NULL,
  UNIQUE (id, organization_id),
  FOREIGN KEY (student_id, organization_id) REFERENCES student (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (ledger_account_id, organization_id) REFERENCES ledger_account (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (from_term_id, organization_id) REFERENCES term (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (to_term_id, organization_id) REFERENCES term (id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT student_discount_percent_range CHECK (kind <> 'percent' OR value <= 100),
  CONSTRAINT student_discount_approved_columns CHECK ((status = 'approved') = (approved_at IS NOT NULL)),
  CONSTRAINT student_discount_rejected_columns CHECK (
    (status = 'rejected') = (rejected_at IS NOT NULL AND rejected_by IS NOT NULL AND rejection_reason IS NOT NULL)
  ),
  CONSTRAINT student_discount_approved_not_self CHECK (approved_by IS NULL OR approved_by <> created_by),
  CONSTRAINT student_discount_rejected_not_self CHECK (rejected_by IS NULL OR rejected_by <> created_by)
);

CREATE INDEX student_discount_student_idx ON student_discount (organization_id, student_id, status);

CREATE INDEX student_discount_ledger_account_idx ON student_discount (organization_id, ledger_account_id);

-- migrate:down
DROP TABLE student_discount;
