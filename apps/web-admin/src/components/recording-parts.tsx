import { CheckIcon } from 'lucide-react';
import {
  PAYMENT_METHOD_LABELS,
  type PaymentMethod,
  type RecordingMoneyAccount,
} from '@eduvault/api-contract';
import { PAYMENT_METHODS } from '@eduvault/shared';
import {
  Button,
  NativeSelectOption,
  SelectField,
  SheetFooter,
} from '@eduvault/ui';
import { accountsFor } from './payments/record-payment-model';

export const PROOF_ACCEPT =
  'image/jpeg,image/png,image/webp,image/heic,application/pdf,.heic';

export const Hint = ({ children }: { children: string }) => (
  <p className="text-xs text-muted-foreground">{children}</p>
);

export function MoneyAccountFields({
  accounts,
  methods,
  accountId,
  method,
  onAccount,
  onMethod,
}: {
  accounts: readonly RecordingMoneyAccount[];
  methods: Readonly<Record<PaymentMethod, boolean>>;
  accountId: string;
  method: PaymentMethod;
  onAccount: (accountId: string) => void;
  onMethod: (method: PaymentMethod) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <SelectField
        label="Into"
        name="accountId"
        value={accountId}
        onChange={(event) => {
          onAccount(event.target.value);
        }}
      >
        {accountsFor(accounts, method).map((account) => (
          <NativeSelectOption key={account.id} value={account.id}>
            {account.label}
          </NativeSelectOption>
        ))}
      </SelectField>
      <SelectField
        label="How they paid"
        name="method"
        value={method}
        onChange={(event) => {
          onMethod(event.target.value as PaymentMethod);
        }}
      >
        {PAYMENT_METHODS.filter((candidate) => methods[candidate]).map(
          (candidate) => (
            <NativeSelectOption key={candidate} value={candidate}>
              {PAYMENT_METHOD_LABELS[candidate]}
            </NativeSelectOption>
          )
        )}
      </SelectField>
    </div>
  );
}

export function accountNotice(
  accounts: readonly RecordingMoneyAccount[],
  method: PaymentMethod,
  messages: { none: string; unsupported: string }
): string | undefined {
  if (accounts.length === 0) {
    return messages.none;
  }
  if (accountsFor(accounts, method).length === 0) {
    return messages.unsupported;
  }
  return undefined;
}

export function SheetActionsFooter({
  form,
  onClose,
  pending,
  options,
  method,
}: {
  form: { id: string; label: string };
  onClose: () => void;
  pending: boolean;
  options: { accounts: readonly RecordingMoneyAccount[] };
  method: PaymentMethod;
}) {
  return (
    <SheetFooter>
      <Button type="button" variant="ghost" onClick={onClose}>
        Cancel
      </Button>
      <Button
        type="submit"
        form={form.id}
        disabled={pending || accountsFor(options.accounts, method).length === 0}
      >
        <CheckIcon />
        {form.label}
      </Button>
    </SheetFooter>
  );
}
