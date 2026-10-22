-- migrate:up
ALTER TABLE adjustment
  DROP CONSTRAINT adjustment_approved_not_self,
  DROP CONSTRAINT adjustment_rejected_not_self;
ALTER TABLE payment_void
  DROP CONSTRAINT payment_void_approved_not_self,
  DROP CONSTRAINT payment_void_rejected_not_self;
ALTER TABLE staff_leave
  DROP CONSTRAINT staff_leave_approved_not_self,
  DROP CONSTRAINT staff_leave_rejected_not_self,
  DROP CONSTRAINT staff_leave_cancelled_not_self;
ALTER TABLE stock_count
  DROP CONSTRAINT stock_count_approved_not_self,
  DROP CONSTRAINT stock_count_rejected_not_self;
ALTER TABLE student_discount
  DROP CONSTRAINT student_discount_approved_not_self,
  DROP CONSTRAINT student_discount_rejected_not_self;

-- migrate:down
ALTER TABLE adjustment
  ADD CONSTRAINT adjustment_approved_not_self CHECK (approved_by IS NULL OR approved_by <> created_by),
  ADD CONSTRAINT adjustment_rejected_not_self CHECK (rejected_by IS NULL OR rejected_by <> created_by);
ALTER TABLE payment_void
  ADD CONSTRAINT payment_void_approved_not_self CHECK (approved_by IS NULL OR approved_by <> created_by),
  ADD CONSTRAINT payment_void_rejected_not_self CHECK (rejected_by IS NULL OR rejected_by <> created_by);
ALTER TABLE staff_leave
  ADD CONSTRAINT staff_leave_approved_not_self CHECK (approved_by IS NULL OR approved_by <> created_by),
  ADD CONSTRAINT staff_leave_rejected_not_self CHECK (rejected_by IS NULL OR rejected_by <> created_by),
  ADD CONSTRAINT staff_leave_cancelled_not_self CHECK (cancelled_by IS NULL OR cancelled_by <> created_by);
ALTER TABLE stock_count
  ADD CONSTRAINT stock_count_approved_not_self CHECK (approved_by IS NULL OR approved_by <> created_by),
  ADD CONSTRAINT stock_count_rejected_not_self CHECK (rejected_by IS NULL OR rejected_by <> created_by);
ALTER TABLE student_discount
  ADD CONSTRAINT student_discount_approved_not_self CHECK (approved_by IS NULL OR approved_by <> created_by),
  ADD CONSTRAINT student_discount_rejected_not_self CHECK (rejected_by IS NULL OR rejected_by <> created_by);
