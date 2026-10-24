import { useState, type SubmitEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckIcon } from 'lucide-react';
import type {
  SubjectTeacherArm,
  SubjectTeacherRow,
  TeacherCandidate,
} from '@eduvault/api-contract';
import {
  ConfirmDialog,
  Alert,
  AlertDescription,
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
import { Can } from '@eduvault/auth-client';
import { useApi } from '../../api';
import {
  invalidateSubjectTeachers,
  subjectCandidatesQueryOptions,
} from '../../queries';
import { defaultTeacher } from './subject-model';

export interface AssignTarget {
  arm: SubjectTeacherArm;
  row: SubjectTeacherRow;
}

function useAssign(target: AssignTarget, onDone: () => void) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      api.subjectTeachers.assign({
        params: { id: target.arm.classId, subjectId: target.row.subjectId },
        body: { userId },
      }),
    onSuccess: async (assigned) => {
      await invalidateSubjectTeachers(queryClient);
      toast.success(
        `${assigned.name} now teaches ${target.row.name} in ${target.arm.displayName}.`
      );
      onDone();
    },
  });
}

function useRemove(target: AssignTarget, onDone: () => void) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.subjectTeachers.remove({
        params: { id: target.arm.classId, subjectId: target.row.subjectId },
      }),
    onSuccess: async () => {
      await invalidateSubjectTeachers(queryClient);
      toast.success(
        `${target.row.name} in ${target.arm.displayName} has no teacher now.`
      );
      onDone();
    },
  });
}

function CandidateField({
  candidates,
  campus,
  current,
}: {
  candidates: readonly TeacherCandidate[];
  campus: string;
  current: string | undefined;
}) {
  return (
    <SelectField
      label="Teacher"
      name="userId"
      defaultValue={defaultTeacher(current, candidates)}
      hint={
        candidates.length === 0
          ? `No teachers on the ${campus} campus yet. Add one under People first.`
          : 'Only teachers on this class’s campus are listed.'
      }
    >
      {candidates.map((candidate) => (
        <NativeSelectOption key={candidate.userId} value={candidate.userId}>
          {candidate.name}
        </NativeSelectOption>
      ))}
    </SelectField>
  );
}

function useAssignForm(target: AssignTarget, onClose: () => void) {
  const [error, setError] = useState<string | undefined>();
  const [confirming, setConfirming] = useState(false);
  const assign = useAssign(target, onClose);
  const remove = useRemove(target, onClose);
  const fail = (failure: Error) => {
    setError(failure.message);
  };

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const userId = fieldValue(new FormData(event.currentTarget), 'userId');
    if (userId === '') {
      setError('Choose a teacher.');
      return;
    }
    setError(undefined);
    assign.mutate(userId, { onError: fail });
  }

  return {
    error,
    submit,
    saving: assign.isPending,
    removing: remove.isPending,
    confirming,
    setConfirming,
    removeTeacher: () => {
      setConfirming(true);
    },
    confirmRemove: () => {
      remove.mutate(undefined, {
        onError: fail,
        onSettled: () => {
          setConfirming(false);
        },
      });
    },
  };
}

function AssignFooter({
  form,
  hasTeacher,
  canSave,
  onClose,
}: {
  form: ReturnType<typeof useAssignForm>;
  hasTeacher: boolean;
  canSave: boolean;
  onClose: () => void;
}) {
  return (
    <DialogFooter>
      {hasTeacher ? (
        <Button
          type="button"
          variant="ghost"
          className="text-destructive sm:mr-auto"
          disabled={form.removing}
          onClick={form.removeTeacher}
        >
          Remove teacher
        </Button>
      ) : null}
      <Button type="button" variant="ghost" onClick={onClose}>
        Cancel
      </Button>
      <Button type="submit" disabled={!canSave || form.saving}>
        <CheckIcon />
        Save teacher
      </Button>
    </DialogFooter>
  );
}

function RemoveTeacherConfirm({
  form,
  target,
}: {
  form: ReturnType<typeof useAssignForm>;
  target: AssignTarget;
}) {
  return (
    <ConfirmDialog
      open={form.confirming}
      title={`Remove the teacher of ${target.row.name}?`}
      description={`${target.row.name} in ${target.arm.displayName} will have no teacher until you assign one.`}
      tone="destructive"
      confirmLabel="Remove teacher"
      pending={form.removing}
      onConfirm={form.confirmRemove}
      onCancel={() => {
        form.setConfirming(false);
      }}
    />
  );
}

function AssignForm({
  target,
  termName,
  onClose,
}: {
  target: AssignTarget;
  termName: string | undefined;
  onClose: () => void;
}) {
  const candidates = useQuery(
    subjectCandidatesQueryOptions(useApi(), target.arm.classId)
  );
  const form = useAssignForm(target, onClose);
  return (
    <>
      <form className="flex flex-col gap-4" onSubmit={form.submit} noValidate>
        <DialogHeader>
          <DialogTitle>Assign {target.row.name}</DialogTitle>
          <DialogDescription>
            {termName === undefined
              ? target.arm.displayName
              : `${target.arm.displayName} · ${termName}`}
          </DialogDescription>
        </DialogHeader>
        {candidates.data === undefined ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <CandidateField
            candidates={candidates.data}
            campus={target.arm.campus.name}
            current={target.row.teacher?.userId}
          />
        )}
        <Alert>
          <AlertDescription>
            Saving makes this person the teacher of this subject in this class,
            and adds the class to their list.
          </AlertDescription>
        </Alert>
        <FieldError message={form.error ?? candidates.error?.message} />
        <AssignFooter
          form={form}
          hasTeacher={target.row.teacher !== null}
          canSave={(candidates.data?.length ?? 0) > 0}
          onClose={onClose}
        />
      </form>
      <RemoveTeacherConfirm form={form} target={target} />
    </>
  );
}

export function AssignSubjectDialog({
  target,
  termName,
  onClose,
}: {
  target: AssignTarget | null;
  termName: string | undefined;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent>
        {target === null ? null : (
          <Can permission="class:assignTeacher">
            <AssignForm target={target} termName={termName} onClose={onClose} />
          </Can>
        )}
      </DialogContent>
    </Dialog>
  );
}
