import { ScaleIcon } from 'lucide-react';
import {
  ADJUSTMENT_KIND_LABELS,
  type Adjustment,
  type AdjustmentList,
} from '@eduvault/api-contract';
import { money } from '@eduvault/shared';
import {
  Badge,
  Empty,
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
import { FinancePager } from '../money/query-state';
import {
  AskedBy,
  ReasonCell,
  SeeInApprovals,
  StatusCell,
  StudentCell,
} from './status-cell';

function CorrectionRow({
  row,
  currency,
}: {
  row: Adjustment;
  currency: string;
}) {
  return (
    <TableRow>
      <TableCell>
        <StudentCell
          name={row.student.name}
          admissionNumber={row.student.admissionNumber}
        />
      </TableCell>
      <TableCell>
        <Badge variant={row.kind === 'refund' ? 'secondary' : 'outline'}>
          {ADJUSTMENT_KIND_LABELS[row.kind]}
        </Badge>
      </TableCell>
      <TableCell>
        <ReasonCell reason={row.reason} rejectionReason={row.rejectionReason} />
      </TableCell>
      <TableCell className="font-semibold tabular-nums">
        {money(row.amountMinor, currency)}
      </TableCell>
      <TableCell>
        <AskedBy name={row.createdBy} />
      </TableCell>
      <TableCell>
        <StatusCell status={row.status} approvedBy={row.approvedBy} />
      </TableCell>
      <TableCell className="text-right">
        {row.status === 'submitted' ? <SeeInApprovals /> : null}
      </TableCell>
    </TableRow>
  );
}

export function CorrectionsTab({
  list,
  page,
  onPage,
}: {
  list: AdjustmentList;
  page: number;
  onPage: (page: number) => void;
}) {
  if (list.items.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ScaleIcon />
          </EmptyMedia>
          <EmptyTitle>No adjustments</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Student</TableHead>
            <TableHead>Kind</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Asked by</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>
              <span className="sr-only">Approvals</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.items.map((row) => (
            <CorrectionRow key={row.id} row={row} currency={list.currency} />
          ))}
        </TableBody>
      </Table>
      <FinancePager page={page} total={list.total} onPage={onPage} />
    </>
  );
}
