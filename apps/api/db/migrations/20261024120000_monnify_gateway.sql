-- migrate:up
CREATE TABLE gateway_connection (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('sandbox', 'live')),
  contract_code TEXT NOT NULL CHECK (char_length(btrim(contract_code)) BETWEEN 1 AND 60),
  api_key_enc TEXT NOT NULL CHECK (char_length(api_key_enc) > 0),
  api_key_tail TEXT NOT NULL CHECK (char_length(api_key_tail) BETWEEN 1 AND 4),
  secret_key_enc TEXT NOT NULL CHECK (char_length(secret_key_enc) > 0),
  secret_key_tail TEXT NOT NULL CHECK (char_length(secret_key_tail) BETWEEN 1 AND 4),
  last_tested_at TIMESTAMPTZ,
  last_test_ok BOOLEAN,
  updated_by TEXT NOT NULL REFERENCES "user" ("id") ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id),
  CONSTRAINT gateway_connection_test_pair CHECK ((last_tested_at IS NULL) = (last_test_ok IS NULL))
);

CREATE TABLE wallet_reserved_account (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE RESTRICT,
  wallet_id UUID NOT NULL,
  account_reference TEXT NOT NULL CHECK (char_length(btrim(account_reference)) BETWEEN 1 AND 80),
  account_number TEXT NOT NULL CHECK (char_length(btrim(account_number)) BETWEEN 1 AND 30),
  bank_name TEXT NOT NULL CHECK (char_length(btrim(bank_name)) BETWEEN 1 AND 120),
  account_name TEXT NOT NULL CHECK (char_length(btrim(account_name)) BETWEEN 1 AND 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, wallet_id),
  UNIQUE (organization_id, account_reference),
  UNIQUE (organization_id, bank_name, account_number),
  FOREIGN KEY (wallet_id, organization_id) REFERENCES wallet (id, organization_id) ON DELETE RESTRICT
);

CREATE TRIGGER wallet_reserved_account_append_only
  BEFORE UPDATE OR DELETE ON wallet_reserved_account
  FOR EACH ROW EXECUTE FUNCTION wallet_append_only();

CREATE TABLE gateway_topup (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE RESTRICT,
  wallet_id UUID NOT NULL,
  reserved_account_id UUID NOT NULL,
  reference TEXT NOT NULL CHECK (char_length(btrim(reference)) BETWEEN 1 AND 120),
  payment_reference TEXT NOT NULL CHECK (char_length(btrim(payment_reference)) BETWEEN 1 AND 120),
  gross_minor BIGINT NOT NULL,
  fee_minor BIGINT NOT NULL,
  net_minor BIGINT NOT NULL,
  paid_at TIMESTAMPTZ NOT NULL,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  signature_verified BOOLEAN NOT NULL,
  journal_entry_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, reference),
  UNIQUE (journal_entry_id),
  FOREIGN KEY (wallet_id, organization_id) REFERENCES wallet (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (reserved_account_id, organization_id) REFERENCES wallet_reserved_account (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (journal_entry_id, organization_id) REFERENCES journal_entry (id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT gateway_topup_net_positive CHECK (net_minor > 0),
  CONSTRAINT gateway_topup_fee_not_negative CHECK (fee_minor >= 0),
  CONSTRAINT gateway_topup_gross_is_net_plus_fee CHECK (gross_minor = net_minor + fee_minor),
  CONSTRAINT gateway_topup_signature_verified CHECK (signature_verified)
);

CREATE INDEX gateway_topup_wallet_idx ON gateway_topup (organization_id, wallet_id, created_at DESC);

CREATE TRIGGER gateway_topup_append_only
  BEFORE UPDATE OR DELETE ON gateway_topup
  FOR EACH ROW EXECUTE FUNCTION wallet_append_only();

-- migrate:down
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM gateway_topup) THEN
    RAISE EXCEPTION 'online payments have been posted, so this migration cannot be rolled back'
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

DROP TABLE gateway_topup;

DROP TABLE wallet_reserved_account;

DROP TABLE gateway_connection;
