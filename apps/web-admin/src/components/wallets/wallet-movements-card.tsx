import { useQuery } from '@tanstack/react-query';
import { FileTextIcon, HistoryIcon } from 'lucide-react';
import {
  FINANCE_PAGE_SIZE,
  movementTitle,
  type WalletMovement,
  type WalletMovementList,
} from '@eduvault/api-contract';
import { fmtDate, walletMoney } from '@eduvault/shared';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  NumberedPager,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from '@eduvault/ui';
import { useApi } from '../../api';
import { walletMovementsQueryOptions } from '../../queries';
import { ProofLink } from '../money/proof-link';
import { QueryState } from '../money/query-state';
import { TraceButton } from './wallet-trace';

function Receipt({ movement }: { movement: WalletMovement }) {
  if (movement.source?.type !== 'topup') {
    return null;
  }
  return (
    <ProofLink
      fileId={movement.source.proofFileId}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
    >
      <FileTextIcon className="size-3" />
      Receipt
    </ProofLink>
  );
}

function MovementRow({
  movement,
  currency,
}: {
  movement: WalletMovement;
  currency: string;
}) {
  const incoming = movement.amountMinor > 0;
  return (
    <TableRow>
      <TableCell className="whitespace-nowrap">
        {fmtDate(movement.effectiveOn)}
      </TableCell>
      <TableCell>
        <span className="flex flex-col">
          <span>{movementTitle(movement)}</span>
          <span className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
            {movement.reference}
            <Receipt movement={movement} />
            <TraceButton movement={movement} currency={currency} />
          </span>
        </span>
      </TableCell>
      <TableCell>{movement.madeBy ?? ''}</TableCell>
      <TableCell
        className={cn(
          'text-right font-medium tabular-nums',
          incoming ? 'text-success' : 'text-foreground'
        )}
      >
        {walletMoney(movement.amountMinor, currency)}
      </TableCell>
    </TableRow>
  );
}

function MovementsBody({
  data,
  page,
  onPage,
}: {
  data: WalletMovementList;
  page: number;
  onPage: (page: number) => void;
}) {
  if (data.items.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HistoryIcon />
          </EmptyMedia>
          <EmptyTitle>No movements yet</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Movement</TableHead>
            <TableHead>By</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.items.map((movement) => (
            <MovementRow
              key={movement.lineId}
              movement={movement}
              currency={data.currency}
            />
          ))}
        </TableBody>
      </Table>
      {data.total > FINANCE_PAGE_SIZE ? (
        <NumberedPager
          page={page}
          total={data.total}
          pageSize={FINANCE_PAGE_SIZE}
          onPage={onPage}
        />
      ) : null}
    </>
  );
}

export function MovementsCard({
  walletId,
  page,
  onPage,
}: {
  walletId: string;
  page: number;
  onPage: (page: number) => void;
}) {
  const movements = useQuery(
    walletMovementsQueryOptions(useApi(), walletId, page)
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Movements</CardTitle>
        <CardDescription>
          Money in and out of the wallet, newest first.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <QueryState query={movements} skeletonClassName="h-32">
          {(data) => <MovementsBody data={data} page={page} onPage={onPage} />}
        </QueryState>
      </CardContent>
    </Card>
  );
}
