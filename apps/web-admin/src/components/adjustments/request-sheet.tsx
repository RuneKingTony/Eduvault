import { useState, type SubmitEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { SendIcon } from 'lucide-react';
import {
  ADJUSTMENT_APPLIED_MESSAGE,
  ADJUSTMENT_SUBMITTED_MESSAGE,
  APPROVAL_RULE_BY_KIND,
} from '@eduvault/api-contract';
import {
  Button,
  ErrorMessage,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  toast,
} from '@eduvault/ui';
import { useApi } from '../../api';
import {
  invalidateApprovals,
  ledgerAccountsQueryOptions,
  moneyAccountsForRecordingQueryOptions,
  requestSheetChargesQueryOptions,
  schoolSettingsQueryOptions,
} from '../../queries';
import {
  AccountsDisclosure,
  ChargeField,
  KindField,
  ReasonField,
  StudentAmountFields,
  creditNoteAccounts,
} from './request-fields';
import {
  initialRequest,
  toRequestBody,
  validateRequest,
  withAccount,
  type RequestErrors,
  type RequestPrefill,
  type RequestState,
} from './request-model';

const WAITING_DESCRIPTION = 'A boss must approve it before it takes effect.';
const SWITCHED_OFF_DESCRIPTION =
  'This goes through straight away; approval is switched off for it.';

function useCreate(onClose: () => void) {
  const api = useApi();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (state: RequestState) =>
      api.adjustments.create({ body: toRequestBody(state) }),
    onSuccess: async (made) => {
      await invalidateApprovals(queryClient);
      onClose();
      if (made.autoApproved) {
        toast.success(ADJUSTMENT_APPLIED_MESSAGE);
        return;
      }
      toast.success(ADJUSTMENT_SUBMITTED_MESSAGE, {
        action: {
          label: 'Approvals inbox',
          onClick: () => {
            void navigate({ to: '/approvals' });
          },
        },
      });
    },
  });
}

function useChoices(state: RequestState) {
  const api = useApi();
  const accounts = useQuery(moneyAccountsForRecordingQueryOptions(api));
  const ledger = useQuery(ledgerAccountsQueryOptions(api));
  const settings = useQuery(schoolSettingsQueryOptions(api));
  const charges = useQuery({
    ...requestSheetChargesQueryOptions(api, state.studentId),
    enabled: state.kind === 'credit_note' && state.studentId !== '',
  });
  return { accounts, ledger, settings, charges };
}

function useRequestForm(prefill: RequestPrefill, onClose: () => void) {
  const [chosen, setChosen] = useState(() => initialRequest(prefill, ''));
  const [errors, setErrors] = useState<RequestErrors>({});
  const choices = useChoices(chosen);
  const create = useCreate(onClose);
  const moneyAccounts = choices.accounts.data ?? [];
  const state = withAccount(chosen, moneyAccounts);
  const patch = (change: Partial<RequestState>) => {
    setChosen((current) => ({ ...current, ...change }));
  };

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validateRequest(state);
    setErrors(found);
    if (Object.keys(found).length === 0) {
      create.mutate(state);
    }
  }

  return { state, errors, patch, submit, choices, create, moneyAccounts };
}

type RequestFormModel = ReturnType<typeof useRequestForm>;

function RequestFields({ form }: { form: RequestFormModel }) {
  const { state, errors, patch, choices } = form;
  const fields = { state, errors, patch };
  return (
    <>
      <KindField {...fields} />
      <StudentAmountFields {...fields} />
      {state.kind === 'credit_note' ? (
        <ChargeField
          state={state}
          patch={patch}
          charges={choices.charges.data?.items ?? []}
          currency={choices.charges.data?.currency ?? 'NGN'}
        />
      ) : null}
      <ReasonField
        value={state.reason}
        error={errors.reason}
        placeholder="Shown on the statement"
        onChange={(reason) => {
          patch({ reason });
        }}
      />
      <AccountsDisclosure
        {...fields}
        accounts={creditNoteAccounts(choices.ledger.data?.items ?? [])}
        moneyAccounts={form.moneyAccounts}
      />
      <ErrorMessage error={form.create.error} />
    </>
  );
}

function RequestForm({
  prefill,
  onClose,
}: {
  prefill: RequestPrefill;
  onClose: () => void;
}) {
  const form = useRequestForm(prefill, onClose);
  const rule =
    form.choices.settings.data?.approvalRules[
      APPROVAL_RULE_BY_KIND[form.state.kind]
    ];
  return (
    <>
      <SheetHeader>
        <SheetTitle>Discount or refund</SheetTitle>
        <SheetDescription>
          {rule === false ? SWITCHED_OFF_DESCRIPTION : WAITING_DESCRIPTION}
        </SheetDescription>
      </SheetHeader>
      <form
        id="request-adjustment"
        onSubmit={form.submit}
        noValidate
        className="flex flex-col gap-4 overflow-y-auto px-4"
      >
        <RequestFields form={form} />
      </form>
      <SheetFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          form="request-adjustment"
          disabled={form.create.isPending}
        >
          <SendIcon />
          Submit for approval
        </Button>
      </SheetFooter>
    </>
  );
}

export function RequestSheet({
  open,
  onOpenChange,
  prefill = {},
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefill?: RequestPrefill;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl">
        <RequestForm
          prefill={prefill}
          onClose={() => {
            onOpenChange(false);
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
