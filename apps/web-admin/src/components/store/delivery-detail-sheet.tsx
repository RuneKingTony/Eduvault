import { useQuery } from '@tanstack/react-query';
import { TruckIcon } from 'lucide-react';
import type { DeliveryDetail } from '@eduvault/api-contract';
import { fmtDate } from '@eduvault/shared';
import {
  Badge,
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@eduvault/ui';
import { useApi } from '../../api';
import { campusesQueryOptions, storeDeliveryQueryOptions } from '../../queries';
import { Fact } from './fact';
import { MaskedMoney } from './masked-money';
import { SheetPending } from './sheet-pending';
import { GO_LIVE_NOTE } from './store-text';

export interface DeliveryItemTarget {
  itemName: string;
  retired: boolean;
  campusId: string;
}

interface DeliveryDetailSheetProps {
  deliveryId: string | undefined;
  showCosts: boolean;
  onClose: () => void;
  onItem: (target: DeliveryItemTarget) => void;
}

interface BodyProps {
  delivery: DeliveryDetail;
  campusName: string | undefined;
  showCosts: boolean;
  onClose: () => void;
  onItem: (target: DeliveryItemTarget) => void;
}

function LinesTable({
  delivery,
  showCosts,
  onItem,
}: Pick<BodyProps, 'delivery' | 'showCosts' | 'onItem'>) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Item</TableHead>
          <TableHead>Qty</TableHead>
          <TableHead>Unit cost</TableHead>
          <TableHead>Line cost</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {delivery.lines.map((line) => (
          <TableRow key={line.itemId}>
            <TableCell>
              <span className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="text-left underline-offset-4 hover:underline"
                  onClick={() => {
                    onItem({
                      itemName: line.itemName,
                      retired: line.retired,
                      campusId: delivery.campusId,
                    });
                  }}
                >
                  {line.displayName}
                </button>
                {line.retired ? <Badge variant="outline">Retired</Badge> : null}
              </span>
            </TableCell>
            <TableCell className="tabular-nums">{line.quantity}</TableCell>
            <TableCell className="tabular-nums">
              <MaskedMoney minor={line.unitCostMinor} show={showCosts} />
            </TableCell>
            <TableCell className="tabular-nums">
              <MaskedMoney minor={line.totalMinor} show={showCosts} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={3}>Total</TableCell>
          <TableCell className="font-semibold tabular-nums">
            <MaskedMoney minor={delivery.totalMinor} show={showCosts} />
          </TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}

function DeliveryBody({
  delivery,
  campusName,
  showCosts,
  onClose,
  onItem,
}: BodyProps) {
  return (
    <>
      <div className="flex flex-col gap-4 overflow-y-auto px-4">
        <dl className="grid gap-3 sm:grid-cols-2">
          <Fact label="Date">{fmtDate(delivery.receivedOn)}</Fact>
          <Fact label="Supplier">{delivery.supplierName}</Fact>
          <Fact label="Campus">{campusName ?? '—'}</Fact>
          <Fact label="Received by">{delivery.receivedBy ?? '—'}</Fact>
          <Fact label="Paid from">
            {delivery.moneyAccount === null ? (
              <span className="text-muted-foreground">{GO_LIVE_NOTE}</span>
            ) : (
              delivery.moneyAccount.name
            )}
          </Fact>
          <Fact label="Reference">
            <span className="font-mono text-xs">{delivery.reference}</span>
          </Fact>
        </dl>
        <LinesTable delivery={delivery} showCosts={showCosts} onItem={onItem} />
      </div>
      <SheetFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </SheetFooter>
    </>
  );
}

function Loaded({
  deliveryId,
  showCosts,
  onClose,
  onItem,
}: Omit<DeliveryDetailSheetProps, 'deliveryId'> & { deliveryId: string }) {
  const api = useApi();
  const delivery = useQuery(storeDeliveryQueryOptions(api, deliveryId));
  const campuses = useQuery(campusesQueryOptions(api));
  if (delivery.data === undefined || campuses.isPending) {
    return <SheetPending error={delivery.error} />;
  }
  const campusName = campuses.data?.find(
    (campus) => campus.id === delivery.data.campusId
  )?.name;
  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2 font-mono">
          <TruckIcon aria-hidden="true" />
          {delivery.data.number}
        </SheetTitle>
        <SheetDescription>
          {delivery.data.isOpening
            ? `${GO_LIVE_NOTE}.`
            : 'Stock received at the store.'}
        </SheetDescription>
      </SheetHeader>
      <DeliveryBody
        delivery={delivery.data}
        campusName={campusName}
        showCosts={showCosts}
        onClose={onClose}
        onItem={onItem}
      />
    </>
  );
}

export function DeliveryDetailSheet({
  deliveryId,
  showCosts,
  onClose,
  onItem,
}: DeliveryDetailSheetProps) {
  return (
    <Sheet
      open={deliveryId !== undefined}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <SheetContent className="data-[side=right]:sm:max-w-xl">
        {deliveryId === undefined ? null : (
          <Loaded
            deliveryId={deliveryId}
            showCosts={showCosts}
            onClose={onClose}
            onItem={onItem}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
