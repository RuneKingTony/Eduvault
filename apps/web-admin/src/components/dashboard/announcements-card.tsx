import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { BellIcon } from 'lucide-react';
import {
  ANNOUNCEMENT_FEED_DEFAULT,
  type AnnouncementSummary,
} from '@eduvault/api-contract';
import { useCan } from '@eduvault/auth-client';
import { fmtDate } from '@eduvault/shared';
import {
  ANNOUNCEMENT_TAGS,
  Button,
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
  ErrorMessage,
} from '@eduvault/ui';
import { useApi } from '../../api';
import { announcementFeedQueryOptions } from '../../queries';
import { CardSkeleton } from './card-states';

function AnnouncementItem({ item }: { item: AnnouncementSummary }) {
  const tone = item.pinned ? 'text-warning' : 'text-muted-foreground';
  return (
    <li className="flex items-start gap-3">
      <BellIcon
        className={`mt-0.5 size-4 shrink-0 ${tone}`}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="font-medium">{item.title}</p>
        <p className="text-sm text-muted-foreground">
          {`${fmtDate(item.publishedOn)} · ${ANNOUNCEMENT_TAGS[item.tag].label}`}
          {item.pinned ? ' · Pinned' : ''}
        </p>
      </div>
    </li>
  );
}

export function AnnouncementsCard() {
  const feed = useQuery(
    announcementFeedQueryOptions(useApi(), ANNOUNCEMENT_FEED_DEFAULT)
  );
  const canSeeAll = useCan('announcement', 'read');
  if (feed.isPending) {
    return <CardSkeleton rows={3} />;
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellIcon aria-hidden="true" />
          Announcements
        </CardTitle>
        {canSeeAll ? (
          <CardAction>
            <Button asChild variant="outline" size="sm">
              <Link to="/announcements">All</Link>
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        {feed.data === undefined ? <ErrorMessage error={feed.error} /> : null}
        {feed.data?.length === 0 ? (
          <p className="text-sm text-muted-foreground">No announcements</p>
        ) : null}
        {feed.data === undefined || feed.data.length === 0 ? null : (
          <ul className="flex flex-col gap-3">
            {feed.data.map((item) => (
              <AnnouncementItem key={item.id} item={item} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
