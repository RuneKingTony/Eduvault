import type { FeeType } from '@eduvault/api-contract';
import { naira, parseNaira } from '@eduvault/shared';
import { ConfirmDialog } from '@eduvault/ui';
import type { ConfirmStep } from '../use-confirm-step';
import { WHOLE_CHARGE, type DiscountState } from './discount-model';
import type { TermOption } from './term-options';
import { useStudentName } from './use-student-name';

const valueText = (state: DiscountState): string =>
  state.kind === 'percent'
    ? `${state.value.trim()}%`
    : naira(parseNaira(state.value) ?? 0);

export function ConfirmDiscount({
  step,
  terms,
  feeTypes,
  pending,
}: {
  step: ConfirmStep<DiscountState>;
  terms: readonly TermOption[];
  feeTypes: readonly FeeType[];
  pending: boolean;
}) {
  const state = step.target;
  const student = useStudentName(state?.studentId ?? '');
  return (
    <ConfirmDialog
      open={state !== null}
      title="Submit this discount?"
      description="It waits in Approvals until someone with approval decides."
      details={
        state === null
          ? []
          : [
              { label: 'Student', value: student },
              { label: 'Discount', value: valueText(state) },
              {
                label: 'Applies to',
                value:
                  state.feeTypeId === WHOLE_CHARGE
                    ? 'Whole charge'
                    : (feeTypes.find((type) => type.id === state.feeTypeId)
                        ?.name ?? ''),
              },
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
