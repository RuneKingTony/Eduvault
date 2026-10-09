import { HistoryIcon } from 'lucide-react';
import { isReadMethod, type AuditRow } from '@eduvault/api-contract';
import { UserAvatar } from '@eduvault/auth-client';
import { fmtLagosDateTime } from '@eduvault/shared';
import {
  Badge,
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

function RequestCell({ row }: { row: AuditRow }) {
  const label = row.method ?? row.action ?? '';
  return (
    <div className="flex items-center gap-2">
      <Badge variant={isReadMethod(label) ? 'secondary' : 'warning'}>
        {label}
      </Badge>
      <span className="font-mono text-xs break-all">{row.path}</span>
    </div>
  );
}

function AuditRowView({
  row,
  showSchool,
}: {
  row: AuditRow;
  showSchool: boolean;
}) {
  return (
    <TableRow>
      <TableCell className="font-mono text-xs whitespace-nowrap">
        {fmtLagosDateTime(row.createdAt)}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <UserAvatar name={row.actor.name} />
          <span>{row.actor.name}</span>
        </div>
      </TableCell>
      {showSchool ? <TableCell>{row.school?.name ?? '—'}</TableCell> : null}
      <TableCell>
        <RequestCell row={row} />
      </TableCell>
      <TableCell>
        <Badge variant={row.status < 300 ? 'success' : 'destructive'}>
          {row.status}
        </Badge>
      </TableCell>
      <TableCell>
        {row.reason === null ? (
          '—'
        ) : (
          <code className="font-mono text-xs">{row.reason}</code>
        )}
      </TableCell>
    </TableRow>
  );
}

export function AuditTable({
  rows,
  showSchool = true,
}: {
  rows: AuditRow[];
  showSchool?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HistoryIcon />
          </EmptyMedia>
          <EmptyTitle>No acting requests yet</EmptyTitle>
          <EmptyDescription>
            Requests made while acting in a school appear here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Time</TableHead>
          <TableHead>Actor</TableHead>
          {showSchool ? <TableHead>School</TableHead> : null}
          <TableHead>Request</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Reason</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <AuditRowView key={row.id} row={row} showSchool={showSchool} />
        ))}
      </TableBody>
    </Table>
  );
}
