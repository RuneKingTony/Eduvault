import { useQuery } from '@tanstack/react-query';
import { CalendarIcon } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DayOffList,
} from '@eduvault/ui';
import { dayOffRows } from '@eduvault/shared';
import { useApi } from '../api';
import { daysOffQueryOptions } from '../queries';

function HolidayList({ today }: { today: string }) {
  const { data, isPending, error } = useQuery({
    ...daysOffQueryOptions(useApi()),
    select: (daysOff) => dayOffRows(daysOff, 'portal', today),
  });
  return <DayOffList rows={data} isPending={isPending} error={error} />;
}

export function HolidaysCard({ today }: { today: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarIcon aria-hidden="true" />
          Upcoming holidays
        </CardTitle>
      </CardHeader>
      <CardContent>
        <HolidayList today={today} />
      </CardContent>
    </Card>
  );
}
