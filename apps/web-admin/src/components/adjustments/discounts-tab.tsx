import { useQuery } from '@tanstack/react-query';
import { PercentIcon } from 'lucide-react';
import type {
  StudentDiscount,
  StudentDiscountList,
} from '@eduvault/api-contract';
import {
  Badge,
  Button,
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@eduvault/ui';
import { useApi } from '../../api';
import { discountTermsQueryOptions } from '../../queries';
import { FinancePager } from '../money/query-state';
import {
  discountBadge,
  discountStatus,
  discountTerms,
  isEnded,
} from './adjustment-text';
import {
  AskedBy,
  ReasonCell,
  SeeInApprovals,
  StatusCell,
  StudentCell,
} from './status-cell';
import { canStillEnd } from './term-options';

function DiscountStatus({ row }: { row: StudentDiscount }) {
  if (!isEnded(row)) {
    return <StatusCell status={row.status} approvedBy={row.approvedBy} />;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline">{discountStatus(row)}</Badge>
      </TooltipTrigger>
      <TooltipContent>
        Last applies in {row.toTerm?.name ?? 'the term you chose'}
      </TooltipContent>
    </Tooltip>
  );
}

function DiscountRow({
  row,
  currency,
  endable,
  onEnd,
}: {
  row: StudentDiscount;
  currency: string;
  endable: boolean;
  onEnd: (discount: StudentDiscount) => void;
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
        <Badge variant="outline">
          <PercentIcon />
          {discountBadge(row, currency)}
        </Badge>
      </TableCell>
      <TableCell>
        <ReasonCell reason={row.reason} rejectionReason={row.rejectionReason} />
      </TableCell>
      <TableCell className="whitespace-normal">{discountTerms(row)}</TableCell>
      <TableCell>
        <AskedBy name={row.createdBy} />
      </TableCell>
      <TableCell>
        <DiscountStatus row={row} />
      </TableCell>
      <TableCell className="text-right">
        {row.status === 'submitted' ? <SeeInApprovals /> : null}
        {endable ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`End discount for ${row.student.name}`}
            onClick={() => {
              onEnd(row);
            }}
          >
            End discount
          </Button>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

interface DiscountsTabProps {
  list: StudentDiscountList;
  page: number;
  canEnd: boolean;
  onPage: (page: number) => void;
  onEnd: (discount: StudentDiscount) => void;
}

function DiscountsTable({
  list,
  page,
  canEnd,
  onPage,
  onEnd,
}: DiscountsTabProps) {
  const choices = useQuery(discountTermsQueryOptions(useApi()));
  const endable = (row: StudentDiscount) =>
    canEnd &&
    row.status === 'approved' &&
    !isEnded(row) &&
    (choices.data === undefined ||
      canStillEnd(choices.data, row.toTerm?.id ?? null));
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Student</TableHead>
            <TableHead>Discount</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead>Terms</TableHead>
            <TableHead>Asked by</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.items.map((row) => (
            <DiscountRow
              key={row.id}
              row={row}
              currency={list.currency}
              endable={endable(row)}
              onEnd={onEnd}
            />
          ))}
        </TableBody>
      </Table>
      <FinancePager page={page} total={list.total} onPage={onPage} />
    </>
  );
}

export function DiscountsTab(props: DiscountsTabProps) {
  if (props.list.items.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <PercentIcon />
          </EmptyMedia>
          <EmptyTitle>No discounts</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }
  return <DiscountsTable {...props} />;
}
