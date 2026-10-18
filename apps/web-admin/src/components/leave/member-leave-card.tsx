import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDaysIcon } from 'lucide-react';
import type { LeaveDto } from '@eduvault/api-contract';
import { useCan, usePermissions } from '@eduvault/auth-client';
import {
  LEAVE_TYPE_LABELS,
  leaveCancelBlock,
  leaveDaysText,
  fmtDateRange,
} from '@eduvault/shared';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@eduvault/ui';
import { useApi } from '../../api';
import { memberLeaveQueryOptions } from '../../queries';
import { useToday } from '../calendar/use-today';
import { QueryState } from '../money/query-state';
import { CancelLeaveDialog } from './cancel-leave-dialog';
import { LeaveStatusBadge } from './leave-status-badge';

function Row({
  leave,
  onCancel,
}: {
  leave: LeaveDto;
  onCancel: ((leave: LeaveDto) => void) | null;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
      <span className="flex flex-col">
        <span className="font-medium">{LEAVE_TYPE_LABELS[leave.type]}</span>
        <span className="text-muted-foreground">
          {fmtDateRange(leave.startsOn, leave.endsOn)} ·{' '}
          {leaveDaysText(leave.days)}
        </span>
      </span>
      <span className="flex items-center gap-2">
        <LeaveStatusBadge leave={leave} />
        {onCancel === null ? null : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onCancel(leave);
            }}
          >
            Cancel leave
          </Button>
        )}
      </span>
    </li>
  );
}

function MemberLeaveList({
  items,
  canCancel,
}: {
  items: readonly LeaveDto[];
  canCancel: (leave: LeaveDto) => boolean;
}) {
  const [cancelling, setCancelling] = useState<LeaveDto | null>(null);
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No leave requests yet.</p>
    );
  }
  return (
    <>
      <ul className="flex flex-col divide-y">
        {items.map((leave) => (
          <Row
            key={leave.id}
            leave={leave}
            onCancel={canCancel(leave) ? setCancelling : null}
          />
        ))}
      </ul>
      <CancelLeaveDialog
        leave={cancelling}
        onClose={() => {
          setCancelling(null);
        }}
      />
    </>
  );
}

export function MemberLeaveCard({ userId }: { userId: string }) {
  const canSee = useCan('leave', 'approve');
  const { acting } = usePermissions();
  const today = useToday();
  const query = useQuery({
    ...memberLeaveQueryOptions(useApi(), userId),
    enabled: canSee,
  });
  if (!canSee) {
    return null;
  }
  const readOnly = acting !== null && !acting.writes;
  const canCancel = (leave: LeaveDto) =>
    !readOnly && !leave.isOwn && leaveCancelBlock(leave, today) === null;
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
          {(items) => <MemberLeaveList items={items} canCancel={canCancel} />}
        </QueryState>
      </CardContent>
    </Card>
  );
}
