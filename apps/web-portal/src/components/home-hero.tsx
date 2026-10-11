import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarPlusIcon } from 'lucide-react';
import type { PortalMe, PortalStudent } from '@eduvault/api-contract';
import { UserAvatar } from '@eduvault/auth-client';
import {
  Alert,
  AlertDescription,
  ErrorMessage,
  Progress,
  Skeleton,
} from '@eduvault/ui';
import {
  fmtDate,
  greetingFor,
  lagosHourOf,
  termPercentDone,
  termWeek,
  termWeeks,
} from '@eduvault/shared';
import { useApi } from '../api';
import { calendarCurrentQueryOptions } from '../queries';

const classLine = (student: PortalStudent): string =>
  `${student.className ?? '—'} · ${student.campusName} campus`;

function TermFacts() {
  const current = useQuery(calendarCurrentQueryOptions(useApi()));
  if (current.isPending) {
    return <Skeleton role="status" aria-label="Loading" className="h-12" />;
  }
  if (current.data === undefined) {
    return <ErrorMessage error={current.error} />;
  }
  const { term, schoolYear, schoolDays, schoolDaysSoFar } = current.data;
  if (term === null || schoolYear === null) {
    return (
      <Alert>
        <CalendarPlusIcon />
        <AlertDescription>
          Your school hasn’t set up its school year yet.
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="flex flex-wrap gap-x-4 text-sm text-muted-foreground">
        <span>
          <strong className="text-foreground">{term.name}</strong>{' '}
          {schoolYear.name}
        </span>
        <span>
          Week{' '}
          <strong className="text-foreground">
            {termWeek(schoolDaysSoFar)}
          </strong>{' '}
          of {termWeeks(schoolDays)}
        </span>
        <span>
          Ends{' '}
          <strong className="text-foreground">{fmtDate(term.endsOn)}</strong>
        </span>
      </p>
      <Progress
        value={termPercentDone(schoolDaysSoFar, schoolDays)}
        aria-label="School days done"
      />
    </div>
  );
}

export function HomeHero({
  me,
  student,
}: {
  me: PortalMe;
  student: PortalStudent;
}) {
  const [now] = useState(() => new Date());
  const greeting = greetingFor(lagosHourOf(now));
  const name = `${student.firstName} ${student.lastName}`;
  return (
    <section
      aria-label="Home"
      className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-6"
    >
      <div className="flex items-center gap-4">
        <UserAvatar name={name} className="size-16 text-xl" />
        <div className="flex min-w-0 flex-col">
          <p className="text-sm text-muted-foreground">
            {me.kind === 'guardian'
              ? `${greeting}, ${me.firstName} · viewing`
              : `${greeting}, ${student.firstName}`}
          </p>
          <h1 className="truncate">{name}</h1>
          <p className="text-sm text-muted-foreground">{classLine(student)}</p>
        </div>
      </div>
      <TermFacts />
    </section>
  );
}
