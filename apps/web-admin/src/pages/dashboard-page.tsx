import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { CalendarCurrent } from '@eduvault/api-contract';
import { useAuthClient, useCan, usePermissions } from '@eduvault/auth-client';
import { MEMBER_ROLE } from '@eduvault/policy';
import { fmtDateRange } from '@eduvault/shared';
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  ErrorMessage,
  PageSkeleton,
} from '@eduvault/ui';
import { useApi } from '../api';
import { NoCurrentTermCallout } from '../components/no-current-term-callout';
import { useMyAccess } from '../components/my-access';
import { currentTermQueryOptions } from '../queries';
import { useSchool } from '../use-school';

function NoAccessDashboard({ hasRole }: { hasRole: boolean }) {
  const { schoolName, user } = useSchool(useAuthClient());
  const { openMyAccess } = useMyAccess();
  const [firstName = user.name] = user.name.split(' ');
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1>Welcome, {firstName}</h1>
        <p className="text-muted-foreground">{schoolName}</p>
      </div>
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>No access yet</EmptyTitle>
          <EmptyDescription>
            {hasRole
              ? 'Your role doesn’t give you anything to see yet. This page fills in once the owner changes it.'
              : 'You’re on the staff list, but you can’t see anything until the owner gives you a role. This page fills in once they do.'}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button type="button" variant="outline" onClick={openMyAccess}>
            See my access
          </Button>
        </EmptyContent>
      </Empty>
    </section>
  );
}

function TermCard({ current }: { current: CalendarCurrent }) {
  const canSeeCalendar = useCan('session', 'read');
  const { term, schoolYear } = current;
  if (term === null || schoolYear === null) {
    return null;
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {term.name} · {schoolYear.name}
        </CardTitle>
        <CardDescription>
          {fmtDateRange(term.startsOn, term.endsOn)}
        </CardDescription>
        {canSeeCalendar ? (
          <CardAction>
            <Button asChild variant="outline" size="sm">
              <Link to="/calendar">Calendar</Link>
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        {current.schoolDaysSoFar} of {current.schoolDays} school days
      </CardContent>
    </Card>
  );
}

function CurrentTerm() {
  const current = useQuery(currentTermQueryOptions(useApi()));
  if (current.isPending) {
    return <PageSkeleton rows={1} />;
  }
  if (current.data === undefined) {
    return <ErrorMessage error={current.error} />;
  }
  return current.data.term === null ? (
    <NoCurrentTermCallout />
  ) : (
    <TermCard current={current.data} />
  );
}

export function DashboardPage() {
  const { permissions, roles } = usePermissions();
  if (Object.keys(permissions).length === 0) {
    return (
      <NoAccessDashboard hasRole={roles.some((role) => role !== MEMBER_ROLE)} />
    );
  }
  return (
    <section className="flex flex-col gap-4">
      <h1>Dashboard</h1>
      <CurrentTerm />
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>Nothing here yet</EmptyTitle>
          <EmptyDescription>
            Your school at a glance will show up here as the other pages come
            online.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </section>
  );
}
