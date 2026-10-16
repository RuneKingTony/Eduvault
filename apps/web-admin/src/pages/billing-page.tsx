import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { InfoIcon, PlusIcon, ReceiptTextIcon } from 'lucide-react';
import { FINANCE_PAGE_SIZE } from '@eduvault/api-contract';
import { Can } from '@eduvault/auth-client';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  NumberedPager,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@eduvault/ui';
import { useApi } from '../api';
import type { BillingSearch } from '../billing-search';
import { BILLING_TIP } from '../components/billing/billing-text';
import {
  PrepareSheet,
  type Prepared,
} from '../components/billing/prepare-sheet';
import { ResultCallout } from '../components/billing/result-callout';
import { RunsTable } from '../components/billing/runs-table';
import { FeesTabs } from '../components/fees/fees-tabs';
import { QueryState } from '../components/money/query-state';
import { billingRunsQueryOptions } from '../queries';

function Header({ onPrepare }: { onPrepare: () => void }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2">
          Charge students
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="About charging students"
                className="text-muted-foreground"
              >
                <InfoIcon className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{BILLING_TIP}</TooltipContent>
          </Tooltip>
        </h1>
        <p className="text-sm text-muted-foreground">
          Charge students for a term in three steps: prepare, check, send.
        </p>
      </div>
      <Can permission="invoice:bill">
        <Button type="button" onClick={onPrepare}>
          <PlusIcon />
          Charge students
        </Button>
      </Can>
    </header>
  );
}

function NoRounds({ onPrepare }: { onPrepare: () => void }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ReceiptTextIcon />
        </EmptyMedia>
        <EmptyTitle>No charges sent yet</EmptyTitle>
      </EmptyHeader>
      <Can permission="invoice:bill">
        <EmptyContent>
          <Button type="button" size="sm" onClick={onPrepare}>
            <PlusIcon />
            Charge students
          </Button>
        </EmptyContent>
      </Can>
    </Empty>
  );
}

function Rounds({
  page,
  onPage,
  onPrepare,
}: {
  page: number;
  onPage: (page: number) => void;
  onPrepare: () => void;
}) {
  const runs = useQuery(billingRunsQueryOptions(useApi(), page));
  return (
    <QueryState query={runs} skeletonClassName="h-48">
      {(data) =>
        data.items.length === 0 ? (
          <NoRounds onPrepare={onPrepare} />
        ) : (
          <>
            <RunsTable runs={data.items} currency={data.currency} />
            {data.total > FINANCE_PAGE_SIZE ? (
              <NumberedPager
                page={page}
                total={data.total}
                pageSize={FINANCE_PAGE_SIZE}
                onPage={onPage}
              />
            ) : null}
          </>
        )
      }
    </QueryState>
  );
}

export function BillingPage({
  search,
  onSearchChange,
}: {
  search: BillingSearch;
  onSearchChange: (next: BillingSearch) => void;
}) {
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const preparing = search.prepare === 1;
  const setPreparing = (open: boolean) => {
    onSearchChange({ ...search, prepare: open ? 1 : undefined });
  };
  return (
    <section className="flex flex-col gap-4">
      <FeesTabs term={undefined} />
      <Header
        onPrepare={() => {
          setPreparing(true);
        }}
      />
      {prepared === null ? null : <ResultCallout prepared={prepared} />}
      <Card>
        <CardHeader>
          <CardTitle>Earlier rounds</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <Rounds
            page={search.page ?? 1}
            onPage={(page) => {
              onSearchChange({ ...search, page: page > 1 ? page : undefined });
            }}
            onPrepare={() => {
              setPreparing(true);
            }}
          />
        </CardContent>
      </Card>
      <PrepareSheet
        open={preparing}
        onOpenChange={setPreparing}
        onPrepared={setPrepared}
      />
    </section>
  );
}
