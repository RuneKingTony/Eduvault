import { Link } from '@tanstack/react-router';
import type { BalanceRow } from '@eduvault/api-contract';
import { money } from '@eduvault/shared';
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@eduvault/ui';
import { NO_STATEMENT_FILTERS } from '../../accounts-search';
import { PersonAvatar } from '../person-avatar';
import { BalanceBadge } from './balance-badge';
import { lifeSuffix } from './statement-text';

function StudentCell({ row }: { row: BalanceRow }) {
  return (
    <Link
      to="/finance/accounts/$studentId"
      params={{ studentId: row.studentId }}
      search={NO_STATEMENT_FILTERS}
      className="flex items-center gap-2"
    >
      <PersonAvatar name={row.name} />
      <span className="flex flex-col">
        <span className="font-medium">{row.name}</span>
        <span className="text-xs text-muted-foreground">
          {row.admissionNumber}
          {lifeSuffix(row.lifecycle)}
        </span>
      </span>
    </Link>
  );
}

function GuardianCell({ guardian }: { guardian: BalanceRow['guardian'] }) {
  if (guardian === null) {
    return <span>—</span>;
  }
  return (
    <span className="flex flex-col">
      <span>{guardian.name}</span>
      <span className="text-xs text-muted-foreground">{guardian.phone}</span>
    </span>
  );
}

function RecordCell({
  row,
  onRecord,
}: {
  row: BalanceRow;
  onRecord: ((row: BalanceRow) => void) | undefined;
}) {
  if (onRecord === undefined || row.balanceMinor <= 0) {
    return null;
  }
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={`Record payment for ${row.name}`}
      onClick={() => {
        onRecord(row);
      }}
    >
      Record payment
    </Button>
  );
}

function BalanceRowView({
  row,
  currency,
  onRecord,
}: {
  row: BalanceRow;
  currency: string;
  onRecord: ((row: BalanceRow) => void) | undefined;
}) {
  return (
    <TableRow>
      <TableCell>
        <StudentCell row={row} />
      </TableCell>
      <TableCell>{row.className ?? '—'}</TableCell>
      <TableCell>
        <GuardianCell guardian={row.guardian} />
      </TableCell>
      <TableCell>
        <BalanceBadge balanceMinor={row.balanceMinor} currency={currency} />
      </TableCell>
      <TableCell className="tabular-nums">
        {money(row.paidMinor, currency)}
      </TableCell>
      <TableCell className="tabular-nums">
        {money(row.totalMinor, currency)}
      </TableCell>
      <TableCell className="text-right">
        <RecordCell row={row} onRecord={onRecord} />
      </TableCell>
    </TableRow>
  );
}

export function BalancesTable({
  rows,
  currency,
  onRecord,
}: {
  rows: readonly BalanceRow[];
  currency: string;
  onRecord: ((row: BalanceRow) => void) | undefined;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Student</TableHead>
          <TableHead>Class</TableHead>
          <TableHead>Guardian</TableHead>
          <TableHead>Owing</TableHead>
          <TableHead>Paid</TableHead>
          <TableHead>Total</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <BalanceRowView
            key={row.studentId}
            row={row}
            currency={currency}
            onRecord={onRecord}
          />
        ))}
      </TableBody>
    </Table>
  );
}
