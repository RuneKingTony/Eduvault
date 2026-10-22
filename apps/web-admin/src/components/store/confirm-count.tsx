import type { Campus, Item } from '@eduvault/api-contract';
import { ConfirmDialog } from '@eduvault/ui';
import type { ConfirmStep } from '../use-confirm-step';
import { differingItems, type CountState } from './stock-count-model';

export function ConfirmCount({
  step,
  campuses,
  items,
  pending,
}: {
  step: ConfirmStep<CountState>;
  campuses: readonly Campus[];
  items: readonly Item[];
  pending: boolean;
}) {
  const state = step.target;
  const differing = state === null ? 0 : differingItems(state, items);
  return (
    <ConfirmDialog
      open={state !== null}
      title="Submit this stock count?"
      description={
        differing === 0
          ? 'Nothing differs, so stock stays as it is.'
          : 'Differences wait for a second person to approve.'
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
              { label: 'Items counted', value: String(items.length) },
              { label: 'Items that differ', value: String(differing) },
            ]
      }
      confirmLabel="Submit count"
      pending={pending}
      onConfirm={step.confirm}
      onCancel={step.cancel}
    />
  );
}
