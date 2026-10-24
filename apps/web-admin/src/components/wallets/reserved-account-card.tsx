import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LandmarkIcon } from 'lucide-react';
import { denialMessage, type Wallet } from '@eduvault/api-contract';
import { useCan } from '@eduvault/auth-client';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  toast,
} from '@eduvault/ui';
import { useApi } from '../../api';
import { invalidateWallets } from '../../queries';
import { Fact } from './wallet-trace';

const DENIED = 'You need permission to create a Monnify account.';

function useCreate(walletId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.wallets.reservedAccount({ params: { walletId } }),
    onSuccess: async () => {
      await invalidateWallets(queryClient);
      toast.success('Monnify account created.');
    },
    onError: (failure) => {
      toast.error(denialMessage(failure, DENIED));
    },
  });
}

function Missing({ wallet }: { wallet: Wallet }) {
  const canCreate = useCan('wallet', 'topUp');
  const create = useCreate(wallet.id);
  if (!wallet.gatewayConnected) {
    return (
      <p className="text-sm text-muted-foreground">
        Online payments aren’t connected. An owner can connect Monnify in
        Settings &gt; Online payments.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">
        This family has no account yet. One is made when a guardian starts
        paying fees; create it now if that didn’t happen.
      </p>
      {canCreate ? (
        <Button
          type="button"
          variant="outline"
          disabled={create.isPending}
          onClick={() => {
            create.mutate();
          }}
        >
          <LandmarkIcon />
          Create account
        </Button>
      ) : null}
    </div>
  );
}

export function ReservedAccountCard({ wallet }: { wallet: Wallet }) {
  const account = wallet.reservedAccount;
  return (
    <Card role="group" aria-label="Monnify account">
      <CardHeader>
        <CardTitle>Monnify account</CardTitle>
        <CardDescription>
          The bank account this family pays into. What arrives reaches the
          wallet by itself.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {account === null ? (
          <Missing wallet={wallet} />
        ) : (
          <dl className="grid gap-3 sm:grid-cols-3">
            <Fact label="Bank">{account.bankName}</Fact>
            <Fact label="Account number">{account.accountNumber}</Fact>
            <Fact label="Account name">{account.accountName}</Fact>
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
