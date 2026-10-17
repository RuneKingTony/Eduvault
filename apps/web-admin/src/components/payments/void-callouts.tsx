import { BanIcon, ClockIcon, InfoIcon } from 'lucide-react';
import type { Payment } from '@eduvault/api-contract';
import { Alert, AlertAction, AlertDescription } from '@eduvault/ui';
import { SeeInApprovals } from '../adjustments/status-cell';

const WARNING = 'border-warning/60 bg-warning/15';

export function VoidCallout({ payment }: { payment: Payment }) {
  const cancellation = payment.void;
  if (cancellation === null) {
    return null;
  }
  if (payment.status === 'void_pending') {
    return (
      <Alert className={WARNING}>
        <ClockIcon />
        <AlertDescription>
          Cancellation asked for by {cancellation.createdBy ?? 'someone'}: “
          {cancellation.reason}”. Waiting for a boss to approve it.
        </AlertDescription>
        <AlertAction>
          <SeeInApprovals />
        </AlertAction>
      </Alert>
    );
  }
  if (payment.status === 'voided') {
    return (
      <Alert variant="destructive">
        <BanIcon />
        <AlertDescription>
          {cancellation.approvedBy === null
            ? 'Cancelled straight away (approval is switched off).'
            : `Cancelled, approved by ${cancellation.approvedBy}.`}{' '}
          The receipt is kept, and the family owes this money again.
        </AlertDescription>
      </Alert>
    );
  }
  if (cancellation.status === 'rejected') {
    return (
      <Alert>
        <InfoIcon />
        <AlertDescription>
          A cancellation was asked for and declined
          {cancellation.rejectionReason === null
            ? '.'
            : `: “${cancellation.rejectionReason}”.`}
        </AlertDescription>
      </Alert>
    );
  }
  return null;
}
