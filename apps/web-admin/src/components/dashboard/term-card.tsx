import { Link } from '@tanstack/react-router';
import { CalendarDaysIcon } from 'lucide-react';
import { useCan } from '@eduvault/auth-client';
import type { CalendarCurrent } from '@eduvault/api-contract';
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
  Progress,
  Separator,
} from '@eduvault/ui';
import {
  fmtDate,
  termPercentDone,
  termWeek,
  termWeeks,
} from '@eduvault/shared';
import { DaysOffList } from './days-off-list';

export function TermCard({
  current,
  today,
}: {
  current: CalendarCurrent;
  today: string;
}) {
  const canSeeCalendar = useCan('session', 'read');
  const { term, schoolYear, schoolDays, schoolDaysSoFar } = current;
  if (term === null || schoolYear === null) {
    return null;
  }
  const percent = termPercentDone(schoolDaysSoFar, schoolDays);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDaysIcon aria-hidden="true" />
          {term.name} · {schoolYear.name}
        </CardTitle>
        {canSeeCalendar ? (
          <CardAction>
            <Button asChild variant="outline" size="sm">
              <Link to="/calendar">Calendar</Link>
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p>
          <span className="text-2xl font-semibold">
            Week {termWeek(schoolDaysSoFar)}
          </span>{' '}
          <span className="text-sm text-muted-foreground">
            of {termWeeks(schoolDays)}
          </span>
        </p>
        <p className="text-sm text-muted-foreground">
          {schoolDaysSoFar} of {schoolDays} school days
        </p>
        <Progress value={percent} aria-label="School days done" />
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>{fmtDate(term.startsOn)}</span>
          <span>{fmtDate(term.endsOn)}</span>
        </div>
        <Separator />
        <DaysOffList copy="staff" today={today} />
      </CardContent>
    </Card>
  );
}
