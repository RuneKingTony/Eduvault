import { TruckIcon } from 'lucide-react';
import type { Campus, Delivery, DeliveryList } from '@eduvault/api-contract';
import { fmtDate } from '@eduvault/shared';
import {
  Card,
  CardContent,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@eduvault/ui';
import { FinancePager } from '../money/query-state';
import { MaskedMoney } from './masked-money';
import { GO_LIVE_NOTE } from './store-text';

type CampusRef = Pick<Campus, 'id' | 'name'>;

interface DeliveriesTableProps {
  data: DeliveryList;
  campuses: readonly CampusRef[];
  showCampus: boolean;
  showCosts: boolean;
  page: number;
  onPage: (page: number) => void;
}

function NoDeliveries() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <TruckIcon />
        </EmptyMedia>
        <EmptyTitle>No deliveries yet</EmptyTitle>
        <EmptyDescription>
          Stock that arrives at the store is recorded here.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function DeliveryRow({
  delivery,
  campusName,
  showCosts,
}: {
  delivery: Delivery;
  campusName: string | undefined;
  showCosts: boolean;
}) {
  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{delivery.number}</TableCell>
      <TableCell>{fmtDate(delivery.receivedOn)}</TableCell>
      <TableCell>{delivery.supplierName}</TableCell>
      {campusName === undefined ? null : <TableCell>{campusName}</TableCell>}
      <TableCell className="tabular-nums">{delivery.itemCount}</TableCell>
      <TableCell className="font-semibold tabular-nums">
        <MaskedMoney minor={delivery.totalMinor} show={showCosts} />
      </TableCell>
      <TableCell
        className={
          delivery.moneyAccount === null ? 'text-muted-foreground' : ''
        }
      >
        {delivery.moneyAccount?.name ?? GO_LIVE_NOTE}
      </TableCell>
    </TableRow>
  );
}

export function DeliveriesTable({
  data,
  campuses,
  showCampus,
  showCosts,
  page,
  onPage,
}: DeliveriesTableProps) {
  const campusName = (id: string) =>
    showCampus
      ? (campuses.find((campus) => campus.id === id)?.name ?? '')
      : undefined;
  return (
    <Card>
      <CardContent className="px-0">
        {data.items.length === 0 ? (
          <NoDeliveries />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ref</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Supplier</TableHead>
                {showCampus ? <TableHead>Campus</TableHead> : null}
                <TableHead>Items</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Paid from</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((delivery) => (
                <DeliveryRow
                  key={delivery.id}
                  delivery={delivery}
                  campusName={campusName(delivery.campusId)}
                  showCosts={showCosts}
                />
              ))}
            </TableBody>
          </Table>
        )}
        <FinancePager page={page} total={data.total} onPage={onPage} />
      </CardContent>
    </Card>
  );
}
