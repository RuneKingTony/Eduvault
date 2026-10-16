-- migrate:up
CREATE TABLE student_fee_option (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE RESTRICT,
  enrollment_id UUID NOT NULL,
  ledger_account_id UUID NOT NULL,
  created_by TEXT REFERENCES "user" ("id") ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT student_fee_option_enrollment_account_key UNIQUE (enrollment_id, ledger_account_id),
  FOREIGN KEY (enrollment_id, organization_id) REFERENCES student_enrollment (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (ledger_account_id, organization_id) REFERENCES ledger_account (id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX student_fee_option_org_idx ON student_fee_option (organization_id, ledger_account_id);

-- migrate:down
DROP TABLE student_fee_option;
