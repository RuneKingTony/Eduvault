import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2Icon } from 'lucide-react';
import type { MemberDetail } from '@eduvault/api-contract';
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
} from '@eduvault/ui';
import { useApi } from '../api';
import { forgetMember, invalidateAfterRemoval } from '../queries';

function useRemoveMember(member: MemberDetail, done: () => Promise<void>) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.members.remove({ params: { id: member.id } }),
    onSuccess: async () => {
      await invalidateAfterRemoval(queryClient, member.id);
      toast.success(`${member.name} removed.`);
      await done();
      forgetMember(queryClient, member.id);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

export function RemoveMemberDialog({
  member,
  schoolName,
  open,
  onOpenChange,
  onRemoved,
}: {
  member: MemberDetail;
  schoolName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemoved: () => Promise<void>;
}) {
  const remove = useRemoveMember(member, () => {
    onOpenChange(false);
    return onRemoved();
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove {member.name}?</DialogTitle>
          <DialogDescription>
            They lose access to {schoolName}. Records they created keep their
            name.
          </DialogDescription>
        </DialogHeader>
        <Alert>
          <AlertDescription>
            Payments recorded and approvals given stay attributed to them.
          </AlertDescription>
        </Alert>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => {
              remove.mutate();
            }}
          >
            <Trash2Icon />
            Remove member
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
