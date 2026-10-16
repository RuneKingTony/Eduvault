import { Link } from '@tanstack/react-router';
import { ReceiptTextIcon } from 'lucide-react';
import type { BillingRunSummary } from '@eduvault/api-contract';
import { fmtTimestamp, money } from '@eduvault/shared';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@eduvault/ui';
import { PersonAvatar } from '../person-avatar';
import { chargesCount } from './billing-text';
import { StatusBadge } from './status-badge';

function RunRow({
  run,
  currency,
}: {
  run: BillingRunSummary;
  currency: string;
}) {
  return (
    <TableRow>
      <TableCell>
        <Link
          to="/finance/billing/$runId"
          params={{ runId: run.id }}
          search={{ page: undefined }}
          className="flex items-center gap-3"
        >
          <ReceiptTextIcon
            className="size-4 text-muted-foreground"
            aria-hidden="true"
          />
          <span className="flex flex-col">
            <span className="font-mono text-sm">{run.number}</span>
            <span className="text-xs text-muted-foreground">
              {run.termName} · {run.scopeLabel}
            </span>
          </span>
        </Link>
      </TableCell>
      <TableCell>{chargesCount(run.chargeCount)}</TableCell>
      <TableCell className="tabular-nums">
        {money(run.totalMinor, currency)}
      </TableCell>
      <TableCell>
        {run.createdBy === null ? (
          '—'
        ) : (
          <span className="flex items-center gap-2">
            <PersonAvatar name={run.createdBy} />
            {run.createdBy}
          </span>
        )}
      </TableCell>
      <TableCell>
        {run.issuedAt === null ? '—' : fmtTimestamp(run.issuedAt)}
      </TableCell>
      <TableCell>
        <StatusBadge status={run.status} />
      </TableCell>
    </TableRow>
  );
}

export function RunsTable({
  runs,
  currency,
}: {
  runs: readonly BillingRunSummary[];
  currency: string;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Round</TableHead>
          <TableHead>Charges</TableHead>
          <TableHead>Total</TableHead>
          <TableHead>Prepared by</TableHead>
          <TableHead>Sent</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.map((run) => (
          <RunRow key={run.id} run={run} currency={currency} />
        ))}
      </TableBody>
    </Table>
  );
}
