import { useState, type SubmitEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MONEY_ACCOUNT_NAME_MAX,
  createMoneyAccountSchema,
  updateMoneyAccountSchema,
  type Campus,
  type MoneyAccount,
  type UpdateMoneyAccountInput,
} from '@eduvault/api-contract';
import { useCan } from '@eduvault/auth-client';
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
  TextField,
  fieldValue,
  toast,
} from '@eduvault/ui';
import { useApi } from '../api';
import { campusesQueryOptions, invalidateMoneyAccounts } from '../queries';
import {
  KIND_LABELS,
  SCHOOL_WIDE_LABEL,
  campusLabel,
} from './money/money-text';

const SCHOOL_WIDE = 'school-wide';
const CHECK_DETAILS = 'Check the details.';
const ADDABLE_KINDS = ['bank', 'pos', 'cash'] as const;
type AddableKind = (typeof ADDABLE_KINDS)[number];

const blankToUndefined = (value: string): string | undefined =>
  value === '' ? undefined : value;

function useSave(
  editing: MoneyAccount | null,
  done: (saved: MoneyAccount) => void
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (send: () => Promise<MoneyAccount>) => send(),
    onSuccess: async (saved) => {
      await invalidateMoneyAccounts(queryClient);
      toast.success(
        editing === null
          ? `${saved.name} added with ledger account ${saved.ledgerCode}.`
          : `${saved.name} saved.`
      );
      done(saved);
    },
    onError: (failure) => {
      toast.error(failure.message);
    },
  });
}

function defaultCampus(
  campuses: readonly Campus[],
  canReachAll: boolean
): string {
  if (canReachAll) {
    return SCHOOL_WIDE;
  }
  return campuses[0]?.id ?? '';
}

function CampusField({ campuses }: { campuses: readonly Campus[] }) {
  const canReachAll = useCan('campus', 'readAll');
  return (
    <SelectField
      label="Campus"
      name="campusId"
      defaultValue={defaultCampus(campuses, canReachAll)}
    >
      {canReachAll ? (
        <NativeSelectOption value={SCHOOL_WIDE}>
          {SCHOOL_WIDE_LABEL}
        </NativeSelectOption>
      ) : null}
      {campuses.map((campus) => (
        <NativeSelectOption key={campus.id} value={campus.id}>
          {campus.name}
        </NativeSelectOption>
      ))}
    </SelectField>
  );
}

function Last4Field({ defaultValue }: { defaultValue: string }) {
  return (
    <TextField
      label="Last 4 digits"
      name="last4"
      inputMode="numeric"
      maxLength={4}
      autoComplete="off"
      defaultValue={defaultValue}
      placeholder="Optional, e.g. 4417"
    />
  );
}

function BankNameField({ defaultValue }: { defaultValue: string }) {
  return (
    <TextField
      label="Bank"
      name="bankName"
      autoComplete="off"
      maxLength={MONEY_ACCOUNT_NAME_MAX}
      defaultValue={defaultValue}
      placeholder="e.g. GTBank"
    />
  );
}

function addBody(data: FormData) {
  const campus = fieldValue(data, 'campusId');
  const kind = fieldValue(data, 'kind');
  return createMoneyAccountSchema.safeParse({
    name: fieldValue(data, 'name'),
    kind,
    bankName:
      kind === 'bank'
        ? blankToUndefined(fieldValue(data, 'bankName').trim())
        : undefined,
    last4: blankToUndefined(fieldValue(data, 'last4').trim()),
    campusId: campus === SCHOOL_WIDE ? null : campus,
  });
}

function editBody(data: FormData, current: MoneyAccount) {
  const body: UpdateMoneyAccountInput = {};
  const name = fieldValue(data, 'name');
  if (name.trim() !== current.name) {
    body.name = name;
  }
  const bankName = fieldValue(data, 'bankName').trim();
  if (current.kind === 'bank' && bankName !== (current.bankName ?? '')) {
    body.bankName = bankName;
  }
  const last4 = fieldValue(data, 'last4').trim();
  if (last4 !== (current.last4 ?? '')) {
    body.last4 = last4 === '' ? null : last4;
  }
  return updateMoneyAccountSchema.safeParse(body);
}

