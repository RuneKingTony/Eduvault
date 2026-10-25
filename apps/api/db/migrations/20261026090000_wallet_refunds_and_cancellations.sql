-- migrate:up
ALTER TABLE journal_entry DROP CONSTRAINT journal_entry_kind_check;

ALTER TABLE journal_entry
  ADD CONSTRAINT journal_entry_kind_check CHECK (
    kind IN (
      'invoice',
      'adhoc',
      'payment',
      'payment_void',
      'adjustment',
      'opening',
      'store',
      'store_receive',
      'store_cost',
      'store_count',
      'wallet_topup',
      'wallet_spend',
      'wallet_refund',
      'wallet_topup_void'
    )
  );

ALTER TABLE file_object DROP CONSTRAINT file_object_kind_check;

ALTER TABLE file_object
  ADD CONSTRAINT file_object_kind_check CHECK (
    kind IN ('school_logo', 'guardian_photo', 'payment_proof', 'wallet_proof', 'wallet_refund_request')
  );

CREATE TABLE wallet_refund (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE RESTRICT,
  wallet_id UUID NOT NULL,
  money_account_id UUID NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  parent_email TEXT NOT NULL CHECK (char_length(btrim(parent_email)) BETWEEN 3 AND 200),
  reason TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 500),
  proof_file_id UUID NOT NULL,
  reference TEXT NOT NULL CHECK (char_length(btrim(reference)) BETWEEN 1 AND 80),
  request_hash TEXT NOT NULL,
  payout_reference TEXT CHECK (char_length(btrim(payout_reference)) BETWEEN 1 AND 80),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'approved', 'rejected')),
  created_by TEXT REFERENCES "user" ("id") ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_by TEXT REFERENCES "user" ("id") ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejected_by TEXT REFERENCES "user" ("id") ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT CHECK (char_length(btrim(rejection_reason)) BETWEEN 1 AND 500),
  journal_entry_id UUID,
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, reference),
  UNIQUE (proof_file_id),
  FOREIGN KEY (wallet_id, organization_id) REFERENCES wallet (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (money_account_id, organization_id) REFERENCES money_account (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (proof_file_id, organization_id) REFERENCES file_object (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (journal_entry_id, organization_id) REFERENCES journal_entry (id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT wallet_refund_approved_columns CHECK (
    (status = 'approved') = (approved_at IS NOT NULL AND payout_reference IS NOT NULL AND journal_entry_id IS NOT NULL)
  ),
  CONSTRAINT wallet_refund_rejected_columns CHECK (
    (status = 'rejected') = (rejected_at IS NOT NULL AND rejected_by IS NOT NULL AND rejection_reason IS NOT NULL)
  )
);

CREATE UNIQUE INDEX wallet_refund_payout_reference_key ON wallet_refund (organization_id, payout_reference)
  WHERE payout_reference IS NOT NULL;

CREATE UNIQUE INDEX wallet_refund_journal_entry_key ON wallet_refund (journal_entry_id)
  WHERE journal_entry_id IS NOT NULL;

CREATE INDEX wallet_refund_wallet_idx ON wallet_refund (organization_id, wallet_id, status);

CREATE INDEX wallet_refund_listing_idx ON wallet_refund (organization_id, created_at DESC);

CREATE INDEX wallet_refund_waiting_idx ON wallet_refund (organization_id, status)
  WHERE status = 'submitted';

CREATE TRIGGER wallet_refund_immutable
  BEFORE UPDATE OR DELETE ON wallet_refund
  FOR EACH ROW EXECUTE FUNCTION approval_record_immutable();

CREATE TABLE wallet_topup_cancellation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE RESTRICT,
  wallet_topup_id UUID NOT NULL,
  reason TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 500),
  reference TEXT NOT NULL CHECK (char_length(btrim(reference)) BETWEEN 1 AND 80),
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'approved', 'rejected')),
  created_by TEXT REFERENCES "user" ("id") ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_by TEXT REFERENCES "user" ("id") ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejected_by TEXT REFERENCES "user" ("id") ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT CHECK (char_length(btrim(rejection_reason)) BETWEEN 1 AND 500),
  journal_entry_id UUID,
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, reference),
  FOREIGN KEY (wallet_topup_id, organization_id) REFERENCES wallet_topup (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (journal_entry_id, organization_id) REFERENCES journal_entry (id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT wallet_topup_cancellation_approved_columns CHECK (
    (status = 'approved') = (approved_at IS NOT NULL AND journal_entry_id IS NOT NULL)
  ),
  CONSTRAINT wallet_topup_cancellation_rejected_columns CHECK (
    (status = 'rejected') = (rejected_at IS NOT NULL AND rejected_by IS NOT NULL AND rejection_reason IS NOT NULL)
  )
);

CREATE UNIQUE INDEX wallet_topup_cancellation_open_key ON wallet_topup_cancellation (wallet_topup_id)
  WHERE status IN ('submitted', 'approved');

CREATE UNIQUE INDEX wallet_topup_cancellation_journal_entry_key ON wallet_topup_cancellation (journal_entry_id)
  WHERE journal_entry_id IS NOT NULL;

CREATE INDEX wallet_topup_cancellation_listing_idx ON wallet_topup_cancellation (organization_id, created_at DESC);

CREATE INDEX wallet_topup_cancellation_waiting_idx ON wallet_topup_cancellation (organization_id, status)
  WHERE status = 'submitted';

CREATE TRIGGER wallet_topup_cancellation_immutable
  BEFORE UPDATE OR DELETE ON wallet_topup_cancellation
  FOR EACH ROW EXECUTE FUNCTION approval_record_immutable();

-- migrate:down
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM wallet_refund)
    OR EXISTS (SELECT 1 FROM wallet_topup_cancellation)
    OR EXISTS (SELECT 1 FROM journal_entry WHERE kind IN ('wallet_refund', 'wallet_topup_void'))
    OR EXISTS (SELECT 1 FROM file_object WHERE kind = 'wallet_refund_request')
  THEN
    RAISE EXCEPTION 'wallet refunds or top-up cancellations have been recorded, so this migration cannot be rolled back'
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

DROP TABLE wallet_topup_cancellation;

DROP TABLE wallet_refund;

ALTER TABLE file_object DROP CONSTRAINT file_object_kind_check;

ALTER TABLE file_object
  ADD CONSTRAINT file_object_kind_check CHECK (
    kind IN ('school_logo', 'guardian_photo', 'payment_proof', 'wallet_proof')
  );

ALTER TABLE journal_entry DROP CONSTRAINT journal_entry_kind_check;

ALTER TABLE journal_entry
  ADD CONSTRAINT journal_entry_kind_check CHECK (
    kind IN (
      'invoice',
      'adhoc',
      'payment',
      'payment_void',
      'adjustment',
      'opening',
      'store',
      'store_receive',
      'store_cost',
      'store_count',
      'wallet_topup',
      'wallet_spend'
    )
  );
