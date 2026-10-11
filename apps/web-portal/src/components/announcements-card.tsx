import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BellIcon, ChevronDownIcon } from 'lucide-react';
import {
  isNewAnnouncement,
  type AnnouncementSummary,
} from '@eduvault/api-contract';
import { fmtDate, toggled } from '@eduvault/shared';
import {
  AnnouncementTagBadge,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ErrorMessage,
  Skeleton,
  cn,
} from '@eduvault/ui';
import { useApi } from '../api';
import { portalAnnouncementsQueryOptions } from '../queries';

function AnnouncementItem({
  item,
  today,
  open,
  onToggle,
}: {
  item: AnnouncementSummary;
  today: string;
  open: boolean;
  onToggle: () => void;
}) {
  const fresh = !item.pinned && isNewAnnouncement(item.publishedOn, today);
  return (
    <li className="flex flex-col gap-1">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex items-start gap-3 rounded-md text-left focus-visible:ring-2 focus-visible:ring-ring"
      >
        <BellIcon
          className={cn(
            'mt-0.5 size-4 shrink-0',
            item.pinned ? 'text-warning' : 'text-muted-foreground'
          )}
          aria-hidden="true"
        />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-medium">{item.title}</span>
          <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {fmtDate(item.publishedOn)}
            <AnnouncementTagBadge tag={item.tag} />
            {item.pinned ? <Badge variant="warning">Pinned</Badge> : null}
            {fresh ? <Badge variant="success">New</Badge> : null}
          </span>
        </span>
        <ChevronDownIcon
          className={cn('mt-1 size-4 shrink-0', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <p className="pl-7 text-sm whitespace-pre-line">{item.body}</p>
      ) : null}
    </li>
  );
}

function AnnouncementList({
  items,
  today,
}: {
  items: readonly AnnouncementSummary[];
  today: string;
}) {
  const [open, setOpen] = useState<string[]>(() =>
    items.filter((item) => item.pinned).map((item) => item.id)
  );
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No news from the school yet.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-4">
      {items.map((item) => (
        <AnnouncementItem
          key={item.id}
          item={item}
          today={today}
          open={open.includes(item.id)}
          onToggle={() => {
            setOpen((held) => toggled(held, item.id, !held.includes(item.id)));
          }}
        />
      ))}
    </ul>
  );
}

export function AnnouncementsCard({
  studentId,
  today,
}: {
  studentId: string;
  today: string;
}) {
  const news = useQuery(portalAnnouncementsQueryOptions(useApi(), studentId));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellIcon aria-hidden="true" />
          Announcements
        </CardTitle>
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
