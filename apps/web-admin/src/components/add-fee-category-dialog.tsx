import { useState, type SubmitEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  LEDGER_ACCOUNT_NAME_REQUIRED,
  MONEY_ACCOUNT_NAME_MAX,
  createLedgerAccountSchema,
  type LedgerAccount,
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
  NativeSelectOption,
  SelectField,
  TextField,
  fieldValue,
  toast,
} from '@eduvault/ui';
import { useApi } from '../api';
import { invalidateLedger } from '../queries';

function useAdd(onClose: () => void) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ReturnType<typeof createLedgerAccountSchema.parse>) =>
      api.ledgerAccounts.create({ body }),
    onSuccess: async (added) => {
      await invalidateLedger(queryClient);
      toast.success(`${added.name} added as a fee type.`);
      onClose();
    },
    onError: (failure) => {
      toast.error(failure.message);
    },
  });
}

function Form({
  feeIncome,
  onClose,
}: {
  feeIncome: LedgerAccount;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const add = useAdd(onClose);
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const parsed = createLedgerAccountSchema.safeParse({
      parentId: fieldValue(data, 'parentId'),
      name: fieldValue(data, 'name'),
    });
    if (parsed.success) {
      setError(null);
      add.mutate(parsed.data);
    } else {
      setError(parsed.error.issues[0]?.message ?? LEDGER_ACCOUNT_NAME_REQUIRED);
    }
  }
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <SelectField label="Under" name="parentId" defaultValue={feeIncome.id}>
        <NativeSelectOption value={feeIncome.id}>
          {`${feeIncome.code} ${feeIncome.name}`}
        </NativeSelectOption>
      </SelectField>
      <TextField
        label="Name"
        name="name"
        autoComplete="off"
        maxLength={MONEY_ACCOUNT_NAME_MAX}
        placeholder="e.g. Sports levy"
      />
      <FieldError message={error} />
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={add.isPending}>
          Add category
        </Button>
      </DialogFooter>
    </form>
  );
}

export function AddFeeCategoryDialog({
  open,
  feeIncome,
  onOpenChange,
}: {
  open: boolean;
  feeIncome: LedgerAccount | undefined;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open && feeIncome !== undefined} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a fee category</DialogTitle>
          <DialogDescription>
            A new kind of charge the school can bill, like a sports levy. It
            goes under Fee income.
          </DialogDescription>
        </DialogHeader>
        {feeIncome === undefined ? null : (
          <Form
            feeIncome={feeIncome}
            onClose={() => {
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
