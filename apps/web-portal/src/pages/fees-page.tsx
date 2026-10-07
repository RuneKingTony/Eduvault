import { useQuery } from '@tanstack/react-query';
import { useApi } from '../api';
import { ErrorMessage } from '../components/error-message';

export function FeesPage() {
  const api = useApi();
  const fees = useQuery({
    queryKey: ['fee-schedules'],
    queryFn: () => api.feeSchedules.list({ query: {} }),
  });

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Fee schedules</h2>
      <ErrorMessage error={fees.error} />
      <ul className="divide-y rounded-md border">
        {fees.data?.map((fee) => (
          <li key={fee.id} className="flex justify-between p-3">
            <span>{fee.name}</span>
            <span className="text-muted-foreground">
              {(fee.amountMinor / 100).toLocaleString()} {fee.currency}
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
