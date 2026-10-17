import type { ReactNode } from 'react';
import { InfoIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Alert, AlertDescription } from '../ui/alert';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Empty, EmptyHeader, EmptyTitle } from '../ui/empty';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { NumberedPager } from './numbered-pager';

export type StatementTone = 'owe' | 'paid';

export interface StatementCardTile {
  label: string;
  value: string;
}

export interface StatementCardRow {
  key: string;
  date: string;
  what: ReactNode;
  note?: string;
  status: string;
  tone: StatementTone;
  amount: string;
}

export interface StatementCardProps {
  heading: { avatar: ReactNode; name: string; detail: string };
  tiles: readonly StatementCardTile[];
  callout?: { text: string; action?: ReactNode };
  rows: readonly StatementCardRow[];
  footer: StatementCardTile;
  unpaid: readonly { key: string; label: string }[];
  pager?: {
    page: number;
    total: number;
    pageSize: number;
    onPage: (page: number) => void;
  };
  emptyText: string;
}

function Tile({ label, value }: StatementCardTile) {
  return (
    <div className="flex flex-col rounded-lg border p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function Callout({
  callout,
}: {
  callout: NonNullable<StatementCardProps['callout']>;
}) {
  return (
    <Alert>
      <InfoIcon />
      <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
        <span>{callout.text}</span>
        {callout.action}
      </AlertDescription>
    </Alert>
  );
}

function EntryRow({ row }: { row: StatementCardRow }) {
  const owe = row.tone === 'owe';
  return (
    <TableRow>
      <TableCell>{row.date}</TableCell>
      <TableCell>
        <span className="flex flex-col">
          {row.what}
          {row.note === undefined ? null : (
            <span className="font-mono text-xs text-muted-foreground">
              {row.note}
            </span>
          )}
        </span>
      </TableCell>
      <TableCell>
        <Badge variant={owe ? 'destructive' : 'success'}>{row.status}</Badge>
      </TableCell>
      <TableCell
        className={cn(
          'text-right tabular-nums',
          owe ? 'text-destructive' : 'text-success'
        )}
      >
        {row.amount}
      </TableCell>
    </TableRow>
  );
}

function EntriesTable({
  rows,
  footer,
}: Pick<StatementCardProps, 'rows' | 'footer'>) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>What</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <EntryRow key={row.key} row={row} />
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={3}>{footer.label}</TableCell>
          <TableCell className="text-right font-semibold tabular-nums">
            {footer.value}
          </TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}

function Unpaid({ unpaid }: Pick<StatementCardProps, 'unpaid'>) {
  if (unpaid.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2 px-6">
      <p className="text-sm font-medium">Unpaid charges, oldest first</p>
      <ul className="flex flex-wrap gap-2">
        {unpaid.map((item) => (
          <li key={item.key}>
            <Badge variant="outline">{item.label}</Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StatementCard({
  heading,
  tiles,
  callout,
  rows,
  footer,
  unpaid,
  pager,
  emptyText,
}: StatementCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          {heading.avatar}
          <span className="flex flex-col">
            <span>{heading.name}</span>
            <span className="text-sm font-normal text-muted-foreground">
              {heading.detail}
            </span>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 px-0">
        <div className="flex flex-col gap-4 px-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {tiles.map((tile) => (
              <Tile key={tile.label} {...tile} />
            ))}
          </div>
          {callout === undefined ? null : <Callout callout={callout} />}
        </div>
        {rows.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{emptyText}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <EntriesTable rows={rows} footer={footer} />
        )}
        {pager !== undefined && pager.total > pager.pageSize ? (
          <NumberedPager {...pager} />
        ) : null}
        <Unpaid unpaid={unpaid} />
      </CardContent>
    </Card>
  );
}
