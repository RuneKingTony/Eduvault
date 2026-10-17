import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { StoreIcon } from 'lucide-react';
import { naira } from '@eduvault/shared';
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ErrorMessage,
} from '@eduvault/ui';
import { useApi } from '../../api';
import { dashboardStoreQueryOptions } from '../../queries';
import { MaskedMoney } from '../store/masked-money';
import { COSTS_HIDDEN_NOTE, termSoldNote } from '../store/store-text';
import { useShowCosts } from '../store/use-show-costs';
import { CardSkeleton } from './card-states';

function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: ReactNode;
  note: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      <span className="text-sm text-muted-foreground">{note}</span>
    </div>
  );
}

export function StoreCard() {
  const store = useQuery(dashboardStoreQueryOptions(useApi()));
  const [showCosts] = useShowCosts();
  if (store.isPending) {
    return <CardSkeleton rows={1} />;
  }
  if (store.data === undefined) {
    return <ErrorMessage error={store.error} />;
  }
  const { data } = store;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <StoreIcon aria-hidden="true" />
          Store
        </CardTitle>
        <CardDescription>Books and uniforms sold and in stock</CardDescription>
        <CardAction>
          <Button asChild variant="ghost" size="sm">
            <Link to="/finance/store">Store</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <Stat
          label="Sold this term"
          value={naira(data.termSalesMinor)}
          note={termSoldNote(data.termStudentsServed)}
        />
        <Stat
          label="Profit this term"
          value={
            <MaskedMoney
              minor={data.termSalesMinor - data.termCostMinor}
              show={showCosts}
            />
          }
          note={showCosts ? 'Sales minus cost' : COSTS_HIDDEN_NOTE}
        />
        <Stat label="Items sold" value={data.termItemsSold} note="This term" />
        <Stat
          label="Stock value"
          value={<MaskedMoney minor={data.stockValueMinor} show={showCosts} />}
          note="At cost"
        />
      </CardContent>
    </Card>
  );
}
