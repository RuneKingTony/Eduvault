import { useState, type SubmitEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { WalletIcon } from 'lucide-react';
import { denialMessage, type Wallet } from '@eduvault/api-contract';
import {
  generateWalletReference,
  lagosDateOf,
  walletMoney,
} from '@eduvault/shared';
import {
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
} from '@eduvault/ui';
import { useApi } from '../../api';
import { spendWalletMutationOptions } from '../../queries';
import {
  payAllTexts,
  payModel,
  type PayModel,
  type PayTexts,
} from './pay-model';
import { PayTable } from './pay-table';

const DENIED = 'You need permission to pay from the wallet.';
const EARMARK_NOTE =
  'Money set aside for a child is used for that child first, then free money.';

function PayConfirm({
  wallet,
  model,
  reference,
  onCancel,
  onPaid,
}: {
  wallet: Wallet;
  model: PayModel;
  reference: string;
  onCancel: () => void;
  onPaid: () => void;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const spend = useMutation(spendWalletMutationOptions(api, queryClient));
  const lines = model.rows
    .filter((row) => row.amountMinor > 0 && row.issue === null)
    .map((row) => ({
      label: row.name,
      value: walletMoney(row.amountMinor, wallet.currency),
    }));

  function pay() {
    spend.mutate(
      { reference, lines: model.lines },
      {
        onSuccess: (paid) => {
          toast.success(
            paid.replayed
              ? 'That payment was already made. Nothing was paid twice.'
              : `${walletMoney(paid.totalMinor, wallet.currency)} paid from the wallet.`
          );
          onPaid();
        },
        onError: (failure) => {
          onCancel();
          toast.error(denialMessage(failure, DENIED));
        },
      }
    );
  }

  return (
    <ConfirmDialog
      open
      title="Pay these fees from the wallet?"
      description="It is taken from the wallet at once and shows on each child’s statement."
      details={[
        ...lines,
        {
          label: 'Total',
          value: walletMoney(model.totalMinor, wallet.currency),
        },
      ]}
      confirmLabel="Pay now"
      pending={spend.isPending}
      onConfirm={pay}
      onCancel={onCancel}
    />
  );
}

function PayActions({
  payable,
  onPayAll,
  onClose,
}: {
  payable: boolean;
  onPayAll: () => void;
  onClose: () => void;
}) {
  return (
    <DialogFooter>
      <Button type="button" variant="outline" onClick={onPayAll}>
        Pay all I can
      </Button>
      <Button type="button" variant="ghost" onClick={onClose}>
        Cancel
      </Button>
      <Button type="submit" disabled={!payable}>
        <WalletIcon />
        Review payment
      </Button>
    </DialogFooter>
  );
}

function PayForm({ wallet, onClose }: { wallet: Wallet; onClose: () => void }) {
  const [reference] = useState(() =>
    generateWalletReference('spend', lagosDateOf(new Date()))
  );
  const [texts, setTexts] = useState<PayTexts>({});
  const [confirming, setConfirming] = useState(false);
  const model = payModel(wallet, texts);
  const payable = model.issue === null && model.lines.length > 0;

  function review(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (payable) {
      setConfirming(true);
    }
  }

  return (
    <>
      <form onSubmit={review} noValidate className="flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle>Pay from wallet</DialogTitle>
          <DialogDescription>
            Choose how much of each child’s fees to pay. {EARMARK_NOTE}
          </DialogDescription>
        </DialogHeader>
        <PayTable
          model={model}
          currency={wallet.currency}
          onText={(studentId, text) => {
            setTexts((previous) => ({ ...previous, [studentId]: text }));
          }}
        />
        <PayActions
          payable={payable}
          onPayAll={() => {
            setTexts(payAllTexts(wallet));
          }}
          onClose={onClose}
        />
      </form>
      {confirming ? (
        <PayConfirm
          wallet={wallet}
          model={model}
          reference={reference}
          onCancel={() => {
            setConfirming(false);
          }}
          onPaid={onClose}
        />
      ) : null}
    </>
  );
}

export function PayFromWalletDialog({
  wallet,
  open,
  onClose,
}: {
  wallet: Wallet;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <PayForm wallet={wallet} onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
}
