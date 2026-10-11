import { useState } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { CalendarIcon, InfoIcon, PlusIcon } from 'lucide-react';
import {
  SCHOOL_YEAR_PAGE_SIZE,
  type SchoolYear,
  type SchoolYearList,
  type Term,
} from '@eduvault/api-contract';
import { Can } from '@eduvault/auth-client';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  ErrorMessage,
  NumberedPager,
  PageSkeleton,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  toast,
} from '@eduvault/ui';
import { useApi } from '../api';
import {
  CalendarDialogs,
  type CalendarDialog,
} from '../components/calendar/calendar-dialogs';
import { findTerm } from '../components/calendar/calendar-text';
import { NewYearDialog } from '../components/calendar/new-year-dialog';
import {
  SchoolYearCard,
  type YearActions,
} from '../components/calendar/school-year-card';
import { useMakeCurrent } from '../components/calendar/use-make-current';
import { useToday } from '../components/calendar/use-today';
import { currentTermQueryOptions, schoolYearsQueryOptions } from '../queries';

interface CalendarPageProps {
  page: number;
  newYearOpen: boolean;
  onPageChange: (page: number) => void;
  onNewYearOpenChange: (open: boolean) => void;
  onStartYear: () => void;
}

function CalendarHeader({ onNewYear }: { onNewYear: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h1 className="flex items-center gap-2">
          School years and terms
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="About school years and terms"
                className="text-muted-foreground"
              >
                <InfoIcon className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              Charges and payments belong to a term. One term is current at a
              time.
            </TooltipContent>
          </Tooltip>
        </h1>
        <p className="text-muted-foreground">Each school year and its terms.</p>
      </div>
      <Can permission="session:create">
        <Button type="button" onClick={onNewYear}>
          <PlusIcon />
          New school year
        </Button>
      </Can>
    </div>
  );
}

function EmptyYears({ onNewYear }: { onNewYear: () => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarIcon className="size-4" />
          School years
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No school years yet</EmptyTitle>
            <EmptyDescription>
              Create the first school year to set up its terms.
            </EmptyDescription>
          </EmptyHeader>
          <Can permission="session:create">
            <Button type="button" size="sm" onClick={onNewYear}>
              New school year
            </Button>
          </Can>
        </Empty>
      </CardContent>
    </Card>
  );
}

function holidayTermOf(year: SchoolYear): Term | undefined {
  return (
    year.terms.find((term) => term.isCurrent && !term.ended) ??
    year.terms.find((term) => !term.ended)
  );
}

function useYearActions(
  items: readonly SchoolYear[],
  setDialog: (dialog: CalendarDialog) => void
): YearActions {
  const makeCurrent = useMakeCurrent();
  return {
    onMakeCurrent: (term) => {
      const target = findTerm(items, term.id);
      if (target === undefined) {
        return;
      }
      if (target.year.terms.some((sibling) => sibling.isCurrent)) {
        makeCurrent.mutate(target, {
          onError: (error) => {
            toast.error(error.message);
          },
        });
      } else {
        setDialog({ kind: 'make-current', termId: term.id });
      }
    },
    onEditDates: (term) => {
      setDialog({ kind: 'edit-dates', termId: term.id });
    },
    onOpenHolidays: (term) => {
      setDialog({ kind: 'holidays', termId: term.id });
    },
    onAddHoliday: (year) => {
      const term = holidayTermOf(year);
      if (term === undefined) {
        toast.error('This school year has already ended.');
      } else {
        setDialog({ kind: 'add-holiday', termId: term.id });
      }
    },
    onDelete: (year) => {
      setDialog({ kind: 'delete', yearId: year.id });
    },
  };
}

function YearsBody({
  query,
  page,
  actions,
  onPageChange,
  onNewYear,
}: {
  query: UseQueryResult<SchoolYearList>;
  page: number;
  actions: YearActions;
  onPageChange: (page: number) => void;
  onNewYear: () => void;
}) {
  const today = useToday();
  if (query.isPending) {
    return <PageSkeleton rows={3} />;
  }
  if (query.data === undefined) {
    return null;
  }
  if (query.data.total === 0) {
    return <EmptyYears onNewYear={onNewYear} />;
  }
  return (
    <>
      {query.data.items.map((year) => (
        <SchoolYearCard
          key={year.id}
          year={year}
          today={today}
          actions={actions}
        />
      ))}
      <NumberedPager
        page={page}
        total={query.data.total}
        pageSize={SCHOOL_YEAR_PAGE_SIZE}
        onPage={onPageChange}
      />
    </>
  );
}

export function CalendarPage({
  page,
  newYearOpen,
  onPageChange,
  onNewYearOpenChange,
  onStartYear,
}: CalendarPageProps) {
  const api = useApi();
  const years = useQuery(schoolYearsQueryOptions(api, page));
  const current = useQuery(currentTermQueryOptions(api));
  const [dialog, setDialog] = useState<CalendarDialog | null>(null);
  const actions = useYearActions(years.data?.items ?? [], setDialog);
  const openNewYear = () => {
    onNewYearOpenChange(true);
  };

  return (
    <section className="flex flex-col gap-4">
      <CalendarHeader onNewYear={openNewYear} />
      <ErrorMessage error={years.error} />
      <YearsBody
        query={years}
        page={page}
        actions={actions}
        onPageChange={onPageChange}
        onNewYear={openNewYear}
      />
      <NewYearDialog open={newYearOpen} onOpenChange={onNewYearOpenChange} />
      <CalendarDialogs
        dialog={dialog}
        years={years.data?.items ?? []}
        current={current.data}
        onChange={setDialog}
        onStartYear={onStartYear}
      />
    </section>
  );
}
