import { useQuery } from '@tanstack/react-query';
import { BellIcon } from 'lucide-react';
import { PORTAL_ANNOUNCEMENTS_MAX } from '@eduvault/api-contract';
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
  ErrorMessage,
  Skeleton,
} from '@eduvault/ui';
import { useApi } from '../api';
import { portalAnnouncementsQueryOptions } from '../queries';
import { AnnouncementList } from './announcement-list';

export function AnnouncementsCard({
  studentId,
  today,
  onSeeAll,
}: {
  studentId: string;
  today: string;
  onSeeAll: () => void;
}) {
  const news = useQuery(portalAnnouncementsQueryOptions(useApi(), studentId));
  const hasMore =
    news.data !== undefined &&
    news.data.items.length >= PORTAL_ANNOUNCEMENTS_MAX;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellIcon aria-hidden="true" />
          Announcements
        </CardTitle>
        {hasMore ? (
          <CardAction>
            <Button type="button" variant="link" size="sm" onClick={onSeeAll}>
              See all
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        {news.isPending ? (
          <Skeleton role="status" aria-label="Loading" className="h-24" />
        ) : null}
        {news.data === undefined ? (
          <ErrorMessage error={news.error} />
        ) : (
          <AnnouncementList
            key={studentId}
            items={news.data.items}
            today={today}
          />
        )}
      </CardContent>
    </Card>
  );
}
