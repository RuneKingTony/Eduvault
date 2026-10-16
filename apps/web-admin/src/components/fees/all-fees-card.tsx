import { useState } from 'react';
import {
  ArchiveIcon,
  ChevronDownIcon,
  MapPinIcon,
  PencilIcon,
  TagsIcon,
} from 'lucide-react';
import { TUITION_FEE_CODE, type FeeLine } from '@eduvault/api-contract';
import { useCan } from '@eduvault/auth-client';
import { money } from '@eduvault/shared';
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
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
import { FinancePager } from '../money/query-state';
import { pageOf } from './page-of';
import {
  APPLIES_TO_LABELS,
  EVERY_CAMPUS_LABEL,
  OPTIONAL_TIP,
  retiredTip,
} from './fee-text';

function LineCell({ line }: { line: FeeLine }) {
  const suffix =
    line.feeTypeCode === TUITION_FEE_CODE ? '' : ` · ${line.feeTypeName}`;
  return (
    <TableCell>
      <span className="font-medium">{line.name}</span>
      <span className="block text-xs text-muted-foreground">
        {line.levelName}
        {suffix}
      </span>
    </TableCell>
  );
}

function StatusBadge({ line }: { line: FeeLine }) {
  if (line.retiredAt === null) {
    return <Badge variant="success">Active</Badge>;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="secondary">Retired</Badge>
      </TooltipTrigger>
      <TooltipContent>{retiredTip(line)}</TooltipContent>
    </Tooltip>
  );
}

function Actions({
  line,
  onEdit,
  onRetire,
}: {
  line: FeeLine;
  onEdit: (line: FeeLine) => void;
  onRetire: (line: FeeLine) => void;
}) {
  const canReachAll = useCan('campus', 'readAll');
  const canUpdate = useCan('feeLine', 'update');
  const canRetire = useCan('feeLine', 'retire');
  const reach = line.campusId !== null || canReachAll;
  if (line.retiredAt !== null || !reach) {
    return null;
  }
  return (
    <span className="flex justify-end gap-1">
      {canUpdate ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Edit amount of ${line.name}`}
          onClick={() => {
            onEdit(line);
          }}
        >
          <PencilIcon />
        </Button>
      ) : null}
      {canRetire ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Retire line ${line.name}`}
          onClick={() => {
            onRetire(line);
          }}
        >
          <ArchiveIcon />
        </Button>
      ) : null}
    </span>
  );
}

function Row({
  line,
  currency,
  onEdit,
  onRetire,
}: {
  line: FeeLine;
  currency: string;
  onEdit: (line: FeeLine) => void;
  onRetire: (line: FeeLine) => void;
}) {
  return (
    <TableRow>
      <LineCell line={line} />
      <TableCell>
        {line.campusName === null ? (
          <span className="text-muted-foreground">{EVERY_CAMPUS_LABEL}</span>
        ) : (
          <Badge variant="outline">
            <MapPinIcon />
            {line.campusName}
          </Badge>
        )}
      </TableCell>
      <TableCell>
        <span className="flex flex-wrap items-center gap-1.5">
          {APPLIES_TO_LABELS[line.appliesTo]}
          {line.isOptional ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline">Optional</Badge>
              </TooltipTrigger>
              <TooltipContent>{OPTIONAL_TIP}</TooltipContent>
            </Tooltip>
          ) : null}
        </span>
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {money(line.amountMinor, currency)}
      </TableCell>
      <TableCell>
        <StatusBadge line={line} />
      </TableCell>
      <TableCell>
        <Actions line={line} onEdit={onEdit} onRetire={onRetire} />
      </TableCell>
    </TableRow>
  );
}

function FeesTable({
  lines,
  currency,
  onEdit,
  onRetire,
}: {
  lines: readonly FeeLine[];
  currency: string;
  onEdit: (line: FeeLine) => void;
  onRetire: (line: FeeLine) => void;
}) {
  const [page, setPage] = useState(1);
  const shown = pageOf(lines, page);
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Line</TableHead>
            <TableHead>Campus</TableHead>
            <TableHead>Applies to</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((line) => (
            <Row
              key={line.id}
              line={line}
              currency={currency}
              onEdit={onEdit}
              onRetire={onRetire}
            />
          ))}
        </TableBody>
      </Table>
      <FinancePager page={page} total={lines.length} onPage={setPage} />
    </>
  );
}

function AllFeesHeader({ count, open }: { count: number; open: boolean }) {
  return (
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        All fees
        <Badge variant="secondary">{count}</Badge>
      </CardTitle>
      <CardDescription>Edit an amount or retire a fee.</CardDescription>
      <CardAction>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={open ? 'Collapse all fees' : 'Expand all fees'}
          >
            <ChevronDownIcon className={open ? '' : '-rotate-90'} />
          </Button>
        </CollapsibleTrigger>
      </CardAction>
    </CardHeader>
  );
}

export function AllFeesCard({
  lines,
  currency,
  emptyTitle,
  onEdit,
  onRetire,
}: {
  lines: readonly FeeLine[];
  currency: string;
  emptyTitle: string;
  onEdit: (line: FeeLine) => void;
  onRetire: (line: FeeLine) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <Card>
        <AllFeesHeader count={lines.length} open={open} />
        <CollapsibleContent>
          <CardContent className="px-0">
            {lines.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <TagsIcon />
                  </EmptyMedia>
                  <EmptyTitle>{emptyTitle}</EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              <FeesTable
                lines={lines}
                currency={currency}
                onEdit={onEdit}
                onRetire={onRetire}
              />
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
