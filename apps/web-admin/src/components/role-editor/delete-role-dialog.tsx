import { useMutation, useQueryClient } from '@tanstack/react-query';
import { InfoIcon, Trash2Icon, TriangleAlertIcon } from 'lucide-react';
import {
  ROLE_PROTECTED_MESSAGE,
  roleInUseMessage,
  type Role,
} from '@eduvault/api-contract';
import { PROTECTED_ROLES } from '@eduvault/policy';
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
import { useApi } from '../../api';
import { invalidateRoles } from '../../queries';

function blocker(role: Role): string | undefined {
  if (PROTECTED_ROLES.includes(role.slug)) {
    return ROLE_PROTECTED_MESSAGE;
  }
  if (role.holderCount === 0) {
    return undefined;
  }
  return roleInUseMessage(
    role.holders?.length === role.holderCount
      ? role.holders.map((holder) => holder.name)
      : role.holderCount
  );
}

function useDeleteRole(role: Role, done: () => void) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.roles.remove({ params: { slug: role.slug } }),
    onSuccess: async () => {
      await invalidateRoles(queryClient);
      toast.success(`Role ${role.label} deleted.`);
      done();
    },
  });
}

function Refusal({ message }: { message: string | undefined }) {
  if (message === undefined) {
    return (
      <Alert>
        <InfoIcon />
        <AlertDescription>Nobody holds this role.</AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert variant="destructive">
      <TriangleAlertIcon />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

export function DeleteRoleDialog({
  role,
  open,
  onOpenChange,
  onDeleted,
}: {
  role: Role;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const remove = useDeleteRole(role, () => {
    onOpenChange(false);
    onDeleted();
  });
  const blocked = blocker(role);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete “{role.label}”?</DialogTitle>
          <DialogDescription>
            {blocked === undefined
              ? 'Members can’t hold it any more. This can’t be undone.'
              : 'This will be refused.'}
          </DialogDescription>
        </DialogHeader>
        <Refusal message={blocked ?? remove.error?.message} />
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
            disabled={blocked !== undefined || remove.isPending}
            onClick={() => {
              remove.mutate();
            }}
          >
            <Trash2Icon />
            Delete role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
