import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BanIcon, FileTextIcon, HistoryIcon } from 'lucide-react';
import {
  FINANCE_PAGE_SIZE,
  movementTitle,
  type WalletEarmarkMovement,
  type WalletJournalMovement,
  type WalletMovement,
  type WalletMovementList,
} from '@eduvault/api-contract';
import { useCan } from '@eduvault/auth-client';
import { fmtDate, walletMoney } from '@eduvault/shared';
import {
  Badge,
  Button,
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
import { CancelTopUpDialog } from './cancel-topup-dialog';
import { TraceButton } from './wallet-trace';

function Receipt({ movement }: { movement: WalletJournalMovement }) {
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

function CancelTopUp({
  movement,
  canRequest,
  onCancel,
}: {
  movement: WalletJournalMovement;
  canRequest: boolean;
  onCancel: (movement: WalletJournalMovement) => void;
}) {
  if (movement.source?.type !== 'topup') {
    return null;
  }
  const { cancellation } = movement.source;
  if (cancellation !== null) {
    return (
      <Badge variant={cancellation === 'approved' ? 'outline' : 'warning'}>
        {cancellation === 'approved' ? 'Cancelled' : 'Cancellation waiting'}
      </Badge>
    );
  }
  return canRequest ? (
    <Button
      type="button"
      size="xs"
      variant="ghost"
      aria-label={`Cancel top-up ${movement.reference}`}
      onClick={() => {
        onCancel(movement);
      }}
    >
      <BanIcon />
      Cancel top-up
    </Button>
  ) : null;
}

function MovementRow({
  movement,
  currency,
  canRequest,
  onCancel,
}: {
  movement: WalletJournalMovement;
  currency: string;
  canRequest: boolean;
  onCancel: (movement: WalletJournalMovement) => void;
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
      <TableCell>
        <CancelTopUp
          movement={movement}
          canRequest={canRequest}
          onCancel={onCancel}
        />
      </TableCell>
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

function EarmarkRow({
  movement,
  currency,
}: {
  movement: WalletEarmarkMovement;
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
      <TableCell>{movement.madeBy ?? ''}</TableCell>
      <TableCell />
      <TableCell className="text-right text-muted-foreground tabular-nums">
        <span className="flex flex-col">
          <span>{walletMoney(movement.amountMinor, currency)}</span>
          <span className="text-xs">Balance unchanged</span>
        </span>
      </TableCell>
    </TableRow>
  );
}

function FeedRow({
  movement,
  ...rest
}: {
  movement: WalletMovement;
  currency: string;
  canRequest: boolean;
  onCancel: (movement: WalletJournalMovement) => void;
}) {
  return movement.type === 'earmark' ? (
    <EarmarkRow movement={movement} currency={rest.currency} />
  ) : (
    <MovementRow movement={movement} {...rest} />
  );
}

function NoMovements() {
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

function MovementsBody({
  data,
  page,
  canRequest,
  onPage,
  onCancel,
}: {
  data: WalletMovementList;
  page: number;
  canRequest: boolean;
  onPage: (page: number) => void;
  onCancel: (movement: WalletJournalMovement) => void;
}) {
  if (data.items.length === 0) {
    return <NoMovements />;
  }
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Movement</TableHead>
            <TableHead>By</TableHead>
            <TableHead>
              <span className="sr-only">Actions</span>
            </TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.items.map((movement) => (
            <FeedRow
              key={movement.type === 'earmark' ? movement.id : movement.lineId}
              movement={movement}
              currency={data.currency}
              canRequest={canRequest}
              onCancel={onCancel}
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
  const canRequest = useCan('wallet', 'requestRefund');
  const [cancelling, setCancelling] = useState<WalletJournalMovement | null>(
    null
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Movements</CardTitle>
        <CardDescription>
          Money in and out of the wallet, and money set aside or released for a
          child, newest first.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <QueryState query={movements} skeletonClassName="h-32">
          {(data) => (
            <>
              <MovementsBody
                data={data}
                page={page}
                canRequest={canRequest}
                onPage={onPage}
                onCancel={setCancelling}
              />
              <CancelTopUpDialog
                walletId={walletId}
                movement={cancelling}
                currency={data.currency}
                onClose={() => {
                  setCancelling(null);
                }}
              />
            </>
          )}
        </QueryState>
      </CardContent>
    </Card>
  );
}
