import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthClient } from '@eduvault/auth-client';
import { greetingFor, lagosHourOf } from '@eduvault/shared';
import { useApi } from '../../api';
import { currentTermQueryOptions } from '../../queries';
import { useSchool } from '../../use-school';

export function DashboardHeader({ welcome = false }: { welcome?: boolean }) {
  const { schoolName, user } = useSchool(useAuthClient());
  const current = useQuery(currentTermQueryOptions(useApi()));
  const [now] = useState(() => new Date());
  const [firstName = user.name] = user.name.split(' ');
  const greeting = welcome ? 'Welcome' : greetingFor(lagosHourOf(now));
  const term = current.data?.term;
  const year = current.data?.schoolYear;
  const where =
    term === null || term === undefined || year === null || year === undefined
      ? schoolName
      : `${schoolName} · ${term.name}, ${year.name}`;
  return (
    <div>
      <h1>
        {greeting}, {firstName}
      </h1>
      <p className="text-muted-foreground">{where}</p>
    </div>
  );
}
