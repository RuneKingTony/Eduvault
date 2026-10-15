import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { MoneyAccount } from '@eduvault/api-contract';
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
import { invalidateMoneyAccounts } from '../queries';

function useRetire(onClose: () => void) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (account: MoneyAccount) =>
      api.moneyAccounts.update({
        params: { id: account.id },
        body: { retired: true },
      }),
    onSuccess: async (retired) => {
      await invalidateMoneyAccounts(queryClient);
      toast.success(`${retired.name} retired. Its cash book is kept.`);
      onClose();
    },
    onError: (failure) => {
      toast.error(failure.message);
    },
  });
}

export function RetireMoneyAccountDialog({
  account,
  onClose,
}: {
  account: MoneyAccount | null;
  onClose: () => void;
}) {
  const retire = useRetire(onClose);
  return (
    <Dialog
      open={account !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Retire {account?.name}?</DialogTitle>
          <DialogDescription>
            It stops being offered for new payments. Its cash book and balance
            are kept, and you can’t bring it back.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={retire.isPending || account === null}
            onClick={() => {
              if (account !== null) {
                retire.mutate(account);
              }
            }}
          >
            Retire account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
