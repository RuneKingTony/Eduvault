import { useState, type SubmitEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SchoolYear } from '@eduvault/api-contract';
import { Can } from '@eduvault/auth-client';
import { addDays } from '@eduvault/shared';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ErrorMessage,
  FieldError,
  Label,
  NativeSelect,
  NativeSelectOption,
  TextField,
  fieldValue,
  toast,
} from '@eduvault/ui';
import { useApi } from '../../api';
import { invalidateCalendar } from '../../queries';
import {
  findTerm,
  schoolDaysText,
  termTitle,
  type TermInYear,
} from './calendar-text';
import { useToday } from './use-today';

export const NO_TERM_ERROR = 'Choose a term for the holiday.';

export function openTerms(years: readonly SchoolYear[]): TermInYear[] {
  return years
    .flatMap((year) =>
      year.terms.filter((term) => !term.ended).map((term) => ({ term, year }))
    )
    .toSorted((a, b) => a.term.startsOn.localeCompare(b.term.startsOn));
}

function defaultDate(target: TermInYear | undefined, today: string): string {
  if (target === undefined) {
    return '';
  }
  const later = target.term.startsOn > today ? target.term.startsOn : today;
  return addDays(later, 7);
}

function useAddHoliday(target: TermInYear | undefined, added: () => void) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { termId: string; date: string; name: string }) =>
      api.holidays.create({
        params: { id: input.termId },
        body: { date: input.date, name: input.name },
      }),
    onSuccess: async (result) => {
      await invalidateCalendar(queryClient);
      if (target !== undefined) {
        toast.success(
          `Holiday added. ${termTitle(target.term, target.year)} now has ${schoolDaysText(result.term.schoolDays)}.`
        );
      }
      added();
    },
  });
}

function HolidayTerm({
  options,
  termId,
  onChange,
}: {
  options: readonly TermInYear[];
  termId: string;
  onChange: (termId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="holiday-term">Term</Label>
      <NativeSelect
        id="holiday-term"
        name="termId"
        className="w-full"
        value={termId}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      >
        {options.map(({ term, year }) => (
          <NativeSelectOption key={term.id} value={term.id}>
            {year.name} · {term.name}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <p className="text-xs text-muted-foreground">
        Only current and future terms are listed.
      </p>
    </div>
  );
}

function validate(
  target: TermInYear | undefined,
  data: FormData
): { error: string } | { termId: string; date: string; name: string } {
  const date = fieldValue(data, 'date');
  const name = fieldValue(data, 'name').trim();
  if (target === undefined) {
    return { error: NO_TERM_ERROR };
  }
  if (date === '' || name === '') {
    return { error: 'Fill in the date and the name.' };
  }
  return { termId: target.term.id, date, name };
}

function AddHolidayForm({
  years,
  initialTermId,
  onClose,
}: {
  years: readonly SchoolYear[];
  initialTermId: string | null;
  onClose: () => void;
}) {
  const today = useToday();
  const options = openTerms(years);
  const [termId, setTermId] = useState(
    initialTermId ?? options[0]?.term.id ?? ''
  );
  const [formError, setFormError] = useState<string | undefined>();
  const target = findTerm(years, termId);
  const add = useAddHoliday(target, onClose);

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const checked = validate(target, new FormData(event.currentTarget));
    setFormError('error' in checked ? checked.error : undefined);
    if (!('error' in checked)) {
      add.mutate(checked);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>Add a holiday</DialogTitle>
        <DialogDescription>
          Days open = weekdays in the term minus holidays.
        </DialogDescription>
      </DialogHeader>
      <HolidayTerm options={options} termId={termId} onChange={setTermId} />
      <TextField
        key={termId}
        label="Date"
        name="date"
        type="date"
        defaultValue={defaultDate(target, today)}
        required
      />
      <TextField label="Name" name="name" autoComplete="off" required />
      <FieldError message={formError} />
      <ErrorMessage error={add.error} />
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Can permission="session:update">
          <Button type="submit" disabled={add.isPending}>
            Add holiday
          </Button>
        </Can>
      </DialogFooter>
    </form>
  );
}

export function AddHolidayDialog({
  years,
  termId,
  onOpenChange,
}: {
  years: readonly SchoolYear[];
  termId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <AddHolidayForm
          years={years}
          initialTermId={termId}
          onClose={() => {
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
