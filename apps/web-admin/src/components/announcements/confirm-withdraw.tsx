import type { Announcement } from '@eduvault/api-contract';
import { ConfirmDialog } from '@eduvault/ui';
import type { ConfirmStep } from '../use-confirm-step';

export function ConfirmWithdraw({
  step,
  pending,
}: {
  step: ConfirmStep<Announcement>;
  pending: boolean;
}) {
  const row = step.target;
  return (
    <ConfirmDialog
      open={row !== null}
      title="Withdraw this announcement?"
      description="It stops showing on the portal at once. You can publish it again later."
      details={
        row === null ? [] : [{ label: 'Announcement', value: row.title }]
      }
      tone="destructive"
      confirmLabel="Withdraw"
      pending={pending}
      onConfirm={step.confirm}
      onCancel={step.cancel}
    />
  );
}
