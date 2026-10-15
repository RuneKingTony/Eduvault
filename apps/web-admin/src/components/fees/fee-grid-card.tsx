import { useState } from 'react';
import { InfoIcon, TagsIcon } from 'lucide-react';
import type { FeeGrid } from '@eduvault/api-contract';
import { money } from '@eduvault/shared';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@eduvault/ui';
import { FinancePager } from '../money/query-state';
import { FeeCell } from './fee-cell';
import { pageOf } from './page-of';
import { TYPICAL_TOTAL_TIP, feeCount } from './fee-text';

function lineCount(grid: FeeGrid): number {
  return grid.rows.reduce(
    (sum, row) =>
      sum +
      row.cells.reduce(
        (cells, cell) =>
          cells + (cell.base === null ? 0 : 1) + cell.overrides.length,
        0
      ),
    0
  );
}

function TotalHead() {
  return (
    <TableHead className="text-right">
      <span className="inline-flex items-center gap-1">
        Typical total
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="About the typical total"
              className="text-muted-foreground"
            >
              <InfoIcon className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{TYPICAL_TOTAL_TIP}</TooltipContent>
        </Tooltip>
      </span>
    </TableHead>
  );
}

function GridTable({
  grid,
  page,
  showTotal,
}: {
  grid: FeeGrid;
  page: number;
  showTotal: boolean;
}) {
  const rows = pageOf(grid.rows, page);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Level</TableHead>
          {grid.feeTypes.map((feeType) => (
            <TableHead key={feeType.id}>{feeType.name}</TableHead>
          ))}
          {showTotal ? <TotalHead /> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.level.id}>
            <TableCell className="font-medium">{row.level.name}</TableCell>
            {row.cells.map((cell) => (
              <TableCell key={cell.feeTypeId}>
                <FeeCell cell={cell} currency={grid.currency} />
              </TableCell>
            ))}
            {showTotal ? (
              <TableCell className="text-right font-medium tabular-nums">
                {money(row.typicalTotalMinor ?? 0, grid.currency)}
              </TableCell>
            ) : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function FeeGridCard({
  grid,
  title,
  showTotal,
  emptyTitle,
}: {
  grid: FeeGrid;
  title: string;
  showTotal: boolean;
  emptyTitle: string;
}) {
  const [page, setPage] = useState(1);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TagsIcon className="size-4 text-muted-foreground" />
          {title}
        </CardTitle>
        <CardDescription>
          {feeCount(lineCount(grid), grid.rows.length)}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        {grid.rows.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <TagsIcon />
              </EmptyMedia>
              <EmptyTitle>{emptyTitle}</EmptyTitle>
              <EmptyDescription>
                Add a fee and it shows here, level by level.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <GridTable grid={grid} page={page} showTotal={showTotal} />
            <FinancePager
              page={page}
              total={grid.rows.length}
              onPage={setPage}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