function useAccountForm(
  editing: MoneyAccount | null,
  onSaved: (saved: MoneyAccount) => void,
  onClose: () => void
) {
  const api = useApi();
  const [error, setError] = useState<string | null>(null);
  const save = useSave(editing, (saved) => {
    onSaved(saved);
    onClose();
  });

  function add(data: FormData) {
    const parsed = addBody(data);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? CHECK_DETAILS);
      return;
    }
    setError(null);
    save.mutate(() => api.moneyAccounts.create({ body: parsed.data }));
  }

  function edit(data: FormData, current: MoneyAccount) {
    const parsed = editBody(data, current);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? CHECK_DETAILS);
      return;
    }
    setError(null);
    if (Object.keys(parsed.data).length === 0) {
      onClose();
      return;
    }
    save.mutate(() =>
      api.moneyAccounts.update({
        params: { id: current.id },
        body: parsed.data,
      })
    );
  }

  return {
    error,
    pending: save.isPending,
    submit: (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      if (editing === null) {
        add(data);
      } else {
        edit(data, editing);
      }
    },
  };
}

function AddFields({ campuses }: { campuses: readonly Campus[] }) {
  const [kind, setKind] = useState<AddableKind>('bank');
  return (
    <>
      <TextField
        label="Name"
        name="name"
        autoComplete="off"
        maxLength={MONEY_ACCOUNT_NAME_MAX}
        placeholder="e.g. GTBank current"
      />
      <SelectField
        label="Kind"
        name="kind"
        value={kind}
        onChange={(event) => {
          setKind(event.target.value as AddableKind);
        }}
      >
        {ADDABLE_KINDS.map((option) => (
          <NativeSelectOption key={option} value={option}>
            {KIND_LABELS[option]}
          </NativeSelectOption>
        ))}
      </SelectField>
      {kind === 'bank' ? <BankNameField defaultValue="" /> : null}
      <Last4Field defaultValue="" />
      <CampusField campuses={campuses} />
    </>
  );
}

function EditFields({ account }: { account: MoneyAccount }) {
  return (
    <>
      <TextField
        label="Name"
        name="name"
        autoComplete="off"
        maxLength={MONEY_ACCOUNT_NAME_MAX}
        defaultValue={account.name}
      />
      {account.kind === 'bank' ? (
        <BankNameField defaultValue={account.bankName ?? ''} />
      ) : null}
      <Last4Field defaultValue={account.last4 ?? ''} />
    </>
  );
}

function SheetForm({
  editing,
  campuses,
  onSaved,
  onClose,
}: {
  editing: MoneyAccount | null;
  campuses: readonly Campus[];
  onSaved: (saved: MoneyAccount) => void;
  onClose: () => void;
}) {
  const form = useAccountForm(editing, onSaved, onClose);
  return (
    <>
      <form
        id="money-account"
        onSubmit={form.submit}
        noValidate
        className="flex flex-col gap-3 px-4"
      >
        {editing === null ? (
          <AddFields campuses={campuses} />
        ) : (
          <EditFields account={editing} />
        )}
        <FieldError message={form.error} />
      </form>
      <SheetFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" form="money-account" disabled={form.pending}>
          {editing === null ? 'Add account' : 'Save changes'}
        </Button>
      </SheetFooter>
    </>
  );
}

function SheetBody(props: {
  editing: MoneyAccount | null;
  onSaved: (saved: MoneyAccount) => void;
  onClose: () => void;
}) {
  const campuses = useQuery(campusesQueryOptions(useApi()));
  const { editing } = props;
  return (
    <>
      <SheetHeader>
        <SheetTitle>
          {editing === null ? 'Add a money account' : `Edit ${editing.name}`}
        </SheetTitle>
        <SheetDescription>
          {editing === null
            ? 'A new account gets its own ledger account, so its balance comes from the books.'
            : `${KIND_LABELS[editing.kind]} account · ${campusLabel(editing.campusName)}. The kind and the campus can’t change.`}
        </SheetDescription>
      </SheetHeader>
      {campuses.data === undefined ? null : (
        <SheetForm {...props} campuses={campuses.data} />
      )}
    </>
  );
}

export function MoneyAccountSheet({
  open,
  editing,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  editing: MoneyAccount | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (id: string) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-lg">
        <SheetBody
          key={editing?.id ?? 'new'}
          editing={editing}
          onSaved={(saved) => {
            onSaved(saved.id);
          }}
          onClose={() => {
            onOpenChange(false);
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
