import { useQuery } from '@tanstack/react-query';
import { PencilIcon } from 'lucide-react';
import type { MoneyAccount } from '@eduvault/api-contract';
import { Can } from '@eduvault/auth-client';
import { fmtDate, money } from '@eduvault/shared';
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@eduvault/ui';
import { useApi } from '../../api';
import { cashBookQueryOptions } from '../../queries';
import { JOURNAL_KIND_LABELS, entryCaption } from './money-text';
import { FinancePager, QueryState } from './query-state';

function amountOrDash(minor: number, currency: string): string {
  return minor === 0 ? '—' : money(minor, currency);
}

function CashBookRows({
  items,
  currency,
}: {
  items: NonNullable<ReturnType<typeof useCashBook>['data']>['items'];
  currency: string;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>What</TableHead>
          <TableHead className="text-right">In</TableHead>
          <TableHead className="text-right">Out</TableHead>
          <TableHead className="text-right">Balance</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.entryId}>
            <TableCell className="whitespace-nowrap">
              {fmtDate(item.effectiveOn)}
            </TableCell>
            <TableCell>
              <span className="font-medium">
                {JOURNAL_KIND_LABELS[item.kind]}
              </span>
              <span className="block text-xs text-muted-foreground">
                {entryCaption(item.reference, item.memo)}
              </span>
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {amountOrDash(item.inMinor, currency)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {amountOrDash(item.outMinor, currency)}
            </TableCell>
            <TableCell className="text-right font-medium tabular-nums">
              {money(item.runningBalanceMinor, currency)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function useCashBook(id: string, page: number) {
  return useQuery(cashBookQueryOptions(useApi(), id, page));
}

function CashBookBody({
  book,
  currency,
  page,
  onPage,
}: {
  book: ReturnType<typeof useCashBook>;
  currency: string;
  page: number;
  onPage: (page: number) => void;
}) {
  return (
    <QueryState query={book}>
      {({ items, total }) =>
        items.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No movements yet</EmptyTitle>
              <EmptyDescription>
                Money in and out of this account will show up here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <CashBookRows items={items} currency={currency} />
            <FinancePager page={page} total={total} onPage={onPage} />
          </>
        )
      }
    </QueryState>
  );
}

export function CashBookCard({
  account,
  currency,
  page,
  onPage,
  onEdit,
  onRetire,
}: {
  account: MoneyAccount;
  currency: string;
  page: number;
  onPage: (page: number) => void;
  onEdit: () => void;
  onRetire: () => void;
}) {
  const book = useCashBook(account.id, page);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{account.name} cash book</CardTitle>
        <CardDescription>
          Every movement in and out, newest first.
        </CardDescription>
        <CardAction className="flex gap-2">
          <Can permission="moneyAccount:update">
            <Button type="button" variant="outline" size="sm" onClick={onEdit}>
              <PencilIcon />
              Edit
            </Button>
            {account.retiredAt === null ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onRetire}
              >
                Retire
              </Button>
            ) : null}
          </Can>
        </CardAction>
      </CardHeader>
      <CardContent className="px-0">
        <CashBookBody
          book={book}
          currency={currency}
          page={page}
          onPage={onPage}
        />
      </CardContent>
    </Card>
  );
}
