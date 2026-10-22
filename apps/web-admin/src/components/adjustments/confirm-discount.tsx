import { naira, parseNaira } from '@eduvault/shared';
import { ConfirmDialog } from '@eduvault/ui';
import type { ConfirmStep } from '../use-confirm-step';
import type { DiscountState } from './discount-model';
import type { TermOption } from './term-options';
import { useStudentName } from './use-student-name';

const valueText = (state: DiscountState): string =>
  state.kind === 'percent'
    ? `${state.value.trim()}%`
    : naira(parseNaira(state.value) ?? 0);

export function ConfirmDiscount({
  step,
  terms,
  pending,
}: {
  step: ConfirmStep<DiscountState>;
  terms: readonly TermOption[];
  pending: boolean;
}) {
  const state = step.target;
  const student = useStudentName(state?.studentId ?? '');
  return (
    <ConfirmDialog
      open={state !== null}
      title="Submit this discount?"
      description="It waits in Approvals until a second person decides."
      details={
        state === null
          ? []
          : [
              { label: 'Student', value: student },
              { label: 'Discount', value: valueText(state) },
              {
                label: 'From',
                value:
                  terms.find((term) => term.id === state.fromTermId)?.label ??
                  '',
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
