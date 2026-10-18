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
import { RowButton } from './row-button';
import { GO_LIVE_NOTE } from './store-text';

type CampusRef = Pick<Campus, 'id' | 'name'>;

interface DeliveriesTableProps {
  data: DeliveryList;
  campuses: readonly CampusRef[];
  showCampus: boolean;
  showCosts: boolean;
  page: number;
  onPage: (page: number) => void;
  onOpen: (deliveryId: string) => void;
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
  onOpen,
}: {
  delivery: Delivery;
  campusName: string | undefined;
  showCosts: boolean;
  onOpen: (deliveryId: string) => void;
}) {
  const open = () => {
    onOpen(delivery.id);
  };
  return (
    <TableRow>
      <TableCell className="font-mono text-xs">
        <RowButton first onOpen={open}>
          {delivery.number}
        </RowButton>
      </TableCell>
      <TableCell>
        <RowButton onOpen={open}>{fmtDate(delivery.receivedOn)}</RowButton>
      </TableCell>
      <TableCell>
        <RowButton onOpen={open}>{delivery.supplierName}</RowButton>
      </TableCell>
      {campusName === undefined ? null : (
        <TableCell>
          <RowButton onOpen={open}>{campusName}</RowButton>
        </TableCell>
      )}
      <TableCell className="tabular-nums">
        <RowButton onOpen={open}>{delivery.itemCount}</RowButton>
      </TableCell>
      <TableCell className="font-semibold tabular-nums">
        <MaskedMoney minor={delivery.totalMinor} show={showCosts} />
      </TableCell>
      <TableCell
        className={
          delivery.moneyAccount === null ? 'text-muted-foreground' : ''
        }
      >
        <RowButton onOpen={open}>
          {delivery.moneyAccount?.name ?? GO_LIVE_NOTE}
        </RowButton>
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
  onOpen,
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
                  onOpen={onOpen}
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
