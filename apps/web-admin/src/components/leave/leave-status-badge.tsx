import { CheckIcon, ClockIcon, type LucideIcon } from 'lucide-react';
import {
  leaveStatusLabel,
  type LeaveOutcome,
  type LeaveStatus,
} from '@eduvault/shared';
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

export function LeaveStatusBadge({ leave }: { leave: LeaveOutcome }) {
  const Icon = ICON[leave.status];
  return (
    <Badge variant={VARIANT[leave.status]}>
      {Icon === undefined ? null : <Icon />}
      {leaveStatusLabel(leave)}
    </Badge>
  );
}
