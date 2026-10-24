import { useQuery } from '@tanstack/react-query';
import { InfoIcon, SearchIcon, WalletIcon } from 'lucide-react';
import {
  FINANCE_PAGE_SIZE,
  type WalletList,
  type WalletListTotals,
} from '@eduvault/api-contract';
import { countOf } from '@eduvault/shared';
import {
  Card,
  CardContent,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  NumberedPager,
  SearchInput,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@eduvault/ui';
import { useApi } from '../api';
import { QueryState } from '../components/money/query-state';
import { useSearchText } from '../components/use-search-text';
import { walletMoney } from '../components/wallets/wallet-text';
import { WalletsTable } from '../components/wallets/wallets-table';
import { walletsQueryOptions } from '../queries';
import type { WalletsSearch } from '../wallets-search';

function Header() {
  return (
    <header className="flex flex-col gap-1">
      <h1 className="flex items-center gap-2">
        Wallets
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="About wallets"
              className="text-muted-foreground"
            >
              <InfoIcon className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            A wallet is money a family has paid in ahead. The guardian uses it
            for their children’s charges, and can set some aside for one child.
          </TooltipContent>
        </Tooltip>
      </h1>
      <p className="text-sm text-muted-foreground">
        One wallet for each paying guardian. Open one to record a top-up.
      </p>
    </header>
  );
}

function SummaryLine({
  totals,
  currency,
}: {
  totals: WalletListTotals;
  currency: string;
}) {
  return (
    <p className="text-sm text-muted-foreground">
      {countOf(totals.walletCount, 'wallet', 'wallets')} ·{' '}
      {walletMoney(totals.balanceMinor, currency)} held ·{' '}
      {walletMoney(totals.setAsideMinor, currency)} set aside ·{' '}
      {walletMoney(totals.freeMinor, currency)} free to use
    </p>
  );
}

function Empties({ searching }: { searching: boolean }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          {searching ? <SearchIcon /> : <WalletIcon />}
        </EmptyMedia>
        <EmptyTitle>
          {searching ? 'No wallets match' : 'No wallets yet'}
        </EmptyTitle>
        <EmptyDescription>
          {searching
            ? 'Try another name or phone number.'
            : 'A wallet appears when a guardian is set to pay a child’s fees.'}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function WalletsToolbar({
  search,
  shown,
  onSearchChange,
}: {
  search: WalletsSearch;
  shown: number;
  onSearchChange: (next: WalletsSearch) => void;
}) {
  const { text, onTextChange } = useSearchText(search.q, (q) => {
    onSearchChange({ ...search, q, page: undefined });
  });
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
      <SearchInput
        className="min-w-48 flex-1"
        aria-label="Search wallets"
        placeholder="Search guardian name or phone"
        value={text}
        onChange={(event) => {
          onTextChange(event.target.value);
        }}
      />
      <span className="ml-auto text-sm text-muted-foreground">
        {countOf(shown, 'wallet', 'wallets')}
      </span>
    </div>
  );
}

function WalletsCard({
  data,
  search,
  onSearchChange,
}: {
  data: WalletList;
  search: WalletsSearch;
  onSearchChange: (next: WalletsSearch) => void;
}) {
  return (
    <>
      <SummaryLine totals={data.totals} currency={data.currency} />
      <Card>
        <CardContent className="px-0">
          <WalletsToolbar
            search={search}
            shown={data.total}
            onSearchChange={onSearchChange}
          />
          {data.items.length === 0 ? (
            <Empties searching={search.q !== undefined} />
          ) : (
            <WalletsTable wallets={data.items} currency={data.currency} />
          )}
          {data.total > FINANCE_PAGE_SIZE ? (
            <NumberedPager
              page={search.page ?? 1}
              total={data.total}
              pageSize={FINANCE_PAGE_SIZE}
              onPage={(next) => {
                onSearchChange({
                  ...search,
                  page: next > 1 ? next : undefined,
                });
              }}
            />
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}

export function WalletsPage({
  search,
  onSearchChange,
}: {
  search: WalletsSearch;
  onSearchChange: (next: WalletsSearch) => void;
}) {
  const wallets = useQuery(walletsQueryOptions(useApi(), search));
  return (
    <section className="flex flex-col gap-4">
      <Header />
      <QueryState query={wallets} skeletonClassName="h-48">
        {(data) => (
          <WalletsCard
            data={data}
            search={search}
            onSearchChange={onSearchChange}
          />
        )}
      </QueryState>
    </section>
  );
}
