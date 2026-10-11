import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlusIcon } from 'lucide-react';
import {
  GUARDIAN_PICK_MESSAGE,
  type LinkGuardianResult,
  type LoginCredential,
} from '@eduvault/api-contract';
import { useCan } from '@eduvault/auth-client';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ErrorMessage,
  Skeleton,
  toast,
} from '@eduvault/ui';
import { useApi } from '../api';
import {
  draftErrors,
  hasErrors,
  newDraft,
  toDraftInput,
  type DraftErrors,
  type GuardianDraftState,
  type GuardianMode,
} from '../guardian-draft';
import {
  guardiansQueryOptions,
  invalidateStudents,
  studentGuardiansQueryOptions,
} from '../queries';
import type { StudentRef } from './guardian-actions';
import { GuardianPicker } from './guardian-picker';
import { nameOf } from './student-bits';

interface AddGuardianDialogProps {
  student: StudentRef;
  onClose: () => void;
  onIssued: (logins: LoginCredential[]) => void;
}

function successMessage(result: LinkGuardianResult, student: StudentRef) {
  const name = result.link.fullName;
  const login = result.login;
  if (login === undefined) {
    return `${name} linked to ${nameOf(student)}.`;
  }
  if (login.existing) {
    return `${name} linked to ${nameOf(student)}. They sign in with their existing login.`;
  }
  return login.email === undefined
    ? `${name} added with a login. Username ${login.username}, shown once.`
    : `${name} added with a login. They sign in with ${login.email} and a temporary password.`;
}

function useLinkGuardian(props: AddGuardianDialogProps) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (draft: GuardianDraftState) =>
      api.students.linkGuardian({
        params: { id: props.student.id },
        body: toDraftInput(draft),
      }),
    onSuccess: async (result) => {
      await invalidateStudents(queryClient);
      toast.success(successMessage(result, props.student));
      props.onClose();
      if (result.login?.temporaryPassword !== undefined) {
        props.onIssued([result.login]);
      }
    },
  });
}

function AddGuardianForm({
  props,
  initialMode,
  firstGuardian,
}: {
  props: AddGuardianDialogProps;
  initialMode: GuardianMode;
  firstGuardian: boolean;
}) {
  const canCreate = useCan('guardian', 'create');
  const [draft, setDraft] = useState(() =>
    newDraft(1, {
      mode: initialMode,
      relationship: 'mother',
      paysFees: firstGuardian,
    })
  );
  const [errors, setErrors] = useState<DraftErrors>({});
  const link = useLinkGuardian(props);

  function submit() {
    if (draft.mode === 'existing' && draft.existingId === '') {
      toast.error(GUARDIAN_PICK_MESSAGE);
      return;
    }
    const found = draftErrors(draft);
    setErrors(found);
    if (!hasErrors(found)) {
      link.mutate(draft);
    }
  }

  return (
    <>
      <GuardianPicker
        idPrefix="add-guardian"
        draft={draft}
        studentId={props.student.id}
        takenIds={[]}
        canCreate={canCreate}
        errors={errors}
        onChange={(patch) => {
          setDraft({ ...draft, ...patch });
        }}
      />
      <ErrorMessage error={link.error} />
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={props.onClose}>
          Cancel
        </Button>
        <Button type="button" disabled={link.isPending} onClick={submit}>
          <UserPlusIcon />
          Add guardian
        </Button>
      </DialogFooter>
    </>
  );
}

function AddGuardianBody({ props }: { props: AddGuardianDialogProps }) {
  const api = useApi();
  const canCreate = useCan('guardian', 'create');
  const offered = useQuery(
    guardiansQueryOptions(api, { excludeStudentId: props.student.id })
  );
  const linked = useQuery(studentGuardiansQueryOptions(api, props.student.id));
  if (offered.isPending || linked.isPending) {
    return <Skeleton className="h-32 w-full" />;
  }
  const hasOthers = (offered.data ?? []).length > 0;
  return (
    <AddGuardianForm
      props={props}
      initialMode={hasOthers || !canCreate ? 'existing' : 'new'}
      firstGuardian={(linked.data ?? []).length === 0}
    />
  );
}

export function AddGuardianDialog(props: AddGuardianDialogProps) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          props.onClose();
        }
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add a guardian for {nameOf(props.student)}</DialogTitle>
          <DialogDescription>
            Every guardian has their own login, so the family sees this child in
            the portal.
          </DialogDescription>
        </DialogHeader>
        <AddGuardianBody props={props} />
      </DialogContent>
    </Dialog>
  );
}
