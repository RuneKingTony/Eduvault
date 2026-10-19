import { useState, type SubmitEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FEE_LINE_AMOUNT_MESSAGE, type FeeLine } from '@eduvault/api-contract';
import { groupedNairaInputText, money } from '@eduvault/shared';
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
import { useApi } from '../../api';
import { parseFeeAmount } from '../../fee-amount';
import { invalidateFees } from '../../queries';
import { amountChangedToast } from './fee-text';

function useChange(currency: string, onClose: () => void) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; amountMinor: number }) =>
      api.feeLines.update({
        params: { id: input.id },
        body: { amountMinor: input.amountMinor },
      }),
    onSuccess: async (changed) => {
      await invalidateFees(queryClient);
      toast.success(
        amountChangedToast(changed.name, money(changed.amountMinor, currency))
      );
      onClose();
    },
    onError: (failure) => {
      toast.error(failure.message);
    },
  });
}

function Form({
  line,
  currency,
  onClose,
}: {
  line: FeeLine;
  currency: string;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const change = useChange(currency, onClose);
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountMinor = parseFeeAmount(
      fieldValue(new FormData(event.currentTarget), 'amount')
    );
    if (amountMinor === undefined) {
      setError(FEE_LINE_AMOUNT_MESSAGE);
      return;
    }
    setError(null);
    change.mutate({ id: line.id, amountMinor });
  }
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <TextField
        label="Amount (₦)"
        name="amount"
        inputMode="decimal"
        autoComplete="off"
        defaultValue={groupedNairaInputText(line.amountMinor)}
      />
      <p className="text-xs text-muted-foreground">
        Applies from the next round of charges. Charges already sent keep the
        old amount.
      </p>
      <FieldError message={error} />
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={change.isPending}>
          Save amount
        </Button>
      </DialogFooter>
    </form>
  );
}

export function ChangeAmountDialog({
  line,
  termLabel,
  currency,
  onClose,
}: {
  line: FeeLine | null;
  termLabel: string;
  currency: string;
  onClose: () => void;
}) {
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
          <DialogTitle>Change {line?.name}</DialogTitle>
          <DialogDescription>
            {line?.levelName} · {termLabel}
          </DialogDescription>
        </DialogHeader>
        {line === null ? null : (
          <Form
            key={line.id}
            line={line}
            currency={currency}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
