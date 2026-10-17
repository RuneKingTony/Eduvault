import { Link } from '@tanstack/react-router';
import type { ApprovalStatus } from '@eduvault/api-contract';
import { Badge, Tooltip, TooltipContent, TooltipTrigger } from '@eduvault/ui';
import { PersonAvatar } from '../person-avatar';
import { STATUS_LABELS, STATUS_VARIANTS, approvedTip } from './adjustment-text';

export function StatusCell({
  status,
  approvedBy,
  label,
}: {
  status: ApprovalStatus;
  approvedBy: string | null;
  label?: string;
}) {
  const badge = (
    <Badge variant={STATUS_VARIANTS[status]}>
      {label ?? STATUS_LABELS[status]}
    </Badge>
  );
  const tip = status === 'approved' ? approvedTip(approvedBy) : undefined;
  return tip === undefined ? (
    badge
  ) : (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );
}

export function SeeInApprovals() {
  return (
    <Link
      to="/approvals"
      className="text-sm underline-offset-4 hover:underline"
    >
      See in Approvals
    </Link>
  );
}

export function StudentCell({
  name,
  admissionNumber,
}: {
  name: string;
  admissionNumber: string;
}) {
  return (
    <span className="flex items-center gap-2">
      <PersonAvatar name={name} />
      <span className="flex flex-col">
        <span className="font-medium">{name}</span>
        <span className="text-xs text-muted-foreground">{admissionNumber}</span>
      </span>
    </span>
  );
}

export function AskedBy({ name }: { name: string | null }) {
  return name === null ? (
    <span className="text-muted-foreground">—</span>
  ) : (
    <span className="flex items-center gap-2">
      <PersonAvatar name={name} />
      {name}
    </span>
  );
}

export function ReasonCell({
  reason,
  rejectionReason,
}: {
  reason: string;
  rejectionReason: string | null;
}) {
  return (
    <span className="flex max-w-72 flex-col whitespace-normal">
      <span>{reason}</span>
      {rejectionReason === null ? null : (
        <span className="text-xs text-destructive">
          Declined: {rejectionReason}
        </span>
      )}
    </span>
  );
}
