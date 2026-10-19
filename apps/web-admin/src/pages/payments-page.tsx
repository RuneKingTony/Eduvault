import { useQuery } from '@tanstack/react-query';
import { BanknoteIcon, InfoIcon, PlusIcon, SearchIcon } from 'lucide-react';
import {
  FINANCE_PAGE_SIZE,
  type PaymentList,
  type PaymentListSummary,
} from '@eduvault/api-contract';
import { useCan } from '@eduvault/auth-client';
import { countOf, money } from '@eduvault/shared';
import {
  Button,
  Card,
  CardContent,
  Empty,
  EmptyContent,
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
import { PaymentsTable } from '../components/payments/payments-table';
import { RecordPaymentSheet } from '../components/payments/record-payment-sheet';
import type { PaymentsSearch } from '../payments-search';
import { paymentsQueryOptions } from '../queries';
import { useSearchText } from '../components/use-search-text';

function RecordButton({ onOpen }: { onOpen: () => void }) {
  return (
    <Button type="button" onClick={onOpen}>
      <PlusIcon />
      Record payment
    </Button>
  );
}

function Header({
  canRecord,
  onRecord,
}: {
  canRecord: boolean;
  onRecord: () => void;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2">
          Payments
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="About payments"
                className="text-muted-foreground"
              >
                <InfoIcon className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              A payment posts at once, so the till is never blocked. Undoing one
              is a void that a second person approves.
            </TooltipContent>
          </Tooltip>
        </h1>
        <p className="text-sm text-muted-foreground">
          Cash, transfer and POS payments recorded at the bursary.
        </p>
      </div>
      {canRecord ? <RecordButton onOpen={onRecord} /> : null}
    </header>
  );
}

function SummaryLine({
  summary,
  currency,
}: {
  summary: PaymentListSummary;
  currency: string;
}) {
  const waiting =
    summary.cancellationsWaiting > 0
      ? ` · ${countOf(summary.cancellationsWaiting, 'cancellation', 'cancellations')} waiting for approval`
      : '';
  return (
    <p className="text-sm text-muted-foreground">
      {countOf(summary.receiptCount, 'receipt', 'receipts')} ·{' '}
      {money(summary.receivedMinor, currency)} received{waiting}
    </p>
  );
}

function Empties({
  searching,
  canRecord,
  onRecord,
}: {
  searching: boolean;
  canRecord: boolean;
  onRecord: () => void;
}) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          {searching ? <SearchIcon /> : <BanknoteIcon />}
        </EmptyMedia>
        <EmptyTitle>
          {searching ? 'No receipts match' : 'No payments yet'}
        </EmptyTitle>
        {searching ? (
          <EmptyDescription>Try another search.</EmptyDescription>
        ) : null}
      </EmptyHeader>
      {!searching && canRecord ? (
        <EmptyContent>
          <RecordButton onOpen={onRecord} />
        </EmptyContent>
      ) : null}
    </Empty>
  );
}

function PaymentsToolbar({
  search,
  shown,
  onSearchChange,
}: {
  search: PaymentsSearch;
  shown: number;
  onSearchChange: (next: PaymentsSearch) => void;
}) {
  const { text, onTextChange } = useSearchText(search.q, (q) => {
    onSearchChange({ ...search, q, page: undefined });
  });
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
      <SearchInput
        className="min-w-48 flex-1"
        aria-label="Search payments"
        placeholder="Search receipt, payer or student"
        value={text}
        onChange={(event) => {
          onTextChange(event.target.value);
        }}
      />
      <span className="ml-auto text-sm text-muted-foreground">
        {countOf(shown, 'receipt', 'receipts')}
      </span>
    </div>
  );
}

function PaymentsCard({
  data,
  search,
  canRecord,
  onSearchChange,
}: {
  data: PaymentList;
  search: PaymentsSearch;
  canRecord: boolean;
  onSearchChange: (next: PaymentsSearch) => void;
}) {
  return (
    <>
      <SummaryLine summary={data.summary} currency={data.currency} />
      <Card>
        <CardContent className="px-0">
          <PaymentsToolbar
            search={search}
            shown={data.total}
            onSearchChange={onSearchChange}
          />
          {data.items.length === 0 ? (
            <Empties
              searching={search.q !== undefined}
              canRecord={canRecord}
              onRecord={() => {
                onSearchChange({ ...search, record: 1 });
              }}
            />
          ) : (
            <PaymentsTable payments={data.items} currency={data.currency} />
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

export function PaymentsPage({
  search,
  onSearchChange,
}: {
  search: PaymentsSearch;
  onSearchChange: (next: PaymentsSearch) => void;
}) {
  const canRecord = useCan('payment', 'record');
  const payments = useQuery(paymentsQueryOptions(useApi(), search));
  const setRecord = (open: boolean) => {
    onSearchChange({ ...search, record: open ? 1 : undefined });
  };
  return (
    <section className="flex flex-col gap-4">
      <Header
        canRecord={canRecord}
        onRecord={() => {
          setRecord(true);
        }}
      />
      <QueryState query={payments} skeletonClassName="h-48">
        {(data) => (
          <PaymentsCard
            data={data}
            search={search}
            canRecord={canRecord}
            onSearchChange={onSearchChange}
          />
        )}
      </QueryState>
      {canRecord ? (
        <RecordPaymentSheet
          open={search.record === 1}
          onOpenChange={setRecord}
        />
      ) : null}
    </section>
  );
}
