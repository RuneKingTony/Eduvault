import { useQuery } from '@tanstack/react-query';
import { InfoIcon, SearchIcon, WalletIcon } from 'lucide-react';
import {
  FINANCE_PAGE_SIZE,
  type WalletList,
  type WalletListTotals,
} from '@eduvault/api-contract';
import { countOf, walletMoney } from '@eduvault/shared';
import {
  Badge,
  Card,
  CardContent,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  NumberedPager,
  SearchInput,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@eduvault/ui';
import { useApi } from '../api';
import { QueryState } from '../components/money/query-state';
import { useSearchText } from '../components/use-search-text';
import { RequestsTab } from '../components/wallets/requests-tab';
import { WalletsTable } from '../components/wallets/wallets-table';
import { walletRequestsQueryOptions, walletsQueryOptions } from '../queries';
import {
  WALLETS_TABS,
  walletsTabOf,
  type WalletsSearch,
  type WalletsTab,
} from '../wallets-search';

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
        One wallet for each paying guardian. Open one to record a top-up or ask
        for a refund.
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
      {totals.heldMinor > 0
        ? `${walletMoney(totals.heldMinor, currency)} held for requests · `
        : ''}
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

const TAB_LABELS: Record<WalletsTab, string> = {
  wallets: 'Wallets',
  requests: 'Requests',
};

function TabLabel({ tab, waiting }: { tab: WalletsTab; waiting: number }) {
  return (
    <>
      {TAB_LABELS[tab]}
      {tab === 'requests' && waiting > 0 ? (
        <Badge variant="warning">{waiting}</Badge>
      ) : null}
    </>
  );
}

function RequestsPanel({
  requests,
  page,
  onPage,
}: {
  requests: ReturnType<typeof useRequestsQuery>;
  page: number;
  onPage: (page: number) => void;
}) {
  return (
    <Card className="mt-3">
      <CardContent className="px-0">
        <QueryState query={requests} skeletonClassName="h-48">
          {(list) => <RequestsTab list={list} page={page} onPage={onPage} />}
        </QueryState>
      </CardContent>
    </Card>
  );
}

function WalletsPanel({
  wallets,
  search,
  onSearchChange,
}: {
  wallets: Parameters<typeof QueryState<WalletList>>[0]['query'];
  search: WalletsSearch;
  onSearchChange: (next: WalletsSearch) => void;
}) {
  return (
    <QueryState query={wallets} skeletonClassName="h-48">
      {(data) => (
        <WalletsCard
          data={data}
          search={search}
          onSearchChange={onSearchChange}
        />
      )}
    </QueryState>
  );
}

function useRequestsQuery(page: number) {
  return useQuery(walletRequestsQueryOptions(useApi(), page));
}

export function WalletsPage({
  search,
  onSearchChange,
}: {
  search: WalletsSearch;
  onSearchChange: (next: WalletsSearch) => void;
}) {
  const tab = walletsTabOf(search);
  const page = search.page ?? 1;
  const wallets = useQuery(
    walletsQueryOptions(useApi(), tab === 'wallets' ? search : { q: search.q })
  );
  const requests = useRequestsQuery(tab === 'requests' ? page : 1);
  return (
    <section className="flex flex-col gap-4">
      <Header />
      <Tabs
        value={tab}
        onValueChange={(next) => {
          onSearchChange({
            tab: next === 'requests' ? 'requests' : undefined,
            q: search.q,
          });
        }}
      >
        <TabsList>
          {WALLETS_TABS.map((value) => (
            <TabsTrigger key={value} value={value}>
              <TabLabel
                tab={value}
                waiting={requests.data?.waitingCount ?? 0}
              />
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="wallets" className="mt-3 flex flex-col gap-4">
          <WalletsPanel
            wallets={wallets}
            search={search}
            onSearchChange={onSearchChange}
          />
        </TabsContent>
        <TabsContent value="requests">
          <RequestsPanel
            requests={requests}
            page={page}
            onPage={(next) => {
              onSearchChange({
                tab: 'requests',
                page: next > 1 ? next : undefined,
              });
            }}
          />
        </TabsContent>
      </Tabs>
    </section>
  );
}
