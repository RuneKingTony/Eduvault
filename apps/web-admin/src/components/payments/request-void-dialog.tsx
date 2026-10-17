import { useState, type SubmitEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { BanIcon } from 'lucide-react';
import {
  PAYMENT_VOID_APPLIED_MESSAGE,
  PAYMENT_VOID_REASON_MESSAGE,
  PAYMENT_VOID_SUBMITTED_MESSAGE,
  type Payment,
} from '@eduvault/api-contract';
import { useCan } from '@eduvault/auth-client';
import { money } from '@eduvault/shared';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ErrorMessage,
  FieldError,
  Label,
  Textarea,
  fieldValue,
  toast,
} from '@eduvault/ui';
import { searchFor } from '../../route-search-defaults';
import { useApi } from '../../api';
import { invalidatePayments } from '../../queries';

export function canRequestVoid(payment: Payment, permitted: boolean): boolean {
  return permitted && payment.status === 'posted' && payment.storeSale === null;
}

function useRequestVoid(payment: Payment, onClose: () => void) {
  const api = useApi();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const canSeeVoids = useCan('adjustment', 'read');
  return useMutation({
    mutationFn: (reason: string) =>
      api.payments.requestVoid({
        params: { id: payment.id },
        body: { reason },
      }),
    onSuccess: async (made) => {
      await invalidatePayments(queryClient);
      onClose();
      if (made.autoApproved) {
        toast.success(PAYMENT_VOID_APPLIED_MESSAGE);
        return;
      }
      toast.warning(
        PAYMENT_VOID_SUBMITTED_MESSAGE,
        canSeeVoids
          ? {
              action: {
                label: 'Open voids',
                onClick: () => {
                  void navigate({
                    to: '/finance/adjustments',
                    search: searchFor('/finance/adjustments', {
                      tab: 'voids',
                    }),
                  });
                },
              },
            }
          : undefined
      );
    },
  });
}

function ReasonField({ missing }: { missing: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="void-reason">Reason</Label>
      <Textarea
        id="void-reason"
        name="reason"
        placeholder="e.g. Keyed the wrong amount"
        aria-invalid={missing ? true : undefined}
      />
      <FieldError message={missing ? PAYMENT_VOID_REASON_MESSAGE : undefined} />
    </div>
  );
}

function VoidForm({
  payment,
  onClose,
  request,
}: {
  payment: Payment;
  onClose: () => void;
  request: ReturnType<typeof useRequestVoid>;
}) {
  const [missing, setMissing] = useState(false);

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = fieldValue(
      new FormData(event.currentTarget),
      'reason'
    ).trim();
    setMissing(reason === '');
    if (reason !== '') {
      request.mutate(reason);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Void receipt {payment.receiptNumber}?</DialogTitle>
        <DialogDescription>
          {money(payment.amountMinor, payment.currency)} from{' '}
          {payment.payerName}
        </DialogDescription>
      </DialogHeader>
      <p className="text-sm">
        The receipt is kept. Once a boss approves, the payment is cancelled and
        the family owes that money again.
      </p>
      <ReasonField missing={missing} />
      <ErrorMessage error={request.error} />
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="destructive"
          disabled={request.isPending}
        >
          <BanIcon />
          Request void
        </Button>
      </DialogFooter>
    </form>
  );
}

export function RequestVoidDialog({
  payment,
  open,
  onOpenChange,
}: {
  payment: Payment;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const request = useRequestVoid(payment, () => {
    onOpenChange(false);
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          request.reset();
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        {open ? (
          <VoidForm
            payment={payment}
            request={request}
            onClose={() => {
              onOpenChange(false);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
