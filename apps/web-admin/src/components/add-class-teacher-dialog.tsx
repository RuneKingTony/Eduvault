import { useState, type SubmitEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserRoundPlusIcon } from 'lucide-react';
import {
  classTeacherRoleSchema,
  type ClassDetail,
  type ClassTeacherRole,
  type TeacherCandidate,
} from '@eduvault/api-contract';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FieldError,
  NativeSelectOption,
  SelectField,
  Skeleton,
  fieldValue,
  toast,
} from '@eduvault/ui';
import { useApi } from '../api';
import {
  invalidateClassTeachers,
  teacherCandidatesQueryOptions,
} from '../queries';
import { ROLE_LABELS } from './class-text';

const CHOOSE_TEACHER = 'Choose a teacher.';

function useAssignTeacher(classRow: ClassDetail, added: () => void) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { userId: string; role: ClassTeacherRole }) =>
      api.classes.assignTeacher({ params: { id: classRow.id }, body }),
    onSuccess: async (teacher) => {
      await invalidateClassTeachers(queryClient);
      toast.success(
        `${teacher.name} added as ${ROLE_LABELS[teacher.role].toLowerCase()} class teacher.`
      );
      added();
    },
  });
}

function TeacherField({
  candidates,
  campus,
}: {
  candidates: readonly TeacherCandidate[];
  campus: string;
}) {
  return (
    <SelectField
      label="Teacher"
      name="userId"
      defaultValue=""
      hint={
        candidates.length === 0
          ? `No teachers on the ${campus} campus yet. Add one under People first.`
          : `Only teachers on the ${campus} campus are listed.`
      }
    >
      <NativeSelectOption value="">Choose a teacher</NativeSelectOption>
      {candidates.map((candidate) => (
        <NativeSelectOption key={candidate.userId} value={candidate.userId}>
          {candidate.name}
        </NativeSelectOption>
      ))}
    </SelectField>
  );
}

function RoleField({ hasLead }: { hasLead: boolean }) {
  const roles = classTeacherRoleSchema.options.filter(
    (role) => !(hasLead && role === 'lead')
  );
  return (
    <SelectField label="Role" name="role" defaultValue="assistant">
      {roles.map((role) => (
        <NativeSelectOption key={role} value={role}>
          {ROLE_LABELS[role]}
        </NativeSelectOption>
      ))}
    </SelectField>
  );
}

function useAddTeacherForm(classRow: ClassDetail, onClose: () => void) {
  const [error, setError] = useState<string | undefined>();
  const add = useAssignTeacher(classRow, onClose);

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const userId = fieldValue(data, 'userId');
    const role = classTeacherRoleSchema.safeParse(fieldValue(data, 'role'));
    if (userId === '') {
      setError(CHOOSE_TEACHER);
      return;
    }
    if (!role.success) {
      setError('Choose a role.');
      return;
    }
    setError(undefined);
    add.mutate(
      { userId, role: role.data },
      {
        onError: (failure) => {
          setError(failure.message);
        },
      }
    );
  }

  return { error, submit, pending: add.isPending };
}

function AddTeacherForm({
  classRow,
  onClose,
}: {
  classRow: ClassDetail;
  onClose: () => void;
}) {
  const api = useApi();
  const candidates = useQuery(teacherCandidatesQueryOptions(api, classRow.id));
  const form = useAddTeacherForm(classRow, onClose);
  const hasLead = classRow.classTeachers.some(
    (teacher) => teacher.role === 'lead'
  );
  return (
    <form className="flex flex-col gap-4" onSubmit={form.submit} noValidate>
      <DialogHeader>
        <DialogTitle>Add class teacher</DialogTitle>
        <DialogDescription>
          A class can have several class teachers. Being one gives that teacher
          access to this class.
        </DialogDescription>
      </DialogHeader>
      {candidates.data === undefined ? (
        <Skeleton className="h-16 w-full" />
      ) : (
        <TeacherField
          candidates={candidates.data}
          campus={classRow.campus.name}
        />
      )}
      <RoleField hasLead={hasLead} />
      <FieldError message={form.error ?? candidates.error?.message} />
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={form.pending}>
          <UserRoundPlusIcon />
          Add class teacher
        </Button>
      </DialogFooter>
    </form>
  );
}

export function AddClassTeacherDialog({
  classRow,
  open,
  onOpenChange,
}: {
  classRow: ClassDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <AddTeacherForm
          classRow={classRow}
          onClose={() => {
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
