import { useState, type SubmitEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FEE_TYPE_NAME_REQUIRED,
  MONEY_ACCOUNT_NAME_MAX,
  createFeeTypeSchema,
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
  TextField,
  fieldValue,
  toast,
} from '@eduvault/ui';
import { useApi } from '../../api';
import { invalidateFees, invalidateLedger } from '../../queries';
import { feeTypeAddedToast } from './fee-text';

function useAdd(onClose: () => void) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ReturnType<typeof createFeeTypeSchema.parse>) =>
      api.feeTypes.create({ body }),
    onSuccess: async (added) => {
      await Promise.all([
        invalidateFees(queryClient),
        invalidateLedger(queryClient),
      ]);
      toast.success(feeTypeAddedToast(added.name));
      onClose();
    },
    onError: (failure) => {
      toast.error(failure.message);
    },
  });
}

function Form({ onClose }: { onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const add = useAdd(onClose);
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = createFeeTypeSchema.safeParse({
      name: fieldValue(new FormData(event.currentTarget), 'name'),
    });
    if (parsed.success) {
      setError(null);
      add.mutate(parsed.data);
    } else {
      setError(parsed.error.issues[0]?.message ?? FEE_TYPE_NAME_REQUIRED);
    }
  }
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
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
          Add fee type
        </Button>
      </DialogFooter>
    </form>
  );
}

export function NewFeeTypeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New fee type</DialogTitle>
          <DialogDescription>
            For example Sports levy or Exam fee. Add the amounts afterwards.
          </DialogDescription>
        </DialogHeader>
        <Form
          onClose={() => {
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
