import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BanIcon } from 'lucide-react';
import type { BillingRun } from '@eduvault/api-contract';
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
import { useApi } from '../../api';
import { invalidateBilling } from '../../queries';
import { cancelledToast } from './billing-text';

function useCancel(onClose: () => void) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) =>
      api.billingRuns.cancel({ params: { id: runId } }),
    onSuccess: async (cancelled) => {
      await invalidateBilling(queryClient);
      toast.warning(cancelledToast(cancelled.number));
      onClose();
    },
    onError: (failure) => {
      toast.error(failure.message);
    },
  });
}

export function CancelRoundDialog({
  run,
  open,
  onClose,
}: {
  run: BillingRun;
  open: boolean;
  onClose: () => void;
}) {
  const cancel = useCancel(onClose);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel {run.number}?</DialogTitle>
          <DialogDescription>
            These prepared charges are cancelled and the students can be charged
            again. Nothing was recorded in the books.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Keep them
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={cancel.isPending}
            onClick={() => {
              cancel.mutate(run.id);
            }}
          >
            <BanIcon />
            Cancel these charges
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
