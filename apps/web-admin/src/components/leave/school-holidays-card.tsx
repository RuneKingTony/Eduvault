import { CalendarIcon } from 'lucide-react';
import type { DayOffEntry } from '@eduvault/api-contract';
import { dayOffRows } from '@eduvault/shared';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DayOffList,
} from '@eduvault/ui';
import { useToday } from '../calendar/use-today';

export function SchoolHolidaysCard({
  holidays,
}: {
  holidays: readonly DayOffEntry[];
}) {
  const today = useToday();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarIcon className="size-4" />
          School holidays
        </CardTitle>
        <CardDescription>
          No need to request leave on these days.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DayOffList
          rows={dayOffRows(holidays, 'portal', today)}
          isPending={false}
          error={null}
          className="max-h-72 overflow-y-auto"
        />
      </CardContent>
    </Card>
  );
}
