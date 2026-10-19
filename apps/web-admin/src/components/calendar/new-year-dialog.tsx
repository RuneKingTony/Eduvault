import { useState, type SubmitEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import type { CreatedSchoolYear } from '@eduvault/api-contract';
import { Can } from '@eduvault/auth-client';
import { newYearDefaults } from '@eduvault/shared';
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
  PageSkeleton,
  TextField,
  fieldValue,
  toast,
} from '@eduvault/ui';
import { useApi } from '../../api';
import {
  invalidateCalendar,
  refreshForCurrentTerm,
  schoolYearsQueryOptions,
} from '../../queries';
import { useToday } from './use-today';

const MISSING_FIELDS = 'Fill in the year and both dates.';

const createdYearToast = (created: CreatedSchoolYear): string =>
  `${created.name} created with three terms.${created.madeCurrent ? ' First term is now the current term.' : ''}`;

function useCreateYear(onCreated: () => void) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; startsOn: string; endsOn: string }) =>
      api.schoolYears.create({ body }),
    onSuccess: async (created) => {
      await (created.madeCurrent
        ? refreshForCurrentTerm(queryClient)
        : invalidateCalendar(queryClient));
      toast.success(createdYearToast(created));
      onCreated();
    },
  });
}

function YearFields({
  defaults,
}: {
  defaults: { name: string; startsOn: string; endsOn: string };
}) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <TextField
          label="Year"
          name="name"
          placeholder="2028/2029"
          autoComplete="off"
          defaultValue={defaults.name}
          aria-describedby="new-year-hint"
          required
        />
        <p id="new-year-hint" className="text-xs text-muted-foreground">
          Two years in a row, for example 2028/2029.
        </p>
      </div>
      <TextField
        label="Starts"
        name="startsOn"
        type="date"
        defaultValue={defaults.startsOn}
        required
      />
      <TextField
        label="Ends"
        name="endsOn"
        type="date"
        defaultValue={defaults.endsOn}
        required
      />
    </>
  );
}

function NewYearForm({ onClose }: { onClose: () => void }) {
  const api = useApi();
  const today = useToday();
  const years = useQuery(schoolYearsQueryOptions(api, 1));
  const [formError, setFormError] = useState<string | undefined>();
  const create = useCreateYear(onClose);

  if (years.isPending) {
    return <PageSkeleton rows={1} />;
  }
  const defaults = newYearDefaults(years.data?.items[0] ?? null, today);

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const body = {
      name: fieldValue(data, 'name').trim(),
      startsOn: fieldValue(data, 'startsOn'),
      endsOn: fieldValue(data, 'endsOn'),
    };
    if (Object.values(body).includes('')) {
      setFormError(MISSING_FIELDS);
      return;
    }
    setFormError(undefined);
    create.mutate(body);
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>New school year</DialogTitle>
        <DialogDescription>
          Three terms are created for you, with breaks between them. You can add
          holidays afterwards.
        </DialogDescription>
      </DialogHeader>
      <YearFields defaults={defaults} />
      <FieldError message={formError} />
      <ErrorMessage error={create.error} />
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Can permission="session:create">
          <Button type="submit" disabled={create.isPending}>
            <PlusIcon />
            Create school year
          </Button>
        </Can>
      </DialogFooter>
    </form>
  );
}

export function NewYearDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <NewYearForm
          onClose={() => {
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
