import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRoundIcon } from 'lucide-react';
import {
  ADMIT_DOB_MESSAGE,
  ADMIT_FIRST_NAME_REQUIRED,
  ADMIT_LAST_NAME_REQUIRED,
  updateStudentSchema,
  type LoginCredential,
  type StudentDetail,
  type UpdateStudentInput,
} from '@eduvault/api-contract';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ErrorMessage,
  FieldError,
  SelectField,
  TextField,
  toast,
} from '@eduvault/ui';
import { useApi } from '../api';
import { invalidateStudents } from '../queries';
import { useToday } from './calendar/use-today';

type Fields = 'firstName' | 'lastName' | 'dateOfBirth';
type FormValues = Record<Fields, string> & { gender: 'F' | 'M' };

interface DialogProps {
  student: StudentDetail;
  onClose: () => void;
}

type Errors = Partial<Record<Fields, string>>;
type Facts = Pick<
  StudentDetail,
  'firstName' | 'lastName' | 'gender' | 'dateOfBirth'
>;

function valueErrors(values: FormValues, today: string): Errors {
  const errors: Errors = {};
  if (values.firstName.trim() === '') {
    errors.firstName = ADMIT_FIRST_NAME_REQUIRED;
  }
  if (values.lastName.trim() === '') {
    errors.lastName = ADMIT_LAST_NAME_REQUIRED;
  }
  if (values.dateOfBirth === '' || values.dateOfBirth > today) {
    errors.dateOfBirth = ADMIT_DOB_MESSAGE;
  }
  return errors;
}

const ifChanged = <K extends keyof Facts>(
  key: K,
  values: FormValues,
  student: Facts
): Partial<Pick<Facts, K>> =>
  values[key].trim() === student[key]
    ? {}
    : ({ [key]: values[key] } as Pick<Facts, K>);

function changedFields(student: Facts, values: FormValues): UpdateStudentInput {
  return updateStudentSchema.parse({
    ...ifChanged('firstName', values, student),
    ...ifChanged('lastName', values, student),
    ...ifChanged('gender', values, student),
    ...ifChanged('dateOfBirth', values, student),
  });
}

function useEditStudent(student: StudentDetail, onClose: () => void) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateStudentInput) =>
      api.students.update({ params: { id: student.id }, body }),
    onSuccess: async () => {
      await invalidateStudents(queryClient);
      toast.success('Saved.');
      onClose();
    },
  });
}

function NameFields({
  values,
  errors,
  onChange,
}: {
  values: FormValues;
  errors: Errors;
  onChange: (patch: Partial<FormValues>) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="flex flex-col gap-1">
        <TextField
          label="First name"
          value={values.firstName}
          autoComplete="off"
          maxLength={80}
          onChange={(event) => {
            onChange({ firstName: event.target.value });
          }}
        />
        <FieldError message={errors.firstName} />
      </div>
      <div className="flex flex-col gap-1">
        <TextField
          label="Last name"
          value={values.lastName}
          autoComplete="off"
          maxLength={80}
          onChange={(event) => {
            onChange({ lastName: event.target.value });
          }}
        />
        <FieldError message={errors.lastName} />
      </div>
    </div>
  );
}

function EditFields({
  values,
  errors,
  today,
  onChange,
}: {
  values: FormValues;
  errors: Errors;
  today: string;
  onChange: (patch: Partial<FormValues>) => void;
}) {
  return (
    <>
      <NameFields values={values} errors={errors} onChange={onChange} />
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="Gender"
          value={values.gender}
          onChange={(event) => {
            onChange({ gender: event.target.value === 'M' ? 'M' : 'F' });
          }}
        >
          <option value="F">Female</option>
          <option value="M">Male</option>
        </SelectField>
        <div className="flex flex-col gap-1">
          <TextField
            label="Date of birth"
            type="date"
            max={today}
            value={values.dateOfBirth}
            onChange={(event) => {
              onChange({ dateOfBirth: event.target.value });
            }}
          />
          <FieldError message={errors.dateOfBirth} />
        </div>
      </div>
    </>
  );
}

function useEditForm(student: StudentDetail, onClose: () => void) {
  const today = useToday();
  const save = useEditStudent(student, onClose);
  const [values, setValues] = useState<FormValues>({
    firstName: student.firstName,
    lastName: student.lastName,
    gender: student.gender,
    dateOfBirth: student.dateOfBirth,
  });
  const [errors, setErrors] = useState<Errors>({});

  function submit() {
    const found = valueErrors(values, today);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      return;
    }
    const patch = changedFields(student, values);
    if (Object.keys(patch).length === 0) {
      onClose();
    } else {
      save.mutate(patch);
    }
  }

  return {
    today,
    save,
    values,
    errors,
    submit,
    change: (patch: Partial<FormValues>) => {
      setValues({ ...values, ...patch });
    },
  };
}

export function EditStudentDialog({ student, onClose }: DialogProps) {
  const form = useEditForm(student, onClose);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {student.firstName}’s details</DialogTitle>
          <DialogDescription>
            Correct a name, gender or date of birth. The admission number and
            campus are not editable here.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            form.submit();
          }}
        >
          <EditFields
            values={form.values}
            errors={form.errors}
            today={form.today}
            onChange={form.change}
          />
          <ErrorMessage error={form.save.error} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.save.isPending}>
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function useResetLogin(
  student: StudentDetail,
  input: { onClose: () => void; onIssued: (logins: LoginCredential[]) => void }
) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.students.resetLogin({ params: { id: student.id } }),
    onSuccess: async (result) => {
      await invalidateStudents(queryClient);
      input.onClose();
      input.onIssued([
        {
          who: 'student',
          name: `${student.firstName} ${student.lastName}`,
          existing: false,
          temporaryPassword: result.temporaryPassword,
          username: result.username ?? student.portalLogin?.username ?? '',
        },
      ]);
    },
  });
}

export function ResetStudentLoginDialog({
  student,
  onClose,
  onIssued,
}: DialogProps & { onIssued: (logins: LoginCredential[]) => void }) {
  const reset = useResetLogin(student, { onClose, onIssued });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRoundIcon />
            Reset {student.firstName}’s login?
          </DialogTitle>
          <DialogDescription>
            They get a new temporary password and must choose their own the next
            time they sign in. The old password stops working at once.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Username {student.portalLogin?.username ?? ''}.
        </p>
        <ErrorMessage error={reset.error} />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={reset.isPending}
            onClick={() => {
              reset.mutate();
            }}
          >
            Reset login
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
