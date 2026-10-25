import {
  PAYMENT_PROOF_TYPE_MESSAGE,
  PAYMENT_REFERENCE_REQUIRED_MESSAGE,
  WALLET_AMOUNT_MESSAGE,
  WALLET_REFUND_EMAIL_MESSAGE,
  WALLET_REFUND_PROOF_REQUIRED_MESSAGE,
  WALLET_REFUND_REASON_MESSAGE,
  requestWalletRefundSchema,
  walletRefundOverMessage,
  type RefundOptions,
  type RequestWalletRefundInput,
} from '@eduvault/api-contract';
import {
  generateWalletReference,
  isProofFile,
  lagosDateOf,
  money,
  parseNaira,
  type RandomBytes,
} from '@eduvault/shared';

export interface RefundState {
  accountId: string;
  amount: string;
  email: string;
  reason: string;
  reference: string;
}

export type RefundField = 'amount' | 'email' | 'reason' | 'reference' | 'file';

export type RefundErrors = Partial<Record<RefundField, string>>;

export interface RefundEmail {
  file: File | undefined;
  uploaded: boolean;
}

const amountOf = (state: Pick<RefundState, 'amount'>): number =>
  parseNaira(state.amount) ?? 0;

export function initialState(
  options: RefundOptions,
  random?: RandomBytes
): RefundState {
  return {
    accountId: options.accounts[0]?.id ?? '',
    amount: '',
    email: '',
    reason: '',
    reference: generateWalletReference(
      'refund',
      lagosDateOf(new Date()),
      random
    ),
  };
}

function amountError(state: RefundState, freeMinor: number) {
  const amount = amountOf(state);
  if (amount <= 0) {
    return WALLET_AMOUNT_MESSAGE;
  }
  return amount > freeMinor ? walletRefundOverMessage(freeMinor) : undefined;
}

function fileError(email: RefundEmail) {
  if (email.file === undefined) {
    return email.uploaded ? undefined : WALLET_REFUND_PROOF_REQUIRED_MESSAGE;
  }
  return isProofFile(email.file) ? undefined : PAYMENT_PROOF_TYPE_MESSAGE;
}

export function validate(
  state: RefundState,
  email: RefundEmail,
  freeMinor: number
): RefundErrors {
  const shape = requestWalletRefundSchema.shape;
  const candidates: [RefundField, string | undefined][] = [
    ['amount', amountError(state, freeMinor)],
    [
      'email',
      shape.parentEmail.safeParse(state.email).success
        ? undefined
        : WALLET_REFUND_EMAIL_MESSAGE,
    ],
    ['file', fileError(email)],
    [
      'reason',
      shape.reason.safeParse(state.reason).success
        ? undefined
        : WALLET_REFUND_REASON_MESSAGE,
    ],
    [
      'reference',
      state.reference.trim() === ''
        ? PAYMENT_REFERENCE_REQUIRED_MESSAGE
        : undefined,
    ],
  ];
  return Object.fromEntries(
    candidates.filter(
      (entry): entry is [RefundField, string] => entry[1] !== undefined
    )
  );
}

export function toRequest(
  state: RefundState,
  proofFileId: string
): RequestWalletRefundInput {
  return {
    reference: state.reference.trim(),
    moneyAccountId: state.accountId,
    amountMinor: amountOf(state),
    parentEmail: state.email.trim(),
    reason: state.reason.trim(),
    proofFileId,
  };
}

export function confirmDetails(
  options: RefundOptions,
  state: RefundState,
  familyName: string
): { label: string; value: string }[] {
  const account = options.accounts.find((row) => row.id === state.accountId);
  return [
    { label: 'Wallet', value: familyName },
    {
      label: 'Amount',
      value: money(amountOf(state), options.currency, { kobo: true }),
    },
    { label: 'Paid from', value: account?.label ?? '' },
    { label: 'Parent’s email', value: state.email.trim() },
  ];
}
