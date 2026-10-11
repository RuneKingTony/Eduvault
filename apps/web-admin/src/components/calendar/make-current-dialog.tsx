import {
  CalendarDaysIcon,
  CalendarPlusIcon,
  InfoIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import type { CalendarCurrent } from '@eduvault/api-contract';
import { Can, useCan } from '@eduvault/auth-client';
import { countOf } from '@eduvault/shared';
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ErrorMessage,
} from '@eduvault/ui';
import { termTitle, type TermInYear } from './calendar-text';
import { useMakeCurrent } from './use-make-current';

function StartYearAction({
  yearName,
  onStartYear,
}: {
  yearName: string;
  onStartYear: () => void;
}) {
  const canPlace = useCan('enrollment', 'place');
  if (!canPlace) {
    return (
      <p className="mt-1">
        Ask someone who can place students to start {yearName}.
      </p>
    );
  }
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="mt-2"
      onClick={onStartYear}
    >
      <CalendarPlusIcon />
      Start {yearName} first
    </Button>
  );
}

function WaitingCallout({
  yearName,
  waiting,
  onStartYear,
}: {
  yearName: string;
  waiting: number | null;
  onStartYear: () => void;
}) {
  if (waiting === null) {
    return null;
  }
  if (waiting === 0) {
    return (
      <Alert>
        <InfoIcon />
        <AlertDescription>
          Every student is in a {yearName} class.
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert>
      <TriangleAlertIcon />
      <AlertDescription>
        {countOf(waiting, 'student is', 'students are')} not in a {yearName}{' '}
        class yet. Start {yearName} first, or they will have no class this term.
        <StartYearAction yearName={yearName} onStartYear={onStartYear} />
      </AlertDescription>
    </Alert>
  );
}

function outgoingTitle(current: CalendarCurrent | undefined): string | null {
  const term = current?.term;
  const year = current?.schoolYear;
  if (term === undefined || term === null || !year) {
    return null;
  }
  return termTitle(term, year);
}

function MakeCurrentButton({
  waiting,
  disabled,
  onClick,
}: {
  waiting: number | null;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Can permission="session:setCurrent">
      <Button type="button" disabled={disabled} onClick={onClick}>
        {waiting !== null && waiting > 0
          ? 'Make current anyway'
          : 'Make current'}
      </Button>
    </Can>
  );
}

export function MakeCurrentDialog({
  target,
  current,
  onOpenChange,
  onStartYear,
}: {
  target: TermInYear;
  current: CalendarCurrent | undefined;
  onOpenChange: (open: boolean) => void;
  onStartYear: () => void;
}) {
  const { term, year } = target;
  const make = useMakeCurrent(() => {
    onOpenChange(false);
  });
  const waiting = year.studentsWaiting;
  const outgoing = outgoingTitle(current);
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDaysIcon className="size-4" />
            Make {termTitle(term, year)} current?
          </DialogTitle>
          <DialogDescription>
            {outgoing === null
              ? `${year.name} begins.`
              : `${year.name} begins, and ${outgoing} stops being the current term.`}
          </DialogDescription>
        </DialogHeader>
        <WaitingCallout
          yearName={year.name}
          waiting={waiting}
          onStartYear={onStartYear}
        />
        <ErrorMessage error={make.error} />
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <MakeCurrentButton
            waiting={waiting}
            disabled={make.isPending}
            onClick={() => {
              make.mutate(target);
            }}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
