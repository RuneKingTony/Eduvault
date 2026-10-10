import { CalendarIcon, EllipsisIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import type { SchoolYear } from '@eduvault/api-contract';
import { Can } from '@eduvault/auth-client';
import { fmtDateRange } from '@eduvault/shared';
import {
  Button,
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@eduvault/ui';
import { TermTable, type TermActions } from './term-table';

export interface YearActions extends TermActions {
  onAddHoliday: (year: SchoolYear) => void;
  onDelete: (year: SchoolYear) => void;
}

function opensByDefault(year: SchoolYear): boolean {
  const holdsCurrent = year.terms.some((term) => term.isCurrent);
  const startsNext = year.terms.some(
    (term) => term.sequence === 1 && term.canMakeCurrent
  );
  return holdsCurrent || startsNext;
}

function DeleteItem({
  year,
  onDelete,
}: {
  year: SchoolYear;
  onDelete: (year: SchoolYear) => void;
}) {
  const { ok, reason } = year.deletable;
  const item = (
    <DropdownMenuItem
      variant="destructive"
      disabled={!ok}
      onSelect={() => {
        onDelete(year);
      }}
    >
      <Trash2Icon />
      Delete school year
    </DropdownMenuItem>
  );
  if (ok || reason === null) {
    return item;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="block w-full">{item}</span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}

function YearActionsBar({
  year,
  today,
  actions,
}: {
  year: SchoolYear;
  today: string;
  actions: YearActions;
}) {
  return (
    <Can permission="session:update">
      <div className="flex items-center gap-1">
        {year.endsOn >= today ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              actions.onAddHoliday(year);
            }}
          >
            <PlusIcon />
            Add holiday
          </Button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`More for ${year.name}`}
            >
              <EllipsisIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DeleteItem year={year} onDelete={actions.onDelete} />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Can>
  );
}

export function SchoolYearCard({
  year,
  today,
  actions,
}: {
  year: SchoolYear;
  today: string;
  actions: YearActions;
}) {
  return (
    <Collapsible defaultOpen={opensByDefault(year)}>
      <Card>
        <CardHeader>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex min-w-0 flex-col items-start gap-0.5 text-left"
            >
              <CardTitle className="flex items-center gap-2">
                <CalendarIcon className="size-4" />
                {year.name}
              </CardTitle>
              <CardDescription>
                {fmtDateRange(year.startsOn, year.endsOn)}
              </CardDescription>
            </button>
          </CollapsibleTrigger>
          <CardAction>
            <YearActionsBar year={year} today={today} actions={actions} />
          </CardAction>
        </CardHeader>
        <CollapsibleContent>
          <TermTable year={year} actions={actions} />
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
