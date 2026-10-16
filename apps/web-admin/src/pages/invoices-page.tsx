import { useQuery } from '@tanstack/react-query';
import { InfoIcon, SearchIcon } from 'lucide-react';
import {
  FINANCE_PAGE_SIZE,
  type InvoiceListSummary,
} from '@eduvault/api-contract';
import { countOf, money } from '@eduvault/shared';
import {
  Card,
  CardContent,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  NumberedPager,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@eduvault/ui';
import { useApi } from '../api';
import { FeesTabs } from '../components/fees/fees-tabs';
import { InvoicesTable } from '../components/invoices/invoices-table';
import { InvoicesToolbar } from '../components/invoices/invoices-toolbar';
import { QueryState } from '../components/money/query-state';
import type { InvoicesSearch } from '../invoices-search';
import { invoicesQueryOptions } from '../queries';

function Header() {
  return (
    <header className="flex flex-col gap-1">
      <h1 className="flex items-center gap-2">
        Charges
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="About charges"
              className="text-muted-foreground"
            >
              <InfoIcon className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            Every charge is added to the student’s account.
          </TooltipContent>
        </Tooltip>
      </h1>
      <p className="text-sm text-muted-foreground">
        Everything students have been charged: term fees and one-off charges.
      </p>
    </header>
  );
}

function SummaryLine({
  summary,
  currency,
}: {
  summary: InvoiceListSummary;
  currency: string;
}) {
  return (
    <p className="text-sm text-muted-foreground">
      {countOf(summary.sentCount, 'charge', 'charges')} sent ·{' '}
      {money(summary.sentTotalMinor, currency)} · {summary.draftCount} waiting
      to be sent
    </p>
  );
}

function NoMatch() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchIcon />
        </EmptyMedia>
        <EmptyTitle>No charges match</EmptyTitle>
        <EmptyDescription>Try another kind, status or search.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export function InvoicesPage({
  search,
  onSearchChange,
}: {
  search: InvoicesSearch;
  onSearchChange: (next: InvoicesSearch) => void;
}) {
  const page = search.page ?? 1;
  const invoices = useQuery(invoicesQueryOptions(useApi(), search));
  return (
    <section className="flex flex-col gap-4">
      <FeesTabs term={undefined} />
      <Header />
      <QueryState query={invoices} skeletonClassName="h-48">
        {(data) => (
          <>
            <SummaryLine summary={data.summary} currency={data.currency} />
            <Card>
              <CardContent className="px-0">
                <InvoicesToolbar
                  search={search}
                  counts={data.counts}
                  shown={data.total}
                  onSearchChange={onSearchChange}
                />
                {data.items.length === 0 ? (
                  <NoMatch />
                ) : (
                  <InvoicesTable
                    invoices={data.items}
                    currency={data.currency}
                  />
                )}
                {data.total > FINANCE_PAGE_SIZE ? (
                  <NumberedPager
                    page={page}
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
        )}
      </QueryState>
    </section>
  );
}
