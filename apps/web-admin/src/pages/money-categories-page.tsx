import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { FEE_INCOME_SYSTEM_KEY } from '@eduvault/api-contract';
import { Can } from '@eduvault/auth-client';
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@eduvault/ui';
import { useApi } from '../api';
import { AddFeeCategoryDialog } from '../components/add-fee-category-dialog';
import { ChartTable } from '../components/money/chart-table';
import { JournalTab } from '../components/money/journal-tab';
import { scopeText } from '../components/money/money-text';
import { QueryState } from '../components/money/query-state';
import { campusesQueryOptions, ledgerAccountsQueryOptions } from '../queries';

export type CategoriesTab = 'categories' | 'journal';

function ScopeCallout() {
  const campuses = useQuery(campusesQueryOptions(useApi()));
  if (campuses.data === undefined || campuses.data.length === 0) {
    return null;
  }
  return (
    <Alert>
      <AlertDescription>
        {scopeText(campuses.data.map((campus) => campus.name))}
      </AlertDescription>
    </Alert>
  );
}

function Header({ onAdd }: { onAdd: () => void }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1>Money categories</h1>
        <p className="text-sm text-muted-foreground">
          The accountant’s list of what the school earns, owns and owes.
        </p>
      </div>
      <Can permission="ledger:manageAccounts">
        <Button type="button" onClick={onAdd}>
          <PlusIcon />
          Add a fee category
        </Button>
      </Can>
    </header>
  );
}

function Chart() {
  const chart = useQuery(ledgerAccountsQueryOptions(useApi()));
  return (
    <QueryState query={chart} skeletonClassName="h-48">
      {(data) => (
        <ChartTable
          accounts={data.items}
          currency={data.currency}
          scoped={data.scoped}
        />
      )}
    </QueryState>
  );
}

export function MoneyCategoriesPage({
  tab,
  onTabChange,
}: {
  tab: CategoriesTab;
  onTabChange: (tab: CategoriesTab) => void;
}) {
  const chart = useQuery(ledgerAccountsQueryOptions(useApi()));
  const [adding, setAdding] = useState(false);
  return (
    <section className="flex flex-col gap-4">
      <Header
        onAdd={() => {
          setAdding(true);
        }}
      />
      {chart.data?.scoped === true ? <ScopeCallout /> : null}
      <Tabs
        value={tab}
        onValueChange={(next) => {
          onTabChange(next === 'journal' ? 'journal' : 'categories');
        }}
      >
        <TabsList>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="journal">Journal</TabsTrigger>
        </TabsList>
      </Tabs>
      <Card>
        <CardContent className="px-0">
          {tab === 'journal' ? <JournalTab /> : <Chart />}
        </CardContent>
      </Card>
      <AddFeeCategoryDialog
        open={adding}
        feeIncome={chart.data?.items.find(
          (account) => account.systemKey === FEE_INCOME_SYSTEM_KEY
        )}
        onOpenChange={setAdding}
      />
    </section>
  );
}
