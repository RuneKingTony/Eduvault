import { EllipsisIcon, PencilIcon } from 'lucide-react';
import type { SchoolYear, Term } from '@eduvault/api-contract';
import { Can, useCan } from '@eduvault/auth-client';
import { countOf, fmtDateRange } from '@eduvault/shared';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
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
import { holidayListText } from './calendar-text';

export interface TermActions {
  onMakeCurrent: (term: Term) => void;
  onEditDates: (term: Term) => void;
  onOpenHolidays: (term: Term) => void;
}

function HolidaysCell({
  term,
  onOpen,
}: {
  term: Term;
  onOpen: (term: Term) => void;
}) {
  const canUpdate = useCan('session', 'update');
  if (term.holidayCount === 0) {
    return <>—</>;
  }
  const text = countOf(term.holidayCount, 'day', 'days');
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {canUpdate && !term.ended ? (
          <Button
            type="button"
            variant="link"
            size="xs"
            onClick={() => {
              onOpen(term);
            }}
          >
            {text}
          </Button>
        ) : (
          <span>{text}</span>
        )}
      </TooltipTrigger>
      <TooltipContent>{holidayListText(term)}</TooltipContent>
    </Tooltip>
  );
}

function TermRowActions({
  term,
  actions,
}: {
  term: Term;
  actions: TermActions;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      {term.isCurrent ? <Badge>Current</Badge> : null}
      {term.canMakeCurrent ? (
        <Can permission="session:setCurrent">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => {
              actions.onMakeCurrent(term);
            }}
          >
            Make current
          </Button>
        </Can>
      ) : null}
      {term.ended ? null : (
        <Can permission="session:update">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Actions for ${term.name}`}
              >
                <EllipsisIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => {
                  actions.onEditDates(term);
                }}
              >
                <PencilIcon />
                Edit dates
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Can>
      )}
    </div>
  );
}

export function TermTable({
  year,
  actions,
}: {
  year: SchoolYear;
  actions: TermActions;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Term</TableHead>
          <TableHead>Dates</TableHead>
          <TableHead className="text-right">School days</TableHead>
          <TableHead>Holidays</TableHead>
          <TableHead>
            <span className="sr-only">Status and actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {year.terms.map((term) => (
          <TableRow key={term.id}>
            <TableCell className="font-medium">{term.name}</TableCell>
            <TableCell>{fmtDateRange(term.startsOn, term.endsOn)}</TableCell>
            <TableCell className="text-right">{term.schoolDays}</TableCell>
            <TableCell>
              <HolidaysCell term={term} onOpen={actions.onOpenHolidays} />
            </TableCell>
            <TableCell>
              <TermRowActions term={term} actions={actions} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
