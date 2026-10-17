import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCan, useCanAny, usePermissions } from '@eduvault/auth-client';
import { FINANCE_READ_GATE, MEMBER_ROLE } from '@eduvault/policy';
import { lagosDateOf } from '@eduvault/shared';
import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  ErrorMessage,
} from '@eduvault/ui';
import { useApi } from '../api';
import { AnnouncementsCard } from '../components/dashboard/announcements-card';
import { ActivityCard } from '../components/dashboard/activity-card';
import { CardSkeleton } from '../components/dashboard/card-states';
import { DashboardHeader } from '../components/dashboard/dashboard-header';
import { selectDashboardView } from '../components/dashboard/dashboard-view';
import { MyClassesCard } from '../components/dashboard/my-classes-card';
import { ChargedStat } from '../components/dashboard/charged-stat';
import { OwedStat } from '../components/dashboard/owed-stat';
import { ReceivedStat } from '../components/dashboard/received-stat';
import { RollCard, StudentsStat } from '../components/dashboard/roll-card';
import { SchoolAccountCard } from '../components/dashboard/school-account-card';
import { StoreCard } from '../components/dashboard/store-card';
import {
  MyClassesStat,
  MyStudentsStat,
  NextHolidayStat,
  ThisTermStat,
} from '../components/dashboard/teacher-stats';
import { TasksCard } from '../components/dashboard/tasks-card';
import { TermCard } from '../components/dashboard/term-card';
import { UpcomingHolidaysCard } from '../components/dashboard/upcoming-holidays-card';
import { NoCurrentTermCallout } from '../components/no-current-term-callout';
import { useMyAccess } from '../components/my-access';
import { currentTermQueryOptions } from '../queries';

function useToday(): string {
  const [today] = useState(() => lagosDateOf(new Date()));
  return today;
}

type TermState = 'loading' | 'missing' | 'ready';

function useTermState(): TermState {
  const current = useQuery(currentTermQueryOptions(useApi()));
  if (current.isPending) {
    return 'loading';
  }
  return current.data?.term === null ? 'missing' : 'ready';
}

function NoAccessDashboard({ hasRole }: { hasRole: boolean }) {
  const { openMyAccess } = useMyAccess();
  return (
    <section className="flex flex-col gap-4">
      <DashboardHeader welcome />
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

function TermSlot({ today }: { today: string }) {
  const current = useQuery(currentTermQueryOptions(useApi()));
  if (current.isPending) {
    return <CardSkeleton rows={4} />;
  }
  if (current.data === undefined) {
    return <ErrorMessage error={current.error} />;
  }
  return <TermCard current={current.data} today={today} />;
}

function StaffStats() {
  const canReadStudents = useCan('student', 'read');
  const canReadCharges = useCan('invoice', 'read');
  const canReadPayments = useCan('payment', 'read');
  const canReadOwed = useCanAny(FINANCE_READ_GATE);
  if (!canReadStudents && !canReadOwed) {
    return null;
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {canReadStudents ? <StudentsStat /> : null}
      {canReadCharges ? <ChargedStat /> : null}
      {canReadPayments ? <ReceivedStat /> : null}
      {canReadOwed ? <OwedStat /> : null}
    </div>
  );
}

function StaffDashboard() {
  const today = useToday();
  const term = useTermState();
  const canReadStudents = useCan('student', 'read');
  const canReadMoney = useCan('moneyAccount', 'read');
  const canReadStore = useCan('store', 'read');
  return (
    <section className="flex flex-col gap-4">
      <DashboardHeader />
      {term === 'missing' ? <NoCurrentTermCallout /> : null}
      {term === 'ready' ? <StaffStats /> : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <TasksCard />
          {term === 'ready' && canReadStudents ? <RollCard /> : null}
        </div>
        <div className="flex flex-col gap-4">
          {canReadMoney ? <SchoolAccountCard /> : null}
          {canReadStore ? <StoreCard /> : null}
          {term === 'missing' ? null : <TermSlot today={today} />}
        </div>
      </div>
      <ActivityCard />
    </section>
  );
}

function TeacherDashboard() {
  const today = useToday();
  const term = useTermState();
  const canReadClasses = useCan('class', 'read');
  return (
    <section className="flex flex-col gap-4">
      <DashboardHeader />
      {term === 'missing' ? <NoCurrentTermCallout /> : null}
      {term === 'ready' ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MyStudentsStat />
          <MyClassesStat />
          <ThisTermStat />
          <NextHolidayStat today={today} />
        </div>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          {canReadClasses ? <MyClassesCard /> : null}
          {term === 'ready' ? <UpcomingHolidaysCard today={today} /> : null}
        </div>
        <div className="flex flex-col gap-4">
          <TasksCard variant="teacher" />
          <AnnouncementsCard />
        </div>
      </div>
      <ActivityCard />
    </section>
  );
}

export function DashboardPage() {
  const { permissions, classScope, roles } = usePermissions();
  const view = selectDashboardView(permissions, classScope);
  if (view === 'none') {
    return (
      <NoAccessDashboard hasRole={roles.some((role) => role !== MEMBER_ROLE)} />
    );
  }
  return view === 'teacher' ? <TeacherDashboard /> : <StaffDashboard />;
}
