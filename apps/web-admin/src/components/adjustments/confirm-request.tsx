import { ADJUSTMENT_KIND_LABELS } from '@eduvault/api-contract';
import { naira, parseNaira } from '@eduvault/shared';
import { ConfirmDialog } from '@eduvault/ui';
import type { ConfirmStep } from '../use-confirm-step';
import type { RequestState } from './request-model';
import { useStudentName } from './use-student-name';

export function ConfirmRequest({
  step,
  appliesAtOnce,
  pending,
}: {
  step: ConfirmStep<RequestState>;
  appliesAtOnce: boolean;
  pending: boolean;
}) {
  const state = step.target;
  const student = useStudentName(state?.studentId ?? '');
  return (
    <ConfirmDialog
      open={state !== null}
      title="Submit this request?"
      description={
        appliesAtOnce
          ? 'Approval is switched off, so it applies at once.'
          : 'It waits in Approvals until a second person decides.'
      }
      details={
        state === null
          ? []
          : [
              { label: 'Request', value: ADJUSTMENT_KIND_LABELS[state.kind] },
              { label: 'Student', value: student },
              {
                label: 'Amount',
                value: naira(parseNaira(state.amount) ?? 0),
              },
            ]
      }
      confirmLabel="Submit"
      pending={pending}
      onConfirm={step.confirm}
      onCancel={step.cancel}
    />
  );
}
