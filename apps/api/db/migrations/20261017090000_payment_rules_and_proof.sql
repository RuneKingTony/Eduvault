-- migrate:up
ALTER TABLE school_setting
  ADD COLUMN pay_cash BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN pay_transfer BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN pay_pos BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN receipt_footer TEXT NOT NULL DEFAULT 'Thank you for your payment.',
  ADD CONSTRAINT school_setting_pay_method_check CHECK (pay_cash OR pay_transfer OR pay_pos),
  ADD CONSTRAINT school_setting_receipt_footer_check CHECK (char_length(receipt_footer) <= 120);

ALTER TABLE file_object DROP CONSTRAINT file_object_kind_check;

ALTER TABLE file_object
  ADD CONSTRAINT file_object_kind_check CHECK (kind IN ('school_logo', 'guardian_photo', 'payment_proof'));

DROP INDEX journal_line_account_student_idx;

CREATE INDEX journal_line_account_student_idx ON journal_line (organization_id, ledger_account_id, student_id)
  INCLUDE (debit_minor, credit_minor);

-- migrate:down
DROP INDEX journal_line_account_student_idx;

CREATE INDEX journal_line_account_student_idx ON journal_line (organization_id, ledger_account_id, student_id);

DELETE FROM file_object WHERE kind = 'payment_proof';

ALTER TABLE file_object DROP CONSTRAINT file_object_kind_check;

ALTER TABLE file_object
  ADD CONSTRAINT file_object_kind_check CHECK (kind IN ('school_logo', 'guardian_photo'));

ALTER TABLE school_setting
  DROP CONSTRAINT school_setting_receipt_footer_check,
  DROP CONSTRAINT school_setting_pay_method_check,
  DROP COLUMN receipt_footer,
  DROP COLUMN pay_pos,
  DROP COLUMN pay_transfer,
  DROP COLUMN pay_cash;
