import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { InfoIcon, SendIcon } from 'lucide-react';
import type { BillingRun } from '@eduvault/api-contract';
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
import { NO_INVOICE_FILTERS } from '../../invoices-search';
import { invalidateBilling } from '../../queries';
import { chargesCount, sentToast } from './billing-text';

function useSend(onClose: () => void) {
  const api = useApi();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (runId: string) =>
      api.billingRuns.issue({ params: { id: runId } }),
    onSuccess: async (sent) => {
      await invalidateBilling(queryClient);
      toast.success(sentToast(sent.sentCount), {
        action: {
          label: 'See charges',
          onClick: () => {
            void navigate({
              to: '/finance/invoices',
              search: NO_INVOICE_FILTERS,
            });
          },
        },
      });
      onClose();
    },
    onError: (failure) => {
      toast.error(failure.message);
    },
  });
}

export function SendRoundDialog({
  run,
  open,
  onClose,
}: {
  run: BillingRun;
  open: boolean;
  onClose: () => void;
}) {
  const send = useSend(onClose);
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
          <DialogTitle>Send {chargesCount(run.chargeCount)}?</DialogTitle>
          <DialogDescription>
            {money(run.totalMinor, run.currency)} for {run.termName}
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm">
          Each charge is added to the student’s account and shows in Who owes.
        </p>
        <Alert>
          <InfoIcon />
          <AlertDescription>
            Charges that are sent can’t be edited. A mistake is fixed with an
            approved fee reduction.
          </AlertDescription>
        </Alert>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={send.isPending}
            onClick={() => {
              send.mutate(run.id);
            }}
          >
            <SendIcon />
            Send {chargesCount(run.chargeCount)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
