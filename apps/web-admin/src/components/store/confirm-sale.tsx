import { PAYMENT_METHOD_LABELS, type Item } from '@eduvault/api-contract';
import { naira } from '@eduvault/shared';
import { ConfirmDialog } from '@eduvault/ui';
import {
  saleLines,
  saleTotalMinor,
  type SaleState,
  type SaleStudent,
} from './sale-model';

export function ConfirmSale({
  state,
  student,
  items,
  pending,
  onConfirm,
  onCancel,
}: {
  state: SaleState | undefined;
  student: SaleStudent | undefined;
  items: readonly Item[];
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ConfirmDialog
      open={state !== undefined}
      title="Record this purchase?"
      description="Payment is taken at the counter and stock goes down."
      details={
        state === undefined
          ? []
          : [
              { label: 'Student', value: student?.name ?? '' },
              { label: 'Items', value: String(saleLines(state).length) },
              {
                label: 'Paid by',
                value:
                  state.method === ''
                    ? ''
                    : PAYMENT_METHOD_LABELS[state.method],
              },
              {
                label: 'Total',
                value: naira(saleTotalMinor(state, items)),
              },
            ]
      }
      confirmLabel="Record purchase"
      pending={pending}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
