import { Link } from '@tanstack/react-router';
import { CalendarIcon } from 'lucide-react';
import { useCan } from '@eduvault/auth-client';
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '@eduvault/ui';
import { DaysOffList } from './days-off-list';

export function UpcomingHolidaysCard({ today }: { today: string }) {
  const canSeeCalendar = useCan('session', 'read');
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarIcon aria-hidden="true" />
          Upcoming holidays
        </CardTitle>
        {canSeeCalendar ? (
          <CardAction>
            <Button asChild variant="outline" size="sm">
              <Link to="/calendar">Calendar</Link>
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        <DaysOffList copy="portal" today={today} />
      </CardContent>
    </Card>
  );
}
