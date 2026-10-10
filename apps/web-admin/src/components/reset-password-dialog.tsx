import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { KeyRoundIcon } from 'lucide-react';
import type { MemberDetail } from '@eduvault/api-contract';
import {
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
import { TemporaryPasswordDialog } from './created-school-dialog';

function useResetPassword(
  member: MemberDetail,
  issued: (code: string) => void
) {
  const api = useApi();
  return useMutation({
    mutationFn: () => api.members.resetPassword({ params: { id: member.id } }),
    onSuccess: (result) => {
      issued(result.temporaryPassword);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

function ConfirmDialog({
  member,
  open,
  onOpenChange,
  issued,
}: {
  member: MemberDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issued: (code: string) => void;
}) {
  const reset = useResetPassword(member, issued);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset {member.name}’s password?</DialogTitle>
          <DialogDescription>
            They get a new temporary password and must choose their own the next
            time they sign in. The old password stops working at once and they
            are signed out everywhere.
          </DialogDescription>
        </DialogHeader>
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
            disabled={reset.isPending}
            onClick={() => {
              reset.mutate();
            }}
          >
            <KeyRoundIcon />
            Reset password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ResetPasswordDialog({
  member,
  open,
  onOpenChange,
}: {
  member: MemberDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [issued, setIssued] = useState<string | null>(null);
  return (
    <>
      <ConfirmDialog
        member={member}
        open={open}
        onOpenChange={onOpenChange}
        issued={(code) => {
          onOpenChange(false);
          setIssued(code);
        }}
      />
      <TemporaryPasswordDialog
        open={issued !== null}
        title={`New password for ${member.name}`}
        description="Give them this temporary password. They choose their own at next sign-in. It won’t be shown again."
        email={member.email ?? ''}
        password={issued}
        onDone={() => {
          setIssued(null);
        }}
      />
    </>
  );
}
