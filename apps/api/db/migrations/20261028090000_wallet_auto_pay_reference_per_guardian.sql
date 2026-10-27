-- migrate:up
ALTER TABLE wallet_auto_pay_setting
  DROP CONSTRAINT wallet_auto_pay_setting_organization_id_reference_key;

ALTER TABLE wallet_auto_pay_setting
  ADD CONSTRAINT wallet_auto_pay_setting_guardian_reference_key
  UNIQUE (organization_id, guardian_id, reference);

-- migrate:down
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM wallet_auto_pay_setting
    GROUP BY organization_id, reference
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'two families share an auto-pay reference, so this migration cannot be rolled back'
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

ALTER TABLE wallet_auto_pay_setting
  DROP CONSTRAINT wallet_auto_pay_setting_guardian_reference_key;

ALTER TABLE wallet_auto_pay_setting
  ADD UNIQUE (organization_id, reference);
