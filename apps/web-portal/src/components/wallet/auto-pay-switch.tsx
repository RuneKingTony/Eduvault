import { useId } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { denialMessage, type Wallet } from '@eduvault/api-contract';
import { useCan } from '@eduvault/auth-client';
import { generateWalletReference, lagosDateOf } from '@eduvault/shared';
import { Label, Switch, toast } from '@eduvault/ui';
import { useApi } from '../../api';
import { autoPayMutationOptions } from '../../queries';

const DENIED = 'You need permission to change auto-pay.';

export function AutoPaySwitch({ wallet }: { wallet: Wallet }) {
  const id = useId();
  const api = useApi();
  const queryClient = useQueryClient();
  const canSpend = useCan('wallet', 'spend');
  const mutation = useMutation(autoPayMutationOptions(api, queryClient));
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
      <div className="flex flex-col gap-0.5">
        <Label htmlFor={id}>Auto-pay</Label>
        <p className="text-sm text-muted-foreground">
          When money reaches the wallet, pay your children’s oldest charges
          first.
        </p>
      </div>
      <Switch
        id={id}
        checked={wallet.autoPay}
        disabled={!canSpend || mutation.isPending}
        onCheckedChange={(enabled) => {
          mutation.mutate(
            {
              enabled,
              reference: generateWalletReference(
                'autoPay',
                lagosDateOf(new Date())
              ),
            },
            {
              onSuccess: () => {
                toast.success(enabled ? 'Auto-pay is on.' : 'Auto-pay is off.');
              },
              onError: (failure) => {
                toast.error(denialMessage(failure, DENIED));
              },
            }
          );
        }}
      />
    </div>
  );
}
