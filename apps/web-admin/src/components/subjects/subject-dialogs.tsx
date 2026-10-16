import { useState, type SubmitEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArchiveIcon } from 'lucide-react';
import {
  SUBJECT_NAME_MAX,
  updateSubjectSchema,
  type Subject,
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
  TextField,
  fieldValue,
  toast,
} from '@eduvault/ui';
import { useApi } from '../../api';
import { invalidateSubjects } from '../../queries';

export function useUpdateSubject() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      subject,
      body,
    }: {
      subject: Subject;
      body: { name?: string; retired?: boolean };
    }) => api.subjects.update({ params: { id: subject.id }, body }),
    onSuccess: async () => {
      await invalidateSubjects(queryClient);
    },
  });
}

function EditSubjectForm({
  subject,
  onClose,
}: {
  subject: Subject;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | undefined>();
  const update = useUpdateSubject();

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = updateSubjectSchema.safeParse({
      name: fieldValue(new FormData(event.currentTarget), 'name'),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    setError(undefined);
    update.mutate(
      { subject, body: parsed.data },
      {
        onSuccess: (saved) => {
          toast.success(`Saved ${saved.name}.`);
          onClose();
        },
        onError: (failure) => {
          setError(failure.message);
        },
      }
    );
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>Edit {subject.name}</DialogTitle>
        <DialogDescription>
          The code {subject.code} can’t change.
        </DialogDescription>
      </DialogHeader>
      <TextField
        label="Name"
        name="name"
        defaultValue={subject.name}
        maxLength={SUBJECT_NAME_MAX}
        autoComplete="off"
        required
      />
      <FieldError message={error} />
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={update.isPending}>
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}

export function EditSubjectDialog({
  subject,
  onClose,
}: {
  subject: Subject | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={subject !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent>
        {subject === null ? null : (
          <EditSubjectForm subject={subject} onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

export function RetireSubjectDialog({
  subject,
  onClose,
}: {
  subject: Subject | null;
  onClose: () => void;
}) {
  const update = useUpdateSubject();
  return (
    <Dialog
      open={subject !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Retire {subject?.name}?</DialogTitle>
          <DialogDescription>
            It stays in the catalogue as Archived and keeps every past
            assignment. It can’t be added to a level or assigned while retired.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={update.isPending}
            onClick={() => {
              if (subject === null) {
                return;
              }
              update.mutate(
                { subject, body: { retired: true } },
                {
                  onSuccess: () => {
                    toast.success(`${subject.name} retired.`);
                    onClose();
                  },
                  onError: (failure) => {
                    toast.error(failure.message);
                    onClose();
                  },
                }
              );
            }}
          >
            <ArchiveIcon />
            Retire
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
