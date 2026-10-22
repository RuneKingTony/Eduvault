-- migrate:up
UPDATE staff_leave SET type = 'maternity' WHERE type = 'parental';
ALTER TABLE staff_leave DROP CONSTRAINT staff_leave_type_check;
ALTER TABLE staff_leave
  ADD CONSTRAINT staff_leave_type_check
  CHECK (type IN ('sick', 'maternity', 'bereavement'));

-- migrate:down
ALTER TABLE staff_leave DROP CONSTRAINT staff_leave_type_check;
UPDATE staff_leave SET type = 'parental' WHERE type = 'maternity';
ALTER TABLE staff_leave
  ADD CONSTRAINT staff_leave_type_check
  CHECK (type IN ('annual', 'sick', 'personal', 'study', 'parental'));
