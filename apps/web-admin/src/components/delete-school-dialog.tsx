import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2Icon } from 'lucide-react';
import { denialMessage } from '@eduvault/api-contract';
import { useAuthClient } from '@eduvault/auth-client';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  TextField,
  toast,
} from '@eduvault/ui';
import { useApi } from '../api';

const DENIED = 'You need permission to delete the school.';

function useLeaveDeletedSchool(onLeft: () => void) {
  const authClient = useAuthClient();
  const queryClient = useQueryClient();
  return async () => {
    const schools = await authClient.organization.list();
    await authClient.organization.setActive({
      organizationId: schools.data?.[0]?.id ?? null,
    });
    queryClient.removeQueries();
    onLeft();
  };
}

function useDeleteSchool(
  schoolName: string,
  { done, onDeleted }: { done: () => void; onDeleted: () => void }
) {
  const api = useApi();
  const leave = useLeaveDeletedSchool(onDeleted);
  return useMutation({
    mutationFn: (confirmName: string) =>
      api.school.remove({ body: { confirmName } }),
    onSuccess: async () => {
      done();
      toast.success(`${schoolName} deleted.`);
      await leave();
    },
    onError: (error) => {
      toast.error(denialMessage(error, DENIED));
    },
  });
}

function DeleteFooter({
  canDelete,
  onCancel,
  onDelete,
}: {
  canDelete: boolean;
  onCancel: () => void;
  onDelete: () => void;
}) {
  return (
    <DialogFooter>
      <Button type="button" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
      <Button
        type="button"
        variant="destructive"
        disabled={!canDelete}
        onClick={onDelete}
      >
        <Trash2Icon />
        Delete school
      </Button>
    </DialogFooter>
  );
}

export function DeleteSchoolDialog({
  schoolName,
  open,
  onOpenChange,
  onDeleted,
}: {
  schoolName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const [typed, setTyped] = useState('');
  const remove = useDeleteSchool(schoolName, {
    done: () => {
      onOpenChange(false);
    },
    onDeleted,
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {schoolName}?</DialogTitle>
          <DialogDescription>
            This deletes the school, its campuses, school years, classes, roles
            and settings, and removes every member from it. It cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <TextField
          label="Type the school’s name to confirm"
          name="confirmName"
          autoComplete="off"
          value={typed}
          onChange={(event) => {
            setTyped(event.target.value);
          }}
        />
        <DeleteFooter
          canDelete={typed.trim() === schoolName && !remove.isPending}
          onCancel={() => {
            onOpenChange(false);
          }}
          onDelete={() => {
            remove.mutate(typed);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
