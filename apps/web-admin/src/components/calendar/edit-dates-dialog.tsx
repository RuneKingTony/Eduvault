import { useState, type SubmitEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Can } from '@eduvault/auth-client';
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
  TextField,
  fieldValue,
  toast,
} from '@eduvault/ui';
import { useApi } from '../../api';
import { invalidateCalendar } from '../../queries';
import { schoolDaysText, termTitle, type TermInYear } from './calendar-text';

function useSaveDates({ term, year }: TermInYear, saved: () => void) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { startsOn: string; endsOn: string }) =>
      api.terms.update({ params: { id: term.id }, body }),
    onSuccess: async (updated) => {
      await invalidateCalendar(queryClient);
      toast.success(
        `Dates saved. ${termTitle(term, year)} now has ${schoolDaysText(updated.schoolDays)}.`
      );
      saved();
    },
  });
}

function DateFields({
  startsOn,
  endsOn,
}: {
  startsOn: string;
  endsOn: string;
}) {
  return (
    <>
      <TextField
        label="Starts"
        name="startsOn"
        type="date"
        defaultValue={startsOn}
        required
      />
      <TextField
        label="Ends"
        name="endsOn"
        type="date"
        defaultValue={endsOn}
        required
      />
    </>
  );
}

function EditDatesForm({
  target,
  onClose,
}: {
  target: TermInYear;
  onClose: () => void;
}) {
  const { term, year } = target;
  const [formError, setFormError] = useState<string | undefined>();
  const save = useSaveDates(target, onClose);

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const body = {
      startsOn: fieldValue(data, 'startsOn'),
      endsOn: fieldValue(data, 'endsOn'),
    };
    if (body.startsOn === '' || body.endsOn === '') {
      setFormError('Fill in both dates.');
      return;
    }
    setFormError(undefined);
    save.mutate(body);
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>Edit {termTitle(term, year)}</DialogTitle>
        <DialogDescription>
          Terms stay in order, inside the school year, without overlapping.
        </DialogDescription>
      </DialogHeader>
      <DateFields startsOn={term.startsOn} endsOn={term.endsOn} />
      <FieldError message={formError} />
      <ErrorMessage error={save.error} />
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Can permission="session:update">
          <Button type="submit" disabled={save.isPending}>
            Save dates
          </Button>
        </Can>
      </DialogFooter>
    </form>
  );
}

export function EditDatesDialog({
  target,
  onOpenChange,
}: {
  target: TermInYear;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <EditDatesForm
          target={target}
          onClose={() => {
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
