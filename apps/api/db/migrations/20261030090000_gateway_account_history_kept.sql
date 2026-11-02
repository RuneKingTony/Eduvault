-- migrate:up
CREATE FUNCTION money_account_gateway_history_kept() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM journal_line
    WHERE organization_id = OLD.organization_id AND ledger_account_id = OLD.ledger_account_id
  ) THEN
    RAISE EXCEPTION 'a gateway account with history is never deleted'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'money_account_gateway_history_kept';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER money_account_gateway_history_kept
  BEFORE DELETE ON money_account
  FOR EACH ROW WHEN (OLD.kind = 'gateway')
  EXECUTE FUNCTION money_account_gateway_history_kept();

-- migrate:down
DROP TRIGGER money_account_gateway_history_kept ON money_account;
DROP FUNCTION money_account_gateway_history_kept();
