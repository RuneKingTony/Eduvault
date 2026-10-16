import type { BillingRunStatus } from '@eduvault/api-contract';
import { Badge } from '@eduvault/ui';
import { STATUS_LABELS } from './billing-text';

const VARIANTS = {
  draft: 'warning',
  issued: 'success',
  cancelled: 'secondary',
} as const;

export function StatusBadge({ status }: { status: BillingRunStatus }) {
  return <Badge variant={VARIANTS[status]}>{STATUS_LABELS[status]}</Badge>;
}
