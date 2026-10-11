import { useQuery } from '@tanstack/react-query';
import { ErrorMessage, Progress } from '@eduvault/ui';
import {
  countOf,
  daysUntilLabel,
  fmtDate,
  termPercentDone,
  termWeek,
  termWeeks,
} from '@eduvault/shared';
import { useApi } from '../../api';
import {
  currentTermQueryOptions,
  daysOffQueryOptions,
  myClassesQueryOptions,
} from '../../queries';
import { StatCard, StatSkeleton } from './dashboard-stat';
import { DAYS_OFF_LIMIT } from './days-off-list';

export function MyStudentsStat() {
  const classes = useQuery(myClassesQueryOptions(useApi()));
  if (classes.isPending) {
    return <StatSkeleton />;
  }
  if (classes.data === undefined) {
    return <ErrorMessage error={classes.error} />;
  }
  const total = classes.data.reduce((sum, row) => sum + row.studentCount, 0);
  return (
    <StatCard
      label="My students"
      value={total}
      sub={`Across ${countOf(classes.data.length, 'class', 'classes')}`}
      to="/students"
    />
  );
}

export function MyClassesStat() {
  const classes = useQuery(myClassesQueryOptions(useApi()));
  if (classes.isPending) {
    return <StatSkeleton />;
  }
  if (classes.data === undefined) {
    return <ErrorMessage error={classes.error} />;
  }
  const leading = classes.data.filter((row) => row.isClassTeacher).length;
  return (
    <StatCard
      label="My classes"
      value={classes.data.length}
      sub={`${leading} as class teacher`}
      to="/classes"
    />
  );
}

export function ThisTermStat() {
  const current = useQuery(currentTermQueryOptions(useApi()));
  if (current.isPending) {
    return <StatSkeleton />;
  }
  if (current.data === undefined) {
    return <ErrorMessage error={current.error} />;
  }
  const { term, schoolDays, schoolDaysSoFar } = current.data;
  if (term === null) {
    return null;
  }
  const percent = termPercentDone(schoolDaysSoFar, schoolDays);
  return (
    <StatCard
      label="This term"
      value={`Week ${termWeek(schoolDaysSoFar)}`}
      sub={`of ${termWeeks(schoolDays)} · ends ${fmtDate(term.endsOn)}`}
    >
      <Progress value={percent} aria-label="School days done" />
    </StatCard>
  );
}

export function NextHolidayStat({ today }: { today: string }) {
  const daysOff = useQuery(daysOffQueryOptions(useApi(), DAYS_OFF_LIMIT));
  if (daysOff.isPending) {
    return <StatSkeleton />;
  }
  if (daysOff.data === undefined) {
    return <ErrorMessage error={daysOff.error} />;
  }
  const [next] = daysOff.data;
  return (
    <StatCard
      label="Next holiday"
      value={next === undefined ? '—' : daysUntilLabel(today, next.start)}
      sub={
        next === undefined
          ? 'None this term'
          : `${next.name} · ${fmtDate(next.start)}`
      }
    />
  );
}
