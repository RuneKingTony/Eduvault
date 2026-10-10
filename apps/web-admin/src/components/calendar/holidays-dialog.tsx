import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, XIcon } from 'lucide-react';
import type { Holiday } from '@eduvault/api-contract';
import { Can } from '@eduvault/auth-client';
import { fmtDate } from '@eduvault/shared';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ErrorMessage,
  toast,
} from '@eduvault/ui';
import { useApi } from '../../api';
import { invalidateCalendar } from '../../queries';
import { schoolDaysText, termTitle, type TermInYear } from './calendar-text';

function useRemoveHoliday({ term, year }: TermInYear) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (holidayId: string) =>
      api.holidays.remove({ params: { id: holidayId } }),
    onSuccess: async (result) => {
      await invalidateCalendar(queryClient);
      toast.success(
        `Holiday removed. ${termTitle(term, year)} now has ${schoolDaysText(result.term.schoolDays)}.`
      );
    },
  });
}

function HolidayRow({
  holiday,
  disabled,
  onRemove,
}: {
  holiday: Holiday;
  disabled: boolean;
  onRemove: () => void;
}) {
  return (
    <li className="flex items-center justify-between gap-2 px-3 py-1.5">
      <span>
        {fmtDate(holiday.date)} · {holiday.name}
      </span>
      <Can permission="session:update">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Remove ${holiday.name}, ${fmtDate(holiday.date)}`}
          disabled={disabled}
          onClick={onRemove}
        >
          <XIcon />
        </Button>
      </Can>
    </li>
  );
}

export function HolidaysDialog({
  target,
  onAddHoliday,
  onOpenChange,
}: {
  target: TermInYear;
  onAddHoliday: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const { term, year } = target;
  const remove = useRemoveHoliday(target);
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Holidays in {termTitle(term, year)}</DialogTitle>
          <DialogDescription>
            Holidays can be removed, not renamed. To change one, remove it and
            add it again.
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col divide-y rounded-md border text-sm">
          {term.holidays.map((holiday) => (
            <HolidayRow
              key={holiday.id}
              holiday={holiday}
              disabled={remove.isPending}
              onRemove={() => {
                remove.mutate(holiday.id);
              }}
            />
          ))}
        </ul>
        <ErrorMessage error={remove.error} />
        <DialogFooter>
          <Can permission="session:update">
            <Button type="button" variant="ghost" onClick={onAddHoliday}>
              <PlusIcon />
              Add holiday
            </Button>
          </Can>
          <Button
            type="button"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
