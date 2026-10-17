import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckIcon, InfoIcon, SearchIcon } from 'lucide-react';
import {
  BALANCE_FILTERS,
  FINANCE_PAGE_SIZE,
  type BalanceList,
  type BalanceRow,
} from '@eduvault/api-contract';
import { useCan } from '@eduvault/auth-client';
import { oneOf } from '@eduvault/shared';
import {
  Card,
  CardContent,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  NativeSelect,
  NativeSelectOption,
  NumberedPager,
  SearchInput,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@eduvault/ui';
import { useApi } from '../api';
import { FeesTabs } from '../components/fees/fees-tabs';
import { QueryState } from '../components/money/query-state';
import { AccountTiles } from '../components/payments/account-tiles';
import { BalancesTable } from '../components/payments/balances-table';
import { RecordPaymentSheet } from '../components/payments/record-payment-sheet';
import type { Prefill } from '../components/payments/record-payment-model';
import { FILTER_LABELS } from '../components/payments/statement-text';
import type { AccountsSearch } from '../accounts-search';
import { balancesQueryOptions } from '../queries';

function Header() {
  return (
    <header className="flex flex-col gap-1">
      <h1 className="flex items-center gap-2">
        Who owes
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="About who owes"
              className="text-muted-foreground"
            >
              <InfoIcon className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            What a family owes is worked out from every charge and payment, so
            nobody types it in by hand.
          </TooltipContent>
        </Tooltip>
      </h1>
      <p className="text-sm text-muted-foreground">
        Students with school fees still to pay.
      </p>
    </header>
  );
}

function Empties({ owingOnly }: { owingOnly: boolean }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          {owingOnly ? <CheckIcon /> : <SearchIcon />}
        </EmptyMedia>
        <EmptyTitle>
          {owingOnly ? 'Nobody owes fees' : 'No students match'}
        </EmptyTitle>
        {owingOnly ? (
          <EmptyDescription>
            Every student you look after is paid up.
          </EmptyDescription>
        ) : null}
      </EmptyHeader>
    </Empty>
  );
}

function Toolbar({
  search,
  shown,
  onSearchChange,
}: {
  search: AccountsSearch;
  shown: number;
  onSearchChange: (next: AccountsSearch) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
      <SearchInput
        className="min-w-48 flex-1"
        aria-label="Search students"
        placeholder="Search name or GF number"
        value={search.q ?? ''}
        onChange={(event) => {
          onSearchChange({
            ...search,
            q: event.target.value === '' ? undefined : event.target.value,
            page: undefined,
          });
        }}
      />
      <NativeSelect
        aria-label="Show"
        value={search.filter ?? 'owing'}
        onChange={(event) => {
          onSearchChange({
            ...search,
            filter: oneOf(BALANCE_FILTERS, event.target.value),
            page: undefined,
          });
        }}
      >
        {BALANCE_FILTERS.map((filter) => (
          <NativeSelectOption key={filter} value={filter}>
            {FILTER_LABELS[filter]}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <span className="ml-auto text-sm text-muted-foreground">
        {shown} shown
      </span>
    </div>
  );
}

function BalancesCard({
  data,
  search,
  onSearchChange,
  onRecord,
}: {
  data: BalanceList;
  search: AccountsSearch;
  onSearchChange: (next: AccountsSearch) => void;
  onRecord: ((row: BalanceRow) => void) | undefined;
}) {
  return (
    <>
      <AccountTiles
        summary={data.summary}
        currency={data.currency}
        onOwing={() => {
          onSearchChange({ ...search, filter: undefined, page: undefined });
        }}
      />
      <Card>
        <CardContent className="px-0">
          <Toolbar
            search={search}
            shown={data.total}
            onSearchChange={onSearchChange}
          />
          {data.items.length === 0 ? (
            <Empties
              owingOnly={
                (search.filter ?? 'owing') === 'owing' && search.q === undefined
              }
            />
          ) : (
            <BalancesTable
              rows={data.items}
              currency={data.currency}
              onRecord={onRecord}
            />
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

export function WhoOwesPage({
  search,
  onSearchChange,
}: {
  search: AccountsSearch;
  onSearchChange: (next: AccountsSearch) => void;
}) {
  const canRecord = useCan('payment', 'record');
  const [recording, setRecording] = useState<Prefill | null>(null);
  const balances = useQuery(balancesQueryOptions(useApi(), search));
  const record = (row: BalanceRow) => {
    setRecording({ guardianId: row.guardian?.id, studentId: row.studentId });
  };
  return (
    <section className="flex flex-col gap-4">
      <FeesTabs term={undefined} />
      <Header />
      <QueryState query={balances} skeletonClassName="h-48">
        {(data) => (
          <BalancesCard
            data={data}
            search={search}
            onSearchChange={onSearchChange}
            onRecord={canRecord ? record : undefined}
          />
        )}
      </QueryState>
      {canRecord ? (
        <RecordPaymentSheet
          open={recording !== null}
          prefill={recording ?? {}}
          stay
          onOpenChange={(open) => {
            if (!open) {
              setRecording(null);
            }
          }}
        />
      ) : null}
    </section>
  );
}
