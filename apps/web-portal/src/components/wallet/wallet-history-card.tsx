import { useState } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { HistoryIcon } from 'lucide-react';
import {
  movementTitle,
  traceFacts,
  type PortalWalletEarmarkMovement,
  type PortalWalletJournalMovement,
  type PortalWalletMovementList,
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
  ErrorMessage,
  NumberedPager,
  PageSkeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TraceDialog,
  cn,
} from '@eduvault/ui';
import { useApi } from '../../api';
import {
  WALLET_MOVEMENTS_PAGE_SIZE,
  portalWalletMovementsQueryOptions,
} from '../../queries';

function EarmarkRow({
  movement,
  currency,
}: {
  movement: PortalWalletEarmarkMovement;
  currency: string;
}) {
  return (
    <TableRow>
      <TableCell className="whitespace-nowrap">
        {fmtDate(movement.effectiveOn)}
      </TableCell>
      <TableCell>
        <span className="flex flex-col">
          <span>{movementTitle(movement)}</span>
          <span className="font-mono text-xs text-muted-foreground">
            {movement.reference}
          </span>
        </span>
      </TableCell>
      <TableCell className="text-right text-muted-foreground tabular-nums">
        <span className="flex flex-col">
          <span>{walletMoney(movement.amountMinor, currency)}</span>
          <span className="text-xs">Balance unchanged</span>
        </span>
      </TableCell>
    </TableRow>
  );
}

function MovementRow({
  movement,
  currency,
}: {
  movement: PortalWalletJournalMovement;
  currency: string;
}) {
  const { source } = movement;
  return (
    <TableRow>
      <TableCell className="whitespace-nowrap">
        {fmtDate(movement.effectiveOn)}
      </TableCell>
      <TableCell>
        <span className="flex flex-col">
          <span>{movementTitle(movement)}</span>
          <span className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
            {source?.type === 'spend' && source.automatic
              ? null
              : movement.reference}
            {source?.type === 'monnify' ? (
              <TraceDialog
                facts={traceFacts(source, {
                  reference: movement.reference,
                  currency,
                })}
              />
            ) : null}
          </span>
        </span>
      </TableCell>
      <TableCell
        className={cn(
          'text-right font-medium tabular-nums',
          movement.amountMinor > 0 ? 'text-success' : 'text-foreground'
        )}
      >
        {walletMoney(movement.amountMinor, currency)}
      </TableCell>
    </TableRow>
  );
}

function HistoryBody({
  data,
  page,
  onPage,
}: {
  data: PortalWalletMovementList;
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
          <EmptyTitle>No wallet history yet</EmptyTitle>
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
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.items.map((movement) =>
            movement.type === 'earmark' ? (
              <EarmarkRow
                key={movement.id}
                movement={movement}
                currency={data.currency}
              />
            ) : (
              <MovementRow
                key={movement.id}
                movement={movement}
                currency={data.currency}
              />
            )
          )}
        </TableBody>
      </Table>
      {data.total > WALLET_MOVEMENTS_PAGE_SIZE ? (
        <NumberedPager
          page={page}
          total={data.total}
          pageSize={WALLET_MOVEMENTS_PAGE_SIZE}
          onPage={onPage}
        />
      ) : null}
    </>
  );
}

function HistoryContent({
  history,
  page,
  onPage,
}: {
  history: UseQueryResult<PortalWalletMovementList>;
  page: number;
  onPage: (page: number) => void;
}) {
  if (history.data !== undefined) {
    return <HistoryBody data={history.data} page={page} onPage={onPage} />;
  }
  return history.isPending ? (
    <PageSkeleton rows={3} />
  ) : (
    <ErrorMessage error={history.error} />
  );
}

export function WalletHistoryCard() {
  const [page, setPage] = useState(1);
  const history = useQuery(portalWalletMovementsQueryOptions(useApi(), page));
  return (
    <Card role="group" aria-label="History">
      <CardHeader>
        <CardTitle>History</CardTitle>
        <CardDescription>
          Money in and out of the wallet, newest first.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <HistoryContent history={history} page={page} onPage={setPage} />
      </CardContent>
    </Card>
  );
}
