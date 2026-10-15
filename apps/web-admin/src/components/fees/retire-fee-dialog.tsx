import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArchiveIcon, InfoIcon } from 'lucide-react';
import type { FeeLine } from '@eduvault/api-contract';
import { money } from '@eduvault/shared';
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
import { invalidateFees } from '../../queries';
import { retiredToast } from './fee-text';

function useRetire(onClose: () => void) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (line: FeeLine) =>
      api.feeLines.retire({ params: { id: line.id } }),
    onSuccess: async (retired) => {
      await invalidateFees(queryClient);
      toast.success(retiredToast(retired.name));
      onClose();
    },
    onError: (failure) => {
      toast.error(failure.message);
    },
  });
}

export function RetireFeeDialog({
  line,
  currency,
  onClose,
}: {
  line: FeeLine | null;
  currency: string;
  onClose: () => void;
}) {
  const retire = useRetire(onClose);
  return (
    <Dialog
      open={line !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Retire {line?.name}?</DialogTitle>
          <DialogDescription>
            {line?.levelName} · {line ? money(line.amountMinor, currency) : ''}
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm">
          It stops appearing on new charges from the next round.
        </p>
        <Alert>
          <InfoIcon />
          <AlertDescription>
            Charges already sent don’t change. The fee itself is kept for
            history, never deleted.
          </AlertDescription>
        </Alert>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={retire.isPending || line === null}
            onClick={() => {
              if (line !== null) {
                retire.mutate(line);
              }
            }}
          >
            <ArchiveIcon />
            Retire line
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
