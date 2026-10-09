import { useQuery } from '@tanstack/react-query';
import { naira } from '@eduvault/shared';
import { useApi } from '../api';
import { ErrorMessage } from '../components/error-message';
import { feeSchedulesQueryOptions } from '../queries';

export function FeesPage() {
  const api = useApi();
  const fees = useQuery(feeSchedulesQueryOptions(api));

  return (
    <section className="flex flex-col gap-4">
      <h1>Fee schedules</h1>
      <ErrorMessage error={fees.error} />
      <ul className="divide-y rounded-md border">
        {fees.data?.map((fee) => (
          <li key={fee.id} className="flex justify-between p-3">
            <span>{fee.name}</span>
            <span className="text-muted-foreground">
              {naira(fee.amountMinor)}
            </span>
          </li>
        ))}
        {fees.data?.length === 0 ? (
          <li className="p-3 text-muted-foreground">No fee schedules.</li>
        ) : null}
      </ul>
    </section>
  );
}
