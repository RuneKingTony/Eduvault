import { ChevronDownIcon } from 'lucide-react';
import {
  ADJUSTMENT_KIND_LABELS,
  ADJUSTMENT_KINDS,
  DISCOUNTS_GIVEN_SYSTEM_KEY,
  type InvoiceSummary,
  type LedgerAccount,
} from '@eduvault/api-contract';
import { money } from '@eduvault/shared';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  FieldError,
  Label,
  NativeSelectOption,
  SelectField,
  Textarea,
  TextField,
} from '@eduvault/ui';
import type { RequestErrors, RequestState } from './request-model';
import { StudentPicker } from './student-picker';

export interface RequestFieldsProps {
  state: RequestState;
  errors: RequestErrors;
  patch: (change: Partial<RequestState>) => void;
}

export function KindField({ state, patch }: RequestFieldsProps) {
  return (
    <SelectField
      label="Kind"
      name="kind"
      hint="Credit note reduces a charge · write-off gives up a debt · refund pays back credit held."
      value={state.kind}
      onChange={(event) => {
        patch({
          kind:
            ADJUSTMENT_KINDS.find((kind) => kind === event.target.value) ??
            state.kind,
          invoiceId: '',
        });
      }}
    >
      {ADJUSTMENT_KINDS.map((kind) => (
        <NativeSelectOption key={kind} value={kind}>
          {ADJUSTMENT_KIND_LABELS[kind]}
        </NativeSelectOption>
      ))}
    </SelectField>
  );
}

export function StudentAmountFields({
  state,
  errors,
  patch,
}: RequestFieldsProps) {
  return (
    <>
      <StudentPicker
        value={state.studentId}
        onChange={(studentId) => {
          patch({ studentId, invoiceId: '' });
        }}
      />
      <TextField
        label="Amount (₦)"
        name="amount"
        inputMode="decimal"
        value={state.amount}
        aria-invalid={errors.student === undefined ? undefined : true}
        onChange={(event) => {
          patch({ amount: event.target.value });
        }}
      />
      <FieldError message={errors.student} />
    </>
  );
}

export function ChargeField({
  charges,
  currency,
  state,
  patch,
}: Pick<RequestFieldsProps, 'state' | 'patch'> & {
  charges: readonly InvoiceSummary[];
  currency: string;
}) {
  return (
    <SelectField
      label="Which charge"
      name="charge"
      value={state.invoiceId}
      onChange={(event) => {
        patch({ invoiceId: event.target.value });
      }}
    >
      <NativeSelectOption value="">Not tied to a charge</NativeSelectOption>
      {charges.map((charge) => (
        <NativeSelectOption key={charge.id} value={charge.id}>
          {charge.number} ·{' '}
          {charge.kind === 'term' ? charge.termName : charge.forText} ·{' '}
          {money(charge.totalMinor, currency)}
        </NativeSelectOption>
      ))}
    </SelectField>
  );
}

export function ReasonField({
  value,
  error,
  placeholder,
  onChange,
}: {
  value: string;
  error: string | undefined;
  placeholder: string;
  onChange: (reason: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="request-reason">Reason</Label>
      <Textarea
        id="request-reason"
        name="reason"
        placeholder={placeholder}
        value={value}
        aria-invalid={error === undefined ? undefined : true}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      <FieldError message={error} />
    </div>
  );
}

const isIncomeAccount = (account: LedgerAccount): boolean =>
  account.type === 'income' && account.systemKey !== 'fee_income';

export function creditNoteAccounts(
  accounts: readonly LedgerAccount[]
): LedgerAccount[] {
  const discounts = accounts.filter(
    (account) => account.systemKey === DISCOUNTS_GIVEN_SYSTEM_KEY
  );
  const income = accounts
    .filter((account) => isIncomeAccount(account))
    .toSorted((a, b) => a.code - b.code);
  return [...discounts, ...income];
}

function CreditNoteAccountField({
  accounts,
  state,
  patch,
}: Pick<RequestFieldsProps, 'state' | 'patch'> & {
  accounts: readonly LedgerAccount[];
}) {
  return (
    <SelectField
      label="Credit note posts to"
      name="ledgerAccount"
      value={state.ledgerAccountId}
      onChange={(event) => {
        patch({ ledgerAccountId: event.target.value });
      }}
    >
      {accounts.map((account) => (
        <NativeSelectOption
          key={account.id}
          value={
            account.systemKey === DISCOUNTS_GIVEN_SYSTEM_KEY ? '' : account.id
          }
        >
          {account.code} {account.name}
        </NativeSelectOption>
      ))}
    </SelectField>
  );
}

function RefundAccountField({
  moneyAccounts,
  state,
  patch,
}: Pick<RequestFieldsProps, 'state' | 'patch'> & {
  moneyAccounts: readonly { id: string; label: string }[];
}) {
  return (
    <SelectField
      label="Refund paid from"
      name="moneyAccount"
      value={state.moneyAccountId}
      onChange={(event) => {
        patch({ moneyAccountId: event.target.value });
      }}
    >
      {moneyAccounts.map((account) => (
        <NativeSelectOption key={account.id} value={account.id}>
          {account.label}
        </NativeSelectOption>
      ))}
    </SelectField>
  );
}

export function AccountsDisclosure({
  accounts,
  moneyAccounts,
  state,
  errors,
  patch,
}: RequestFieldsProps & {
  accounts: readonly LedgerAccount[];
  moneyAccounts: readonly { id: string; label: string }[];
}) {
  return (
    <Collapsible>
      <CollapsibleTrigger className="flex items-center gap-1 text-sm font-medium">
        Accounts used
        <ChevronDownIcon className="size-4" />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-3 pt-3">
        {state.kind === 'credit_note' ? (
          <CreditNoteAccountField
            accounts={accounts}
            state={state}
            patch={patch}
          />
        ) : null}
        {state.kind === 'refund' ? (
          <RefundAccountField
            moneyAccounts={moneyAccounts}
            state={state}
            patch={patch}
          />
        ) : null}
        {state.kind === 'write_off' ? (
          <p className="text-sm text-muted-foreground">
            A cancelled balance is recorded as bad debt. There is nothing to
            choose.
          </p>
        ) : null}
        <FieldError message={errors.account} />
      </CollapsibleContent>
    </Collapsible>
  );
}
