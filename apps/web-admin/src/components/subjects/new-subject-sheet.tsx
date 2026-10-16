import { useState, type SubmitEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { SUBJECT_CODE_MAX, SUBJECT_NAME_MAX } from '@eduvault/api-contract';
import {
  Button,
  FieldError,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  TextField,
  fieldValue,
  toast,
} from '@eduvault/ui';
import { useApi } from '../../api';
import { invalidateSubjects } from '../../queries';
import { validateSubject } from './subject-model';

function useCreateSubject(created: (name: string) => void) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { code: string; name: string }) =>
      api.subjects.create({ body }),
    onSuccess: async (subject) => {
      await invalidateSubjects(queryClient);
      created(subject.name);
    },
  });
}

function useNewSubjectForm(created: (name: string) => void) {
  const [error, setError] = useState<string | undefined>();
  const create = useCreateSubject(created);

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const checked = validateSubject(
      fieldValue(data, 'code'),
      fieldValue(data, 'name')
    );
    if ('error' in checked) {
      setError(checked.error);
      return;
    }
    setError(undefined);
    create.mutate(checked, {
      onError: (failure) => {
        setError(failure.message);
      },
    });
  }

  return { error, submit, pending: create.isPending };
}

function NewSubjectBody({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (name: string) => void;
}) {
  const form = useNewSubjectForm(onCreated);
  return (
    <>
      <SheetHeader>
        <SheetTitle>New subject</SheetTitle>
        <SheetDescription>
          Add it to a class level afterwards to use it.
        </SheetDescription>
      </SheetHeader>
      <form
        id="new-subject"
        onSubmit={form.submit}
        noValidate
        className="flex flex-col gap-3 px-4"
      >
        <TextField
          label="Code"
          name="code"
          autoComplete="off"
          maxLength={SUBJECT_CODE_MAX}
          placeholder="AGR"
          required
        />
        <p className="-mt-2 text-xs text-muted-foreground">
          Up to 5 letters. Unique per school.
        </p>
        <TextField
          label="Name"
          name="name"
          autoComplete="off"
          maxLength={SUBJECT_NAME_MAX}
          placeholder="Agricultural Science"
          required
        />
        <FieldError message={form.error} />
      </form>
      <SheetFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" form="new-subject" disabled={form.pending}>
          <PlusIcon />
          Add subject
        </Button>
      </SheetFooter>
    </>
  );
}

export function NewSubjectSheet({
  open,
  onOpenChange,
  onSeeLevels,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSeeLevels: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <NewSubjectBody
          onClose={() => {
            onOpenChange(false);
          }}
          onCreated={(name) => {
            onOpenChange(false);
            toast.success(`Added ${name}. Add it to a class level to use it.`, {
              action: { label: 'By level', onClick: onSeeLevels },
            });
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
