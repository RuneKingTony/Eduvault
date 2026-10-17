import { useQuery } from '@tanstack/react-query';
import type { PortalStudent } from '@eduvault/api-contract';
import { useCan } from '@eduvault/auth-client';
import { ErrorMessage, Skeleton, cn } from '@eduvault/ui';
import {
  balanceTone,
  daysUntilLabel,
  feesTile,
  fmtDate,
} from '@eduvault/shared';
import { useApi } from '../api';
import { StatTile } from './stat-tile';
import {
  daysOffQueryOptions,
  portalAnnouncementsQueryOptions,
  portalChildrenQueryOptions,
} from '../queries';

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
    <StatTile
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
    <StatTile
      label="Announcements"
      value={news.data.newThisWeek}
      sub="New this week"
    />
  );
}

function FeesTile({
  studentId,
  currency,
  onOpen,
}: {
  studentId: string;
  currency: string;
  onOpen: (studentId: string) => void;
}) {
  const children = useQuery(portalChildrenQueryOptions(useApi()));
  if (children.isPending) {
    return <TileSkeleton />;
  }
  if (children.data === undefined) {
    return <ErrorMessage error={children.error} />;
  }
  const balance =
    children.data.find((child) => child.id === studentId)?.balanceMinor ?? 0;
  const tile = feesTile(balance, currency);
  return (
    <button
      type="button"
      className="rounded-xl text-left focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() => {
        onOpen(studentId);
      }}
    >
      <StatTile
        label="Fees"
        value={tile.value}
        sub={tile.sub}
        tone={balanceTone(balance)}
      />
    </button>
  );
}

export function HomeTiles({
  student,
  currency,
  today,
  onSeeFees,
}: {
  student: PortalStudent;
  currency: string;
  today: string;
  onSeeFees: (studentId: string) => void;
}) {
  const canSeeFees = useCan('invoice', 'readOwn');
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-4',
        canSeeFees ? 'lg:grid-cols-4' : 'lg:grid-cols-3'
      )}
    >
      <NextHolidayTile today={today} />
      <AnnouncementsTile studentId={student.id} />
      <StatTile
        label="Class teacher"
        value={student.classTeacherName ?? '—'}
        sub={student.className ?? '—'}
      />
      {canSeeFees ? (
        <FeesTile
          studentId={student.id}
          currency={currency}
          onOpen={onSeeFees}
        />
      ) : null}
    </div>
  );
}
