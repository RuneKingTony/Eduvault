import type { SubmitEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, TextField, fieldValue } from '@eduvault/ui';
import { useApi } from '../api';
import { ErrorMessage } from '../components/error-message';
import { campusesQueryOptions } from '../queries';

export function CampusesPage() {
  const api = useApi();
  const queryClient = useQueryClient();
  const campuses = useQuery(campusesQueryOptions(api));
  const create = useMutation({
    mutationFn: (input: { name: string; address: string }) =>
      api.campuses.create({
        body: { name: input.name, address: input.address || null },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campuses'] }),
  });

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    create.mutate(
      {
        name: fieldValue(data, 'name'),
        address: fieldValue(data, 'address'),
      },
      { onSuccess: () => form.reset() }
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Campuses</h2>
      <ErrorMessage error={campuses.error ?? create.error} />
      <ul className="divide-y rounded-md border">
        {campuses.data?.map((campus) => (
          <li key={campus.id} className="p-3">
            {campus.name}{' '}
            <span className="text-sm text-muted-foreground">
              {campus.address}
            </span>
          </li>
        ))}
      </ul>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <TextField label="Name" name="name" required />
        <TextField label="Address" name="address" />
        <Button type="submit" disabled={create.isPending}>
          Add campus
        </Button>
      </form>
    </section>
  );
}
