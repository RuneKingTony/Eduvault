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
      'wallet_topup_void',
      'wallet_credit_migration'
    )
  );

-- migrate:down
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM journal_entry WHERE kind = 'wallet_credit_migration') THEN
    RAISE EXCEPTION 'credit has been moved into family wallets, so this migration cannot be rolled back'
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

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
