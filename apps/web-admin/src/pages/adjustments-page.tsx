import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import type { StudentDiscount } from '@eduvault/api-contract';
import { useCan } from '@eduvault/auth-client';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@eduvault/ui';
import { useApi } from '../api';
import {
  ADJUSTMENT_TABS,
  tabOf,
  type AdjustmentsSearch,
  type AdjustmentsTab,
} from '../adjustments-search';
import { CorrectionsTab } from '../components/adjustments/corrections-tab';
import { DiscountSheet } from '../components/adjustments/discount-sheet';
import { DiscountsTab } from '../components/adjustments/discounts-tab';
import { EndDiscountDialog } from '../components/adjustments/end-discount-dialog';
import { RequestSheet } from '../components/adjustments/request-sheet';
import { VoidsTab } from '../components/adjustments/voids-tab';
import { QueryState } from '../components/money/query-state';
import {
  adjustmentsQueryOptions,
  discountsQueryOptions,
  paymentVoidsQueryOptions,
} from '../queries';

const TAB_LABELS: Record<AdjustmentsTab, string> = {
  corrections: 'Refunds and corrections',
  voids: 'Cancelled payments',
  discounts: 'Discounts',
};

function TabLabel({ tab, waiting }: { tab: AdjustmentsTab; waiting: number }) {
  return (
    <>
      {TAB_LABELS[tab]}
      {waiting > 0 ? <Badge variant="warning">{waiting}</Badge> : null}
    </>
  );
}

const NEW_LABELS: Record<AdjustmentsTab, string | null> = {
  corrections: 'New request',
  voids: null,
  discounts: 'New discount',
};

function Header({
  tab,
  canCreate,
  onNew,
}: {
  tab: AdjustmentsTab;
  canCreate: boolean;
  onNew: () => void;
}) {
  const action = NEW_LABELS[tab];
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1>Discounts and refunds</h1>
        <p className="text-sm text-muted-foreground">
          Refunds, discounts and corrections. One person asks, a boss approves.
        </p>
      </div>
      {canCreate && action !== null ? (
        <Button type="button" onClick={onNew}>
          <PlusIcon />
          {action}
        </Button>
      ) : null}
    </header>
  );
}

function useAdjustmentsData(tab: AdjustmentsTab, page: number) {
  const api = useApi();
  return {
    corrections: useQuery(
      adjustmentsQueryOptions(api, tab === 'corrections' ? page : 1)
    ),
    voids: useQuery(paymentVoidsQueryOptions(api, tab === 'voids' ? page : 1)),
    discounts: useQuery(
      discountsQueryOptions(api, tab === 'discounts' ? page : 1)
    ),
  };
}

type AdjustmentsData = ReturnType<typeof useAdjustmentsData>;

function TabBodies({
  data,
  page,
  canEnd,
  onPage,
  onEnd,
}: {
  data: AdjustmentsData;
  page: number;
  canEnd: boolean;
  onPage: (page: number) => void;
  onEnd: (discount: StudentDiscount) => void;
}) {
  return (
    <Card className="mt-3">
      <CardContent className="px-0">
        <TabsContent value="corrections">
          <QueryState query={data.corrections} skeletonClassName="h-48">
            {(list) => (
              <CorrectionsTab list={list} page={page} onPage={onPage} />
            )}
          </QueryState>
        </TabsContent>
        <TabsContent value="voids">
          <QueryState query={data.voids} skeletonClassName="h-48">
            {(list) => <VoidsTab list={list} page={page} onPage={onPage} />}
          </QueryState>
        </TabsContent>
        <TabsContent value="discounts">
          <QueryState query={data.discounts} skeletonClassName="h-48">
            {(list) => (
              <DiscountsTab
                list={list}
                page={page}
                canEnd={canEnd}
                onPage={onPage}
                onEnd={onEnd}
              />
            )}
          </QueryState>
        </TabsContent>
      </CardContent>
    </Card>
  );
}

function Sheets({
  search,
  data,
  ending,
  onNewChange,
  onEndClose,
}: {
  search: AdjustmentsSearch;
  data: AdjustmentsData;
  ending: StudentDiscount | null;
  onNewChange: (open: boolean) => void;
  onEndClose: () => void;
}) {
  const tab = tabOf(search);
  return (
    <>
      <RequestSheet
        open={search.new === 1 && tab !== 'discounts'}
        onOpenChange={onNewChange}
        prefill={{
          kind: search.kind,
          studentId: search.student,
          amountMinor: search.amount,
        }}
      />
      <DiscountSheet
        open={search.new === 1 && tab === 'discounts'}
        onOpenChange={onNewChange}
      />
      <EndDiscountDialog
        discount={ending}
        currency={data.discounts.data?.currency ?? 'NGN'}
        onClose={onEndClose}
      />
    </>
  );
}

function TabsStrip({
  tab,
  data,
  page,
  canEnd,
  onTab,
  onPage,
  onEnd,
}: {
  tab: AdjustmentsTab;
  data: AdjustmentsData;
  page: number;
  canEnd: boolean;
  onTab: (tab: AdjustmentsTab | undefined) => void;
  onPage: (page: number) => void;
  onEnd: (discount: StudentDiscount) => void;
}) {
  const waiting: Record<AdjustmentsTab, number> = {
    corrections: data.corrections.data?.waitingCount ?? 0,
    voids: data.voids.data?.waitingCount ?? 0,
    discounts: data.discounts.data?.waitingCount ?? 0,
  };
  return (
    <Tabs
      value={tab}
      onValueChange={(next) => {
        onTab(ADJUSTMENT_TABS.find((candidate) => candidate === next));
      }}
    >
      <TabsList>
        {ADJUSTMENT_TABS.map((value) => (
          <TabsTrigger key={value} value={value}>
            <TabLabel tab={value} waiting={waiting[value]} />
          </TabsTrigger>
        ))}
      </TabsList>
      <TabBodies
        data={data}
        page={page}
        canEnd={canEnd}
        onPage={onPage}
        onEnd={onEnd}
      />
    </Tabs>
  );
}

export function AdjustmentsPage({
  search,
  onSearchChange,
}: {
  search: AdjustmentsSearch;
  onSearchChange: (next: AdjustmentsSearch) => void;
}) {
  const canCreate = useCan('adjustment', 'create');
  const tab = tabOf(search);
  const page = search.page ?? 1;
  const data = useAdjustmentsData(tab, page);
  const [ending, setEnding] = useState<StudentDiscount | null>(null);
  const setNew = (open: boolean) => {
    onSearchChange({
      ...search,
      new: open ? 1 : undefined,
      kind: undefined,
      student: undefined,
      amount: undefined,
    });
  };
  return (
    <section className="flex flex-col gap-4">
      <Header
        tab={tab}
        canCreate={canCreate}
        onNew={() => {
          setNew(true);
        }}
      />
      <TabsStrip
        tab={tab}
        data={data}
        page={page}
        canEnd={canCreate}
        onTab={(next) => {
          onSearchChange({ tab: next === 'corrections' ? undefined : next });
        }}
        onPage={(next) => {
          onSearchChange({ ...search, page: next > 1 ? next : undefined });
        }}
        onEnd={setEnding}
      />
      {canCreate ? (
        <Sheets
          search={search}
          data={data}
          ending={ending}
          onNewChange={setNew}
          onEndClose={() => {
            setEnding(null);
          }}
        />
      ) : null}
    </section>
  );
}
