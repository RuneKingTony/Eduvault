import {
  WALLET_AMOUNT_MESSAGE,
  WALLET_PROOF_REQUIRED_MESSAGE,
  PAYMENT_PROOF_TYPE_MESSAGE,
  PAYMENT_REFERENCE_REQUIRED_MESSAGE,
  type PaymentMethod,
  type TopUpOptions,
  type TopUpWalletInput,
} from '@eduvault/api-contract';
import {
  generatePaymentReference,
  isProofFile,
  money,
  parseNaira,
  type RandomBytes,
} from '@eduvault/shared';
import {
  accountsFor,
  firstMethod,
  preferredAccountId,
  referenceOrFresh,
} from '../payments/record-payment-model';

export interface TopUpState {
  accountId: string;
  method: PaymentMethod;
  amount: string;
  receivedOn: string;
  depositor: string;
  reference: string;
  referenceTouched: boolean;
}

export type TopUpField = 'receipt' | 'reference' | 'amount';

export type TopUpErrors = Partial<Record<TopUpField, string>>;

export interface Receipt {
  file: File | undefined;
  uploaded: boolean;
}

export const amountOf = (state: Pick<TopUpState, 'amount'>): number =>
  parseNaira(state.amount) ?? 0;

export function initialState(
  options: TopUpOptions,
  random?: RandomBytes
): TopUpState {
  const method = firstMethod(options.methods);
  return {
    accountId: preferredAccountId(options.accounts, method),
    method,
    amount: '',
    receivedOn: options.today,
    depositor: '',
    reference: generatePaymentReference(method, options.today, random),
    referenceTouched: false,
  };
}

export function withMethod(
  options: TopUpOptions,
  state: TopUpState,
  change: { method: PaymentMethod; fresh: string }
): TopUpState {
  const { method, fresh } = change;
  const next = {
    ...state,
    method,
    reference: referenceOrFresh(state, fresh),
  };
  const fits = accountsFor(options.accounts, method).some(
    (account) => account.id === state.accountId
  );
  return fits
    ? next
    : { ...next, accountId: preferredAccountId(options.accounts, method) };
}

function receiptError(receipt: Receipt): string | undefined {
  if (receipt.file === undefined) {
    return receipt.uploaded ? undefined : WALLET_PROOF_REQUIRED_MESSAGE;
  }
  return isProofFile(receipt.file) ? undefined : PAYMENT_PROOF_TYPE_MESSAGE;
}

export function validate(state: TopUpState, receipt: Receipt): TopUpErrors {
  const candidates: [TopUpField, string | undefined][] = [
    ['receipt', receiptError(receipt)],
    [
      'reference',
      state.reference.trim() === ''
        ? PAYMENT_REFERENCE_REQUIRED_MESSAGE
        : undefined,
    ],
    ['amount', amountOf(state) <= 0 ? WALLET_AMOUNT_MESSAGE : undefined],
  ];
  return Object.fromEntries(
    candidates.filter(
      (entry): entry is [TopUpField, string] => entry[1] !== undefined
    )
  );
}

export function toRequest(
  state: TopUpState,
  proofFileId: string
): TopUpWalletInput {
  const depositor = state.depositor.trim();
  return {
    reference: state.reference.trim(),
    moneyAccountId: state.accountId,
    method: state.method,
    amountMinor: amountOf(state),
    receivedOn: state.receivedOn,
    ...(depositor === '' ? {} : { depositorName: depositor }),
    proofFileId,
  };
}

export function confirmDetails(
  options: TopUpOptions,
  state: TopUpState,
  familyName: string
): { label: string; value: string }[] {
  const account = options.accounts.find((row) => row.id === state.accountId);
  return [
    { label: 'Wallet', value: familyName },
    {
      label: 'Amount',
      value: money(amountOf(state), options.currency, { kobo: true }),
    },
    { label: 'Into', value: account?.label ?? '' },
  ];
}
