import { useState, type SubmitEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ReceiptTextIcon } from 'lucide-react';
import {
  BILLING_CAMPUS_REQUIRED_MESSAGE,
  BILLING_LEVEL_REQUIRED_MESSAGE,
  type BillingScope,
  type BillingTerm,
  type Campus,
  type FeeSetupLevel,
  type PrepareBody,
  type PrepareResult,
} from '@eduvault/api-contract';
import {
  Button,
  FieldError,
  NativeSelectOption,
  SelectField,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  fieldValue,
  toast,
} from '@eduvault/ui';
import { useApi } from '../../api';
import { useConfirmStep } from '../use-confirm-step';
import { ConfirmPrepare } from './confirm-prepare';
import {
  billingTermsQueryOptions,
  campusesQueryOptions,
  feeSetupQueryOptions,
  invalidateCharges,
} from '../../queries';
import {
  SCOPE_OPTIONS,
  nothingNewToast,
  preparedToast,
  termLabel,
  termOptionLabel,
} from './billing-text';

export interface Prepared {
  result: PrepareResult;
  termLabel: string;
}

function usePrepare(
  terms: readonly BillingTerm[],
  onPrepared: (prepared: Prepared) => void
) {
  const api = useApi();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (body: PrepareBody) => api.billingRuns.prepare({ body }),
    onSuccess: async (result) => {
      await invalidateCharges(queryClient);
      const term = terms.find(
        (candidate) => candidate.termId === result.termId
      );
      onPrepared({
        result,
        termLabel: term === undefined ? '' : termLabel(term),
      });
      const { runId } = result;
      if (runId === null) {
        toast.warning(nothingNewToast(result.skipped));
        return;
      }
      toast.success(preparedToast(result.created), {
        action: {
          label: 'Check them',
          onClick: () => {
            void navigate({
              to: '/finance/billing/$runId',
              params: { runId },
              search: { page: undefined },
            });
          },
        },
      });
    },
    onError: (failure) => {
      toast.error(failure.message);
    },
  });
}

interface Choices {
  terms: readonly BillingTerm[];
  campuses: readonly Campus[];
  levels: readonly FeeSetupLevel[];
}

function ScopeFields({
  scope,
  campuses,
  levels,
  termId,
}: { scope: BillingScope; termId: string } & Pick<
  Choices,
  'campuses' | 'levels'
>) {
  if (scope === 'campus') {
    return (
      <SelectField
        label="Campus"
        name="campusId"
        defaultValue={campuses[0]?.id ?? ''}
      >
        {campuses.map((campus) => (
          <NativeSelectOption key={campus.id} value={campus.id}>
            {campus.name}
          </NativeSelectOption>
        ))}
      </SelectField>
    );
  }
  if (scope === 'level') {
    return (
      <SelectField
        key={termId}
        label="Level"
        name="levelId"
        defaultValue={levels[0]?.id ?? ''}
      >
        {levels.map((level) => (
          <NativeSelectOption key={level.id} value={level.id}>
            {level.name}
          </NativeSelectOption>
        ))}
      </SelectField>
    );
  }
  return null;
}

const scopeIdOf = (data: FormData, scope: BillingScope): string | undefined => {
  if (scope === 'campus') {
    return fieldValue(data, 'campusId');
  }
  return scope === 'level' ? fieldValue(data, 'levelId') : undefined;
};

function usePrepareForm(
  choices: Choices,
  done: { onPrepared: (prepared: Prepared) => void; onClose: () => void }
) {
  const [scope, setScope] = useState<BillingScope>('school');
  const [termId, setTermId] = useState(
    (choices.terms.find((term) => term.isDefault) ?? choices.terms[0])
      ?.termId ?? ''
  );
  const [error, setError] = useState<string | null>(null);
  const prepare = usePrepare(choices.terms, (prepared) => {
    done.onPrepared(prepared);
    done.onClose();
  });
  const step = useConfirmStep<PrepareBody>((body, settled) => {
    prepare.mutate(body, { onSettled: settled });
  });
  return {
    step,
    scope,
    setScope,
    termId,
    setTermId,
    error,
    pending: prepare.isPending,
    submit: (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const scopeId = scopeIdOf(data, scope);
      if (scope !== 'school' && (scopeId === undefined || scopeId === '')) {
        setError(
          scope === 'campus'
            ? BILLING_CAMPUS_REQUIRED_MESSAGE
            : BILLING_LEVEL_REQUIRED_MESSAGE
        );
        return;
      }
      setError(null);
      step.ask({ termId, scope, scopeId });
    },
  };
}

function FormFields({
  choices,
  form,
}: {
  choices: Choices;
  form: Pick<
    ReturnType<typeof usePrepareForm>,
    'scope' | 'setScope' | 'termId' | 'setTermId'
  >;
}) {
  const { scope, termId } = form;
  const enrolled = new Set(
    choices.terms.find((term) => term.termId === termId)?.levelIds
  );
  return (
    <>
      <SelectField
        label="Term"
        name="termId"
        value={termId}
        onChange={(event) => {
          form.setTermId(event.target.value);
        }}
      >
        {choices.terms.map((term) => (
          <NativeSelectOption key={term.termId} value={term.termId}>
            {termOptionLabel(term)}
          </NativeSelectOption>
        ))}
      </SelectField>
      <SelectField
        label="Who to charge"
        name="scope"
        value={scope}
        onChange={(event) => {
          form.setScope(event.target.value as BillingScope);
        }}
      >
        {SCOPE_OPTIONS.map((option) => (
          <NativeSelectOption key={option.value} value={option.value}>
            {option.label}
          </NativeSelectOption>
        ))}
      </SelectField>
      <ScopeFields
        scope={scope}
        campuses={choices.campuses}
        levels={choices.levels.filter((level) => enrolled.has(level.id))}
        termId={termId}
      />
    </>
  );
}

function PrepareForm({
  choices,
  onPrepared,
  onClose,
}: {
  choices: Choices;
  onPrepared: (prepared: Prepared) => void;
  onClose: () => void;
}) {
  const form = usePrepareForm(choices, { onPrepared, onClose });
  return (
    <>
      <form
        id="prepare-charges"
        onSubmit={form.submit}
        noValidate
        className="flex flex-col gap-3 px-4"
      >
        <FormFields choices={choices} form={form} />
        <FieldError message={form.error} />
      </form>
      <SheetFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" form="prepare-charges" disabled={form.pending}>
          <ReceiptTextIcon />
          Prepare charges
        </Button>
      </SheetFooter>
      <ConfirmPrepare
        step={form.step}
        choices={choices}
        pending={form.pending}
      />
    </>
  );
}

export function PrepareSheet({
  open,
  onOpenChange,
  onPrepared,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPrepared: (prepared: Prepared) => void;
}) {
  const api = useApi();
  const terms = useQuery({ ...billingTermsQueryOptions(api), enabled: open });
  const campuses = useQuery({ ...campusesQueryOptions(api), enabled: open });
  const setup = useQuery({ ...feeSetupQueryOptions(api), enabled: open });
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Charge students</SheetTitle>
          <SheetDescription>
            Prepares the charges so you can check them. Nothing is final until
            you send them.
          </SheetDescription>
        </SheetHeader>
        {terms.data === undefined ||
        campuses.data === undefined ||
        setup.data === undefined ? null : (
          <PrepareForm
            choices={{
              terms: terms.data,
              campuses: campuses.data,
              levels: setup.data.levels,
            }}
            onPrepared={onPrepared}
            onClose={() => {
              onOpenChange(false);
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
