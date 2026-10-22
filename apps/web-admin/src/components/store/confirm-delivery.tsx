import type { Campus } from '@eduvault/api-contract';
import { ConfirmDialog } from '@eduvault/ui';
import type { ConfirmStep } from '../use-confirm-step';
import {
  deliveryRequest,
  totalMinor,
  type DeliveryState,
} from './delivery-model';
import { MaskedMoney } from './masked-money';
import { useShowCosts } from './use-show-costs';

export function ConfirmDelivery({
  step,
  campuses,
  pending,
}: {
  step: ConfirmStep<DeliveryState>;
  campuses: readonly Campus[];
  pending: boolean;
}) {
  const [showCosts] = useShowCosts();
  const state = step.target;
  const opening = state?.opening === true;
  return (
    <ConfirmDialog
      open={state !== null}
      title={opening ? 'Record opening stock?' : 'Record this delivery?'}
      description={
        opening
          ? 'Stock goes up with nothing paid.'
          : 'Stock goes up and the cost is paid from a money account.'
      }
      details={
        state === null
          ? []
          : [
              {
                label: 'Store',
                value:
                  campuses.find((campus) => campus.id === state.campusId)
                    ?.name ?? '',
              },
              { label: 'Supplier', value: state.supplier.trim() },
              {
                label: 'Items',
                value: String(deliveryRequest(state).lines.length),
              },
              {
                label: 'Total at cost',
                value: (
                  <MaskedMoney minor={totalMinor(state)} show={showCosts} />
                ),
              },
            ]
      }
      confirmLabel="Record delivery"
      pending={pending}
      onConfirm={step.confirm}
      onCancel={step.cancel}
    />
  );
}
