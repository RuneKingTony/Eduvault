import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShoppingCartIcon } from 'lucide-react';
import type { PortalChild, PortalMe } from '@eduvault/api-contract';
import { fmtDate, naira } from '@eduvault/shared';
import {
  Card,
  CardContent,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  ErrorMessage,
  PageSkeleton,
} from '@eduvault/ui';
import { useApi } from '../api';
import { NoChildren } from '../components/no-children';
import { PriceListCard } from '../components/price-list-card';
import { PurchaseCard } from '../components/purchase-card';
import {
  lastPurchaseNote,
  termPurchasesNote,
} from '../components/purchase-text';
import {
  portalPriceListQueryOptions,
  portalPurchasesQueryOptions,
} from '../queries';
import { selectChild } from '../selected-child';

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: ReactNode;
  sub: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
        <span className="truncate text-sm text-muted-foreground">{sub}</span>
      </CardContent>
    </Card>
  );
}

function NoPurchases() {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ShoppingCartIcon />
        </EmptyMedia>
        <EmptyTitle>No purchases yet</EmptyTitle>
        <EmptyDescription>
          Books and uniforms bought at the school store show up here with their
          receipts.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function PriceList({ studentId }: { studentId: string }) {
  const list = useQuery(portalPriceListQueryOptions(useApi(), studentId));
  if (list.data === undefined) {
    return list.isPending ? (
      <PageSkeleton rows={2} />
    ) : (
      <ErrorMessage error={list.error} />
    );
  }
  return <PriceListCard list={list.data} />;
}

function ChildPurchases({ child }: { child: PortalChild }) {
  const purchases = useQuery(portalPurchasesQueryOptions(useApi(), child.id));
  if (purchases.data === undefined) {
    return purchases.isPending ? (
      <PageSkeleton rows={4} />
    ) : (
      <ErrorMessage error={purchases.error} />
    );
  }
  const { data } = purchases;
  const [last] = data.sales;
  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <h1 className="flex items-center gap-2">
          <ShoppingCartIcon aria-hidden="true" />
          Purchases
        </h1>
        <p className="text-muted-foreground">
          Books, uniforms and other items bought for {child.firstName} at the
          school store
        </p>
      </header>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat
          label="Spent this term"
          value={naira(data.spentThisTermMinor)}
          sub={termPurchasesNote(data.termPurchaseCount, data.termName)}
        />
        <Stat
          label="Items bought"
          value={data.itemsBought}
          sub="Books and uniforms"
        />
        <Stat
          label="Last purchase"
          value={last === undefined ? '—' : fmtDate(last.date)}
          sub={lastPurchaseNote(last)}
        />
      </div>
      <h2 className="text-lg font-medium">Purchase history</h2>
      {data.sales.length === 0 ? (
        <NoPurchases />
      ) : (
        data.sales.map((sale) => <PurchaseCard key={sale.id} sale={sale} />)
      )}
      <PriceList studentId={child.id} />
    </section>
  );
}

export function PurchasesPage({
  me,
  childId,
}: {
  me: PortalMe;
  childId: string | undefined;
}) {
  const selected = selectChild(me.children, childId);
  if (selected === undefined) {
    return <NoChildren />;
  }
  return <ChildPurchases key={selected.id} child={selected} />;
}
