import { useState, type SubmitEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DEFAULT_MEMBER_TITLE,
  updateMemberTitleSchema,
  type MemberDetail,
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
import { useApi } from '../api';
import { invalidateMembers } from '../queries';

function useSaveTitle(member: MemberDetail, saved: () => void) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (title: string) =>
      api.members.updateTitle({ params: { id: member.id }, body: { title } }),
    onSuccess: async (updated) => {
      await invalidateMembers(queryClient, false);
      toast.success(`${updated.name}’s job title saved.`);
      saved();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

function TitleForm({
  member,
  onClose,
}: {
  member: MemberDetail;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | undefined>();
  const save = useSaveTitle(member, onClose);

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = fieldValue(new FormData(event.currentTarget), 'title');
    const parsed = updateMemberTitleSchema.safeParse({ title });
    if (parsed.success) {
      setError(undefined);
      save.mutate(parsed.data.title);
    } else {
      setError('Keep the job title to 80 characters.');
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>Edit {member.name}’s job title</DialogTitle>
        <DialogDescription>
          {`Shown under their name. Leave it blank to show “${DEFAULT_MEMBER_TITLE}”.`}
        </DialogDescription>
      </DialogHeader>
      <TextField
        label="Job title"
        name="title"
        autoComplete="off"
        defaultValue={member.title}
      />
      <FieldError message={error} />
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending}>
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}

export function EditTitleDialog({
  member,
  open,
  onOpenChange,
}: {
  member: MemberDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <TitleForm
          member={member}
          onClose={() => {
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
