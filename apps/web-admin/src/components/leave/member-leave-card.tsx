import { useQuery } from '@tanstack/react-query';
import { CalendarDaysIcon } from 'lucide-react';
import type { LeaveDto } from '@eduvault/api-contract';
import { useCan } from '@eduvault/auth-client';
import {
  LEAVE_TYPE_LABELS,
  leaveDaysText,
  fmtDateRange,
} from '@eduvault/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@eduvault/ui';
import { useApi } from '../../api';
import { memberLeaveQueryOptions } from '../../queries';
import { QueryState } from '../money/query-state';
import { LeaveStatusBadge } from './leave-status-badge';

function Row({ leave }: { leave: LeaveDto }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
      <span className="flex flex-col">
        <span className="font-medium">{LEAVE_TYPE_LABELS[leave.type]}</span>
        <span className="text-muted-foreground">
          {fmtDateRange(leave.startsOn, leave.endsOn)} ·{' '}
          {leaveDaysText(leave.days)}
        </span>
      </span>
      <LeaveStatusBadge status={leave.status} />
    </li>
  );
}

function MemberLeaveList({ items }: { items: readonly LeaveDto[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No leave requests yet.</p>
    );
  }
  return (
    <ul className="flex flex-col divide-y">
      {items.map((leave) => (
        <Row key={leave.id} leave={leave} />
      ))}
    </ul>
  );
}

export function MemberLeaveCard({ userId }: { userId: string }) {
  const canSee = useCan('leave', 'approve');
  const query = useQuery({
    ...memberLeaveQueryOptions(useApi(), userId),
    enabled: canSee,
  });
  if (!canSee) {
    return null;
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDaysIcon className="size-4" />
          Leave
        </CardTitle>
      </CardHeader>
      <CardContent>
        <QueryState query={query} skeletonClassName="h-16">
          {(items) => <MemberLeaveList items={items} />}
        </QueryState>
      </CardContent>
    </Card>
  );
}
