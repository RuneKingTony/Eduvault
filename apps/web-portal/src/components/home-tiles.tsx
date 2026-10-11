import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { PortalStudent } from '@eduvault/api-contract';
import { Card, CardContent, ErrorMessage, Skeleton } from '@eduvault/ui';
import { daysUntilLabel, fmtDate } from '@eduvault/shared';
import { useApi } from '../api';
import {
  daysOffQueryOptions,
  portalAnnouncementsQueryOptions,
} from '../queries';

function Tile({
  label,
  value,
  sub,
}: {
  label: string;
  value: ReactNode;
  sub: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-2xl font-semibold">{value}</span>
        <span className="truncate text-sm text-muted-foreground">{sub}</span>
      </CardContent>
    </Card>
  );
}

const TileSkeleton = () => (
  <Skeleton role="status" aria-label="Loading" className="h-24" />
);

function NextHolidayTile({ today }: { today: string }) {
  const daysOff = useQuery(daysOffQueryOptions(useApi()));
  if (daysOff.isPending) {
    return <TileSkeleton />;
  }
  if (daysOff.data === undefined) {
    return <ErrorMessage error={daysOff.error} />;
  }
  const [next] = daysOff.data;
  return (
    <Tile
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

function AnnouncementsTile({ studentId }: { studentId: string }) {
  const news = useQuery(portalAnnouncementsQueryOptions(useApi(), studentId));
  if (news.isPending) {
    return <TileSkeleton />;
  }
  if (news.data === undefined) {
    return <ErrorMessage error={news.error} />;
  }
  return (
    <Tile
      label="Announcements"
      value={news.data.newThisWeek}
      sub="New this week"
    />
  );
}

export function HomeTiles({
  student,
  today,
}: {
  student: PortalStudent;
  today: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
      <NextHolidayTile today={today} />
      <AnnouncementsTile studentId={student.id} />
      <Tile
        label="Class teacher"
        value={student.classTeacherName ?? '—'}
        sub={student.className ?? '—'}
      />
    </div>
  );
}
