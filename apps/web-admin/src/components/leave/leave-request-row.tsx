import { CalendarDaysIcon } from 'lucide-react';
import type { LeaveDto } from '@eduvault/api-contract';
import {
  LEAVE_TYPE_LABELS,
  fmtTimestamp,
  fmtDateRange,
  leaveSchoolDaysText,
  type LeaveStatus,
} from '@eduvault/shared';
import { Button, cn } from '@eduvault/ui';
import { LeaveStatusBadge } from './leave-status-badge';

const TINT: Record<LeaveStatus, string> = {
  submitted: 'text-muted-foreground',
  approved: 'text-success',
  rejected: 'text-destructive',
  cancelled: 'text-muted-foreground',
};

function Decision({ leave }: { leave: LeaveDto }) {
  if (leave.status === 'approved') {
    return (
      <p className="text-sm text-muted-foreground">
        Approved by {leave.deciderName} on {fmtTimestamp(leave.approvedAt)}
      </p>
    );
  }
  if (leave.status === 'rejected') {
    return (
      <p className="text-sm text-destructive">
        Declined by {leave.deciderName}: {leave.rejectionReason}
      </p>
    );
  }
  return null;
}

export function LeaveRequestRow({
  leave,
  canWithdraw,
  onWithdraw,
}: {
  leave: LeaveDto;
  canWithdraw: boolean;
  onWithdraw: (leave: LeaveDto) => void;
}) {
  return (
    <li className="flex items-start gap-3 py-3">
      <CalendarDaysIcon
        className={cn('mt-0.5 size-4 shrink-0', TINT[leave.status])}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{LEAVE_TYPE_LABELS[leave.type]}</span>
          <LeaveStatusBadge status={leave.status} />
        </span>
        <p className="text-sm">
          {fmtDateRange(leave.startsOn, leave.endsOn)} ·{' '}
          {leaveSchoolDaysText(leave.days)}
        </p>
        <p className="text-sm text-muted-foreground">{leave.reason}</p>
        <Decision leave={leave} />
      </div>
      {leave.status === 'submitted' && canWithdraw ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            onWithdraw(leave);
          }}
        >
          Withdraw
        </Button>
      ) : null}
    </li>
  );
}
