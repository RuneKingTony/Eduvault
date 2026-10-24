import { useQuery } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import type { Wallet } from '@eduvault/api-contract';
import { useCan } from '@eduvault/auth-client';
import { Button } from '@eduvault/ui';
import { useApi } from '../api';
import {
  DetailCrumbs,
  DetailNotFound,
  DetailPage,
} from '../components/detail-page';
import { BalanceCards } from '../components/wallets/wallet-cards';
import { ReservedAccountCard } from '../components/wallets/reserved-account-card';
import { ChildrenCard } from '../components/wallets/wallet-children-card';
import { WalletsLink } from '../components/wallets/wallet-links';
import { MovementsCard } from '../components/wallets/wallet-movements-card';
import { TopUpSheet } from '../components/wallets/top-up-sheet';
import { walletQueryOptions } from '../queries';
import type { WalletSearch } from '../wallets-search';

function Crumbs({ last }: { last: string }) {
  return (
    <DetailCrumbs parent={<WalletsLink>Wallets</WalletsLink>} last={last} />
  );
}

function WalletNotFound() {
  return (
    <DetailNotFound
      heading="Not found"
      crumbs={<Crumbs last="Not found" />}
      title="No wallet here"
      back={
        <Button asChild variant="outline">
          <WalletsLink>Back to wallets</WalletsLink>
        </Button>
      }
    />
  );
}

function WalletHeader({
  wallet,
  onTopUp,
}: {
  wallet: Wallet;
  onTopUp: () => void;
}) {
  const canTopUp = useCan('wallet', 'topUp');
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1>{wallet.guardian.name}</h1>
        <p className="text-sm text-muted-foreground">{wallet.guardian.phone}</p>
      </div>
      {canTopUp ? (
        <Button type="button" onClick={onTopUp}>
          <PlusIcon />
          Record top-up
        </Button>
      ) : null}
    </header>
  );
}

function WalletBody({
  wallet,
  search,
  onSearchChange,
}: {
  wallet: Wallet;
  search: WalletSearch;
  onSearchChange: (next: WalletSearch) => void;
}) {
  const canTopUp = useCan('wallet', 'topUp');
  const setTopUp = (open: boolean) => {
    onSearchChange({ ...search, topup: open ? 1 : undefined });
  };
  return (
    <section className="flex flex-col gap-4">
      <Crumbs last={wallet.guardian.name} />
      <WalletHeader
        wallet={wallet}
        onTopUp={() => {
          setTopUp(true);
        }}
      />
      <BalanceCards wallet={wallet} />
      <ReservedAccountCard wallet={wallet} />
      <ChildrenCard wallet={wallet} />
      <MovementsCard
        walletId={wallet.id}
        page={search.page ?? 1}
        onPage={(next) => {
          onSearchChange({ ...search, page: next > 1 ? next : undefined });
        }}
      />
      {canTopUp ? (
        <TopUpSheet
          wallet={wallet}
          open={search.topup === 1}
          onOpenChange={setTopUp}
        />
      ) : null}
    </section>
  );
}

export function WalletPage({
  walletId,
  search,
  onSearchChange,
}: {
  walletId: string;
  search: WalletSearch;
  onSearchChange: (next: WalletSearch) => void;
}) {
  const wallet = useQuery(walletQueryOptions(useApi(), walletId));
  return (
    <DetailPage queries={[wallet]} notFound={<WalletNotFound />} rows={3}>
      {([data]) => (
        <WalletBody
          wallet={data}
          search={search}
          onSearchChange={onSearchChange}
        />
      )}
    </DetailPage>
  );
}
