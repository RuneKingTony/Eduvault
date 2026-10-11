import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BellIcon, ChevronLeftIcon } from 'lucide-react';
import type { PortalChild, PortalMe } from '@eduvault/api-contract';
import { lagosDateOf } from '@eduvault/shared';
import {
  Button,
  Card,
  CardContent,
  ErrorMessage,
  NumberedPager,
  PageSkeleton,
} from '@eduvault/ui';
import { useApi } from '../api';
import { AnnouncementList } from '../components/announcement-list';
import { NoChildren } from '../components/no-children';
import {
  ANNOUNCEMENTS_PAGE_SIZE,
  portalAnnouncementListQueryOptions,
} from '../queries';
import { selectChild } from '../selected-child';

function ChildAnnouncements({
  child,
  onBack,
}: {
  child: PortalChild;
  onBack: (childId: string) => void;
}) {
  const [page, setPage] = useState(1);
  const [today] = useState(() => lagosDateOf(new Date()));
  const news = useQuery(
    portalAnnouncementListQueryOptions(useApi(), child.id, page)
  );
  if (news.data === undefined) {
    return news.isPending ? (
      <PageSkeleton rows={4} />
    ) : (
      <ErrorMessage error={news.error} />
    );
  }
  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => {
            onBack(child.id);
          }}
        >
          <ChevronLeftIcon aria-hidden="true" />
          Back to Home
        </Button>
        <h1 className="flex items-center gap-2">
          <BellIcon aria-hidden="true" />
          Announcements
        </h1>
        <p className="text-muted-foreground">
          From the school office for {child.firstName}. Tap one to read more.
        </p>
      </header>
      <Card>
        <CardContent>
          <AnnouncementList key={page} items={news.data.items} today={today} />
        </CardContent>
      </Card>
      {news.data.total > ANNOUNCEMENTS_PAGE_SIZE ? (
        <NumberedPager
          page={page}
          total={news.data.total}
          pageSize={ANNOUNCEMENTS_PAGE_SIZE}
          onPage={setPage}
        />
      ) : null}
    </section>
  );
}

export function AnnouncementsPage({
  me,
  childId,
  onBack,
}: {
  me: PortalMe;
  childId: string | undefined;
  onBack: (childId: string) => void;
}) {
  const selected = selectChild(me.children, childId);
  if (selected === undefined) {
    return <NoChildren />;
  }
  return (
    <ChildAnnouncements key={selected.id} child={selected} onBack={onBack} />
  );
}
