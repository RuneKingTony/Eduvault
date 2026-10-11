import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BanknoteIcon,
  ChevronDownIcon,
  GraduationCapIcon,
  HistoryIcon,
  KeyRoundIcon,
  ServerIcon,
  type LucideIcon,
} from 'lucide-react';
import { ACTIVITY_PAGE_SIZE, type ActivityItem } from '@eduvault/api-contract';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ErrorMessage,
  NumberedPager,
} from '@eduvault/ui';
import { fmtLagosDateTime } from '@eduvault/shared';
import { useApi } from '../../api';
import { activityQueryOptions } from '../../queries';
import { CardSkeleton } from './card-states';

const PILLARS: Record<
  ActivityItem['pillar'],
  { label: string; icon: LucideIcon }
> = {
  foundation: { label: 'Foundation', icon: GraduationCapIcon },
  finance: { label: 'Finance', icon: BanknoteIcon },
  access: { label: 'Access', icon: KeyRoundIcon },
  platform: { label: 'Platform', icon: ServerIcon },
};

function ActivityRow({ item }: { item: ActivityItem }) {
  const { label, icon: Icon } = PILLARS[item.pillar];
  return (
    <li className="flex items-start gap-3 p-2">
      <span className="w-32 shrink-0 text-sm text-muted-foreground">
        {fmtLagosDateTime(item.occurredAt)}
      </span>
      <Badge variant="outline">
        <Icon aria-hidden="true" />
        {label}
      </Badge>
      <span className="min-w-0 flex-1">{item.text}</span>
    </li>
  );
}

export function ActivityCard() {
  const [page, setPage] = useState(1);
  const activity = useQuery(activityQueryOptions(useApi(), page));
  if (activity.isPending) {
    return <CardSkeleton rows={1} />;
  }
  if (activity.data === undefined) {
    return <ErrorMessage error={activity.error} />;
  }
  const { items, total } = activity.data;
  return (
    <Card>
      <Collapsible defaultOpen={false}>
        <CardHeader>
          <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 text-left">
            <CardTitle className="flex items-center gap-2">
              <HistoryIcon aria-hidden="true" />
              Recent activity
              <Badge variant="secondary">{total}</Badge>
            </CardTitle>
            <ChevronDownIcon aria-hidden="true" className="size-4" />
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent>
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity yet</p>
            ) : (
              <ul className="flex flex-col">
                {items.map((item) => (
                  <ActivityRow key={item.id} item={item} />
                ))}
              </ul>
            )}
            {total > ACTIVITY_PAGE_SIZE ? (
              <NumberedPager
                page={page}
                total={total}
                pageSize={ACTIVITY_PAGE_SIZE}
                onPage={setPage}
              />
            ) : null}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
