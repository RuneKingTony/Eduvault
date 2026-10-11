import { useQuery } from '@tanstack/react-query';
import { DayOffList } from '@eduvault/ui';
import { dayOffRows, type DaysOffCopy } from '@eduvault/shared';
import { useApi } from '../../api';
import { daysOffQueryOptions } from '../../queries';

export const DAYS_OFF_LIMIT = 200;

export function DaysOffList({
  copy,
  today,
}: {
  copy: DaysOffCopy;
  today: string;
}) {
  const { data, isPending, error } = useQuery({
    ...daysOffQueryOptions(useApi(), DAYS_OFF_LIMIT),
    select: (daysOff) => dayOffRows(daysOff, copy, today),
  });
  return (
    <DayOffList
      rows={data}
      isPending={isPending}
      error={error}
      className="max-h-72 overflow-y-auto"
    />
  );
}
