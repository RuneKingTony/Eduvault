import type {
  BillingTerm,
  Campus,
  FeeSetupLevel,
  PrepareBody,
} from '@eduvault/api-contract';
import { ConfirmDialog } from '@eduvault/ui';
import type { ConfirmStep } from '../use-confirm-step';
import { SCOPE_OPTIONS, termOptionLabel } from './billing-text';

interface Choices {
  terms: readonly BillingTerm[];
  campuses: readonly Campus[];
  levels: readonly FeeSetupLevel[];
}

function whoText(body: PrepareBody, choices: Choices): string {
  const scope = SCOPE_OPTIONS.find((option) => option.value === body.scope);
  const name =
    body.scope === 'campus'
      ? choices.campuses.find((campus) => campus.id === body.scopeId)?.name
      : choices.levels.find((level) => level.id === body.scopeId)?.name;
  return name ?? scope?.label ?? '';
}

export function ConfirmPrepare({
  step,
  choices,
  pending,
}: {
  step: ConfirmStep<PrepareBody>;
  choices: Choices;
  pending: boolean;
}) {
  const body = step.target;
  const term = choices.terms.find((found) => found.termId === body?.termId);
  return (
    <ConfirmDialog
      open={body !== null}
      title="Prepare these charges?"
      description="A draft is made for you to check. Nothing is charged until you send it."
      details={
        body === null
          ? []
          : [
              {
                label: 'Term',
                value: term === undefined ? '' : termOptionLabel(term),
              },
              { label: 'Who to charge', value: whoText(body, choices) },
            ]
      }
      confirmLabel="Prepare charges"
      pending={pending}
      onConfirm={step.confirm}
      onCancel={step.cancel}
    />
  );
}
