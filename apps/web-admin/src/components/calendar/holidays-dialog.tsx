import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, XIcon } from 'lucide-react';
import type { Holiday } from '@eduvault/api-contract';
import { Can } from '@eduvault/auth-client';
import { fmtDate } from '@eduvault/shared';
import {
  ConfirmDialog,
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
import { useConfirmStep } from '../use-confirm-step';
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

function RemovableHolidays({ target }: { target: TermInYear }) {
  const remove = useRemoveHoliday(target);
  const step = useConfirmStep<Holiday>((holiday, settled) => {
    remove.mutate(holiday.id, { onSettled: settled });
  });
  return (
    <>
      <ul className="flex flex-col divide-y rounded-md border text-sm">
        {target.term.holidays.map((holiday) => (
          <HolidayRow
            key={holiday.id}
            holiday={holiday}
            disabled={remove.isPending}
            onRemove={() => {
              step.ask(holiday);
            }}
          />
        ))}
      </ul>
      <ErrorMessage error={remove.error} />
      <ConfirmDialog
        open={step.target !== null}
        title="Remove this holiday?"
        description="It comes off the calendar and the term’s school days are recounted."
        details={
          step.target === null
            ? []
            : [
                { label: 'Holiday', value: step.target.name },
                { label: 'Date', value: fmtDate(step.target.date) },
              ]
        }
        tone="destructive"
        confirmLabel="Remove holiday"
        pending={remove.isPending}
        onConfirm={step.confirm}
        onCancel={step.cancel}
      />
    </>
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
        <RemovableHolidays target={target} />
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
