import { useState } from 'react';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ClipboardCheckIcon,
} from 'lucide-react';
import type {
  Campus,
  StockCount,
  StockCountLine,
  StockCountList,
} from '@eduvault/api-contract';
import { fmtTimestamp } from '@eduvault/shared';
import {
  Badge,
  Button,
  Card,
  CardContent,
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
import { FinancePager } from '../money/query-state';
import { MaskedMoney } from './masked-money';
import { RowButton } from './row-button';
import {
  COUNT_STATUS_LABELS,
  countedItemsText,
  differenceText,
} from './store-text';

type CampusRef = Pick<Campus, 'id' | 'name'>;

interface StockCountsTableProps {
  data: StockCountList;
  campuses: readonly CampusRef[];
  showCampus: boolean;
  showCosts: boolean;
  page: number;
  onPage: (page: number) => void;
  onApprovals: () => void;
}

function NoCounts() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ClipboardCheckIcon />
        </EmptyMedia>
        <EmptyTitle>No stock counts yet</EmptyTitle>
        <EmptyDescription>
          Count the shelves each half term. Shortages wait for approval before
          stock changes.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function StatusBadge({
  count,
  onApprovals,
}: {
  count: StockCount;
  onApprovals: () => void;
}) {
  const label = COUNT_STATUS_LABELS[count.status];
  switch (count.status) {
    case 'matched':
    case 'approved': {
      return <Badge variant="success">{label}</Badge>;
    }
    case 'rejected': {
      return <Badge variant="destructive">{label}</Badge>;
    }
    case 'submitted': {
      return (
        <span className="flex flex-wrap items-center gap-2">
          <Badge variant="warning">{label}</Badge>
          <Button
            type="button"
            variant="link"
            size="xs"
            className="h-auto p-0"
            onClick={onApprovals}
          >
            Approvals
          </Button>
        </span>
      );
    }
  }
}

function DifferenceCell({ difference }: { difference: number }) {
  let tone = 'text-muted-foreground';
  if (difference > 0) {
    tone = 'text-success';
  } else if (difference < 0) {
    tone = 'text-destructive';
  }
  return (
    <TableCell className={`tabular-nums ${tone}`}>
      {differenceText(difference)}
    </TableCell>
  );
}

function CountedLine({
  line,
  showCosts,
}: {
  line: StockCountLine;
  showCosts: boolean;
}) {
  return (
    <TableRow>
      <TableCell>{line.displayName}</TableCell>
      <TableCell className="tabular-nums">{line.expectedQuantity}</TableCell>
      <TableCell className="tabular-nums">{line.countedQuantity}</TableCell>
      <DifferenceCell difference={line.difference} />
      <TableCell className="tabular-nums">
        {line.valueMinor === 0 ? (
          '—'
        ) : (
          <MaskedMoney minor={line.valueMinor} show={showCosts} />
        )}
      </TableCell>
    </TableRow>
  );
}

function CountDetail({
  count,
  showCosts,
  columns,
}: {
  count: StockCount;
  showCosts: boolean;
  columns: number;
}) {
  return (
    <TableRow>
      <TableCell colSpan={columns} className="bg-muted/30">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">
            {countedItemsText(count.lines.length)}
          </p>
          {count.note === null ? null : (
            <p className="text-xs text-muted-foreground">{count.note}</p>
          )}
          {count.rejectionReason === null ? null : (
            <p className="text-xs text-muted-foreground">
              Declined: {count.rejectionReason}
            </p>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Expected</TableHead>
                <TableHead>Counted</TableHead>
                <TableHead>Difference</TableHead>
                <TableHead>Value at cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {count.lines.map((line) => (
                <CountedLine
                  key={line.itemId}
                  line={line}
                  showCosts={showCosts}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      </TableCell>
    </TableRow>
  );
}

function ExpandCell({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  const Chevron = open ? ChevronDownIcon : ChevronRightIcon;
  return (
    <TableCell className="w-8">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Show counted items"
        aria-expanded={open}
        onClick={onToggle}
      >
        <Chevron />
      </Button>
    </TableCell>
  );
}

function ValueCell({
  minor,
  showCosts,
}: {
  minor: number;
  showCosts: boolean;
}) {
  return (
    <TableCell className="font-semibold tabular-nums">
      {minor === 0 ? '—' : <MaskedMoney minor={minor} show={showCosts} />}
    </TableCell>
  );
}

function CountRow({
  count,
  campusName,
  showCosts,
  onApprovals,
}: {
  count: StockCount;
  campusName: string | undefined;
  showCosts: boolean;
  onApprovals: () => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = () => {
    setOpen((was) => !was);
  };
  return (
    <>
      <TableRow>
        <ExpandCell open={open} onToggle={toggle} />
        <TableCell className="font-mono text-xs">
          <RowButton onOpen={toggle}>{count.number}</RowButton>
        </TableCell>
        <TableCell>
          <RowButton onOpen={toggle}>{fmtTimestamp(count.createdAt)}</RowButton>
        </TableCell>
        {campusName === undefined ? null : (
          <TableCell>
            <RowButton onOpen={toggle}>{campusName}</RowButton>
          </TableCell>
        )}
        <TableCell>
          <RowButton onOpen={toggle}>{count.differences}</RowButton>
        </TableCell>
        <ValueCell minor={count.netValueMinor} showCosts={showCosts} />
        <TableCell>
          <RowButton onOpen={toggle}>{count.countedBy.name}</RowButton>
        </TableCell>
        <TableCell>
          <StatusBadge count={count} onApprovals={onApprovals} />
        </TableCell>
      </TableRow>
      {open ? (
        <CountDetail
          count={count}
          showCosts={showCosts}
          columns={campusName === undefined ? 8 : 9}
        />
      ) : null}
    </>
  );
}

export function StockCountsTable({
  data,
  campuses,
  showCampus,
  showCosts,
  page,
  onPage,
  onApprovals,
}: StockCountsTableProps) {
  const campusName = (id: string) =>
    showCampus
      ? (campuses.find((campus) => campus.id === id)?.name ?? '')
      : undefined;
  return (
    <Card>
      <CardContent className="px-0">
        {data.items.length === 0 ? (
          <NoCounts />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <span className="sr-only">Counted items</span>
                </TableHead>
                <TableHead>Ref</TableHead>
                <TableHead>Date</TableHead>
                {showCampus ? <TableHead>Campus</TableHead> : null}
                <TableHead>Differences</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Counted by</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((count) => (
                <CountRow
                  key={count.id}
                  count={count}
                  campusName={campusName(count.campusId)}
                  showCosts={showCosts}
                  onApprovals={onApprovals}
                />
              ))}
            </TableBody>
          </Table>
        )}
        <FinancePager page={page} total={data.total} onPage={onPage} />
      </CardContent>
    </Card>
  );
}
