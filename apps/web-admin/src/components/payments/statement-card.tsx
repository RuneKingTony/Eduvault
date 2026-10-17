import { Link } from '@tanstack/react-router';
import { InfoIcon } from 'lucide-react';
import {
  FINANCE_PAGE_SIZE,
  type StatementLink,
  type StatementRow,
  type StudentStatement,
} from '@eduvault/api-contract';
import { fmtDate, money } from '@eduvault/shared';
import {
  Alert,
  AlertDescription,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Empty,
  EmptyHeader,
  EmptyTitle,
  NumberedPager,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from '@eduvault/ui';
import { PersonAvatar } from '../person-avatar';
import {
  ROW_STATUS_LABELS,
  balanceTile,
  creditCallout,
  entriesFooter,
  isOwingRow,
} from './statement-text';

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col rounded-lg border p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function MoneyTiles({ statement }: { statement: StudentStatement }) {
  const { totals, currency } = statement;
  const first = balanceTile(totals.balanceMinor, currency);
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Tile label={first.label} value={first.value} />
      <Tile label="Paid" value={money(totals.paidMinor, currency)} />
      {totals.reducedMinor > 0 ? (
        <Tile label="Reduced" value={money(totals.reducedMinor, currency)} />
      ) : null}
      <Tile label="Total" value={money(totals.totalMinor, currency)} />
    </div>
  );
}

function Described({ row }: { row: StatementRow }) {
  const link: StatementLink = row.link;
  if (link?.type === 'invoice') {
    return (
      <Link
        to="/finance/invoices/$invoiceId"
        params={{ invoiceId: link.id }}
        className="hover:underline"
      >
        {row.description}
      </Link>
    );
  }
  if (link?.type === 'payment') {
    return (
      <Link
        to="/finance/payments/$paymentId"
        params={{ paymentId: link.id }}
        search={{ recorded: undefined }}
        className="hover:underline"
      >
        {row.description}
      </Link>
    );
  }
  return <span>{row.description}</span>;
}

function EntriesTable({ statement }: { statement: StudentStatement }) {
  const { currency } = statement;
  const footer = entriesFooter(statement.totals.balanceMinor, currency);
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
        {statement.rows.map((row) => (
          <TableRow key={`${row.entryId}-${row.status}`}>
            <TableCell>{fmtDate(row.effectiveOn)}</TableCell>
            <TableCell>
              <span className="flex flex-col">
                <Described row={row} />
                <span className="font-mono text-xs text-muted-foreground">
                  {row.reference}
                </span>
              </span>
            </TableCell>
            <TableCell>
              <Badge
                variant={isOwingRow(row.status) ? 'destructive' : 'success'}
              >
                {ROW_STATUS_LABELS[row.status]}
              </Badge>
            </TableCell>
            <TableCell
              className={cn(
                'text-right tabular-nums',
                isOwingRow(row.status) ? 'text-destructive' : 'text-success'
              )}
            >
              {money(row.amountMinor, currency)}
            </TableCell>
          </TableRow>
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

function Unpaid({ statement }: { statement: StudentStatement }) {
  if (statement.unpaid.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2 px-6">
      <p className="text-sm font-medium">Unpaid charges, oldest first</p>
      <ul className="flex flex-wrap gap-2">
        {statement.unpaid.map((item) => (
          <li key={item.reference}>
            <Badge variant="outline">
              {item.reference} ·{' '}
              {money(item.outstandingMinor, statement.currency)}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CardTitleRow({ statement }: { statement: StudentStatement }) {
  const { student } = statement;
  const where = [
    student.admissionNumber,
    student.className ?? '—',
    student.campusName,
  ].join(' · ');
  return (
    <CardTitle className="flex items-center gap-3">
      <PersonAvatar name={student.name} />
      <span className="flex flex-col">
        <span>{student.name}</span>
        <span className="text-sm font-normal text-muted-foreground">
          {where}
          {student.archived ? ' · archived' : ''}
        </span>
      </span>
    </CardTitle>
  );
}

export function StatementCard({
  statement,
  onPage,
}: {
  statement: StudentStatement;
  onPage: (page: number) => void;
}) {
  const { totals } = statement;
  return (
    <Card>
      <CardHeader>
        <CardTitleRow statement={statement} />
      </CardHeader>
      <CardContent className="flex flex-col gap-4 px-0">
        <div className="flex flex-col gap-4 px-6">
          <MoneyTiles statement={statement} />
          {totals.balanceMinor < 0 ? (
            <Alert>
              <InfoIcon />
              <AlertDescription>
                {creditCallout(-totals.balanceMinor, statement.currency)}
              </AlertDescription>
            </Alert>
          ) : null}
        </div>
        {statement.rows.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No entries yet</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <EntriesTable statement={statement} />
        )}
        {statement.total > FINANCE_PAGE_SIZE ? (
          <NumberedPager
            page={statement.page}
            total={statement.total}
            pageSize={statement.pageSize}
            onPage={onPage}
          />
        ) : null}
        <Unpaid statement={statement} />
      </CardContent>
    </Card>
  );
}
