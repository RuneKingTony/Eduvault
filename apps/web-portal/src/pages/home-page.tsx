import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ApiError,
  type PortalChild,
  type PortalMe,
} from '@eduvault/api-contract';
import { lagosDateOf } from '@eduvault/shared';
import { ErrorMessage, PageSkeleton } from '@eduvault/ui';
import { useApi } from '../api';
import { AnnouncementsCard } from '../components/announcements-card';
import { HolidaysCard } from '../components/holidays-card';
import { HomeHero } from '../components/home-hero';
import { HomeTiles } from '../components/home-tiles';
import { NoChildren } from '../components/no-children';
import { ProfileCard } from '../components/profile-card';
import { portalStudentQueryOptions } from '../queries';
import { selectChild } from '../selected-child';

interface ChildHomeProps {
  me: PortalMe;
  selected: PortalChild;
  onChildMissing: (firstChildId: string) => void;
  onSeeAllAnnouncements: (childId: string) => void;
  onSeeFees: (childId: string) => void;
}

function ChildHome({
  me,
  selected,
  onChildMissing,
  onSeeAllAnnouncements,
  onSeeFees,
}: ChildHomeProps) {
  const student = useQuery(portalStudentQueryOptions(useApi(), selected.id));
  const [today] = useState(() => lagosDateOf(new Date()));
  const firstId = me.children[0]?.id;
  const missing =
    student.error instanceof ApiError &&
    student.error.status === 404 &&
    firstId !== undefined &&
    firstId !== selected.id;
  useEffect(() => {
    if (missing) {
      onChildMissing(firstId);
    }
  }, [missing, firstId, onChildMissing]);

  if (student.data === undefined) {
    return student.isPending || missing ? (
      <PageSkeleton rows={3} />
    ) : (
      <ErrorMessage error={student.error} />
    );
  }
  return (
    <>
      <HomeHero me={me} student={student.data} />
      <HomeTiles
        student={student.data}
        currency={me.school.currency}
        today={today}
        onSeeFees={onSeeFees}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <AnnouncementsCard
          studentId={selected.id}
          today={today}
          onSeeAll={() => {
            onSeeAllAnnouncements(selected.id);
          }}
        />
        <div className="flex flex-col gap-4">
          <HolidaysCard today={today} />
          <ProfileCard me={me} student={student.data} />
        </div>
      </div>
    </>
  );
}

export function HomePage({
  me,
  childId,
  onChildMissing,
  onSeeAllAnnouncements,
  onSeeFees,
}: {
  me: PortalMe;
  childId: string | undefined;
  onChildMissing: (firstChildId: string) => void;
  onSeeAllAnnouncements: (childId: string) => void;
  onSeeFees: (childId: string) => void;
}) {
  const selected = selectChild(me.children, childId);
  if (selected === undefined) {
    return <NoChildren />;
  }
  return (
    <ChildHome
      key={selected.id}
      me={me}
      selected={selected}
      onChildMissing={onChildMissing}
      onSeeAllAnnouncements={onSeeAllAnnouncements}
      onSeeFees={onSeeFees}
    />
  );
}
