import { CheckIcon, ClockIcon, type LucideIcon } from 'lucide-react';
import { LEAVE_STATUS_LABELS, type LeaveStatus } from '@eduvault/shared';
import { Badge } from '@eduvault/ui';

type Variant = 'secondary' | 'success' | 'destructive' | 'outline';

const VARIANT: Record<LeaveStatus, Variant> = {
  submitted: 'secondary',
  approved: 'success',
  rejected: 'destructive',
  cancelled: 'outline',
};

const ICON: Partial<Record<LeaveStatus, LucideIcon>> = {
  submitted: ClockIcon,
  approved: CheckIcon,
};

export function LeaveStatusBadge({ status }: { status: LeaveStatus }) {
  const Icon = ICON[status];
  return (
    <Badge variant={VARIANT[status]}>
      {Icon === undefined ? null : <Icon />}
      {LEAVE_STATUS_LABELS[status]}
    </Badge>
  );
}
