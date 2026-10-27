import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BanIcon } from 'lucide-react';
import {
  WALLET_CANCEL_REASON_MESSAGE,
  type WalletJournalMovement,
} from '@eduvault/api-contract';
import {
  generateWalletReference,
  lagosDateOf,
  walletMoney,
} from '@eduvault/shared';
import { ConfirmDialog } from '@eduvault/ui';
import { useApi } from '../../api';
import { invalidateWalletRequest } from '../../queries';
import { announceWalletRequest } from '../record-once';

function CancelForm({
  walletId,
  movement,
  currency,
  onClose,
}: {
  walletId: string;
  movement: WalletJournalMovement;
  currency: string;
  onClose: () => void;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [reference] = useState(() =>
    generateWalletReference('cancelTopUp', lagosDateOf(new Date()))
  );
  const { source } = movement;
  const topUpId = source !== null && 'id' in source ? source.id : '';
  const request = useMutation({
    mutationFn: (reason: string) =>
      api.wallets.requestCancellation({
        params: { walletId, topUpId },
        body: { reference, reason },
      }),
    onSuccess: async (made) => {
      await invalidateWalletRequest(queryClient);
      onClose();
      announceWalletRequest(made, 'Cancellation');
    },
  });
  return (
    <ConfirmDialog
      open
      title="Cancel this top-up?"
      description="A second person has to approve it. Until then the money is held back from the family’s wallet."
      details={[
        { label: 'Top-up', value: movement.reference },
        { label: 'Amount', value: walletMoney(movement.amountMinor, currency) },
      ]}
      note="The top-up stays on record. Cancelling it adds a new entry that takes the money back out."
      reason={{
        label: 'Reason',
        placeholder: 'e.g. Keyed against the wrong family',
        missing: WALLET_CANCEL_REASON_MESSAGE,
      }}
      tone="destructive"
      icon={<BanIcon />}
      confirmLabel="Request cancellation"
      pending={request.isPending}
      error={request.error}
      onConfirm={(reason) => {
        request.mutate(reason);
      }}
      onCancel={() => {
        request.reset();
        onClose();
      }}
    />
  );
}

/** Mounted only for a chosen top-up, so the reference is made once per request and a retry replays. */
export function CancelTopUpDialog({
  walletId,
  movement,
  currency,
  onClose,
}: {
  walletId: string;
  movement: WalletJournalMovement | null;
  currency: string;
  onClose: () => void;
}) {
  return movement === null ? null : (
    <CancelForm
      key={movement.lineId}
      walletId={walletId}
      movement={movement}
      currency={currency}
      onClose={onClose}
    />
  );
}
