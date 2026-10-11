import type { CalendarCurrent, SchoolYear } from '@eduvault/api-contract';
import { AddHolidayDialog } from './add-holiday-dialog';
import { findTerm, type TermInYear } from './calendar-text';
import { DeleteYearDialog } from './delete-year-dialog';
import { EditDatesDialog } from './edit-dates-dialog';
import { HolidaysDialog } from './holidays-dialog';
import { MakeCurrentDialog } from './make-current-dialog';

export type CalendarDialog =
  | { kind: 'edit-dates'; termId: string }
  | { kind: 'add-holiday'; termId: string | null }
  | { kind: 'holidays'; termId: string }
  | { kind: 'delete'; yearId: string }
  | { kind: 'make-current'; termId: string };

function YearDialog({
  dialog,
  years,
  onClose,
}: {
  dialog: Extract<CalendarDialog, { kind: 'delete' | 'add-holiday' }>;
  years: readonly SchoolYear[];
  onClose: (open: boolean) => void;
}) {
  if (dialog.kind === 'add-holiday') {
    return (
      <AddHolidayDialog
        years={years}
        termId={dialog.termId}
        onOpenChange={onClose}
      />
    );
  }
  const year = years.find((candidate) => candidate.id === dialog.yearId);
  return year === undefined ? null : (
    <DeleteYearDialog year={year} onOpenChange={onClose} />
  );
}

function TermDialog({
  dialog,
  target,
  current,
  onChange,
  onStartYear,
}: {
  dialog: Extract<
    CalendarDialog,
    { kind: 'edit-dates' | 'holidays' | 'make-current' }
  >;
  target: TermInYear;
  current: CalendarCurrent | undefined;
  onChange: (dialog: CalendarDialog | null) => void;
  onStartYear: () => void;
}) {
  const close = (open: boolean) => {
    if (!open) {
      onChange(null);
    }
  };
  switch (dialog.kind) {
    case 'edit-dates': {
      return <EditDatesDialog target={target} onOpenChange={close} />;
    }
    case 'holidays': {
      return (
        <HolidaysDialog
          target={target}
          onAddHoliday={() => {
            onChange({ kind: 'add-holiday', termId: target.term.id });
          }}
          onOpenChange={close}
        />
      );
    }
    case 'make-current': {
      return (
        <MakeCurrentDialog
          target={target}
          current={current}
          onOpenChange={close}
          onStartYear={onStartYear}
        />
      );
    }
  }
}

export function CalendarDialogs({
  dialog,
  years,
  current,
  onChange,
  onStartYear,
}: {
  dialog: CalendarDialog | null;
  years: readonly SchoolYear[];
  current: CalendarCurrent | undefined;
  onChange: (dialog: CalendarDialog | null) => void;
  onStartYear: () => void;
}) {
  if (dialog === null) {
    return null;
  }
  if (dialog.kind === 'delete' || dialog.kind === 'add-holiday') {
    return (
      <YearDialog
        dialog={dialog}
        years={years}
        onClose={(open) => {
          if (!open) {
            onChange(null);
          }
        }}
      />
    );
  }
  const target = findTerm(years, dialog.termId);
  return target === undefined ? null : (
    <TermDialog
      dialog={dialog}
      target={target}
      current={current}
      onChange={onChange}
      onStartYear={onStartYear}
    />
  );
}
