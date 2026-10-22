import {
  PAYMENT_AMOUNT_MESSAGE,
  PAYMENT_NO_ALLOCATION_MESSAGE,
  PAYMENT_PAYER_REQUIRED_MESSAGE,
  PAYMENT_PROOF_REQUIRED_MESSAGE,
  PAYMENT_PROOF_TYPE_MESSAGE,
  PAYMENT_REFERENCE_REQUIRED_MESSAGE,
  paymentSplitMismatchMessage,
  accountTakesMethod,
  METHOD_ACCOUNT_KINDS,
  type PaymentMethod,
  type PaymentMethods,
  type RecordingMoneyAccount,
  type RecordPaymentInput,
  type RecordingChild,
  type RecordingOptions,
} from '@eduvault/api-contract';
import {
  PAYMENT_METHODS,
  generatePaymentReference,
  isProofFile,
  parseNaira,
  spreadAmount,
  totalOwed,
  type RandomBytes,
} from '@eduvault/shared';

export const SOMEONE_ELSE = 'someone-else';

export interface SheetState {
  payer: string;
  payerName: string;
  studentId: string;
  amount: string;
  paidOn: string;
  accountId: string;
  method: PaymentMethod;
  providerReference: string;
  reference: string;
  referenceTouched: boolean;
  shares: Readonly<Record<string, string>>;
}

export interface Prefill {
  guardianId?: string;
  studentId?: string;
}

export type SheetField =
  'proof' | 'reference' | 'amount' | 'split' | 'payerName';

export const FIELD_ORDER: readonly SheetField[] = [
  'proof',
  'reference',
  'amount',
  'split',
  'payerName',
];

export type SheetErrors = Partial<Record<SheetField, string>>;

const KOBO = 100;

export function nairaText(minor: number): string {
  const whole = Math.trunc(minor / KOBO);
  const kobo = minor % KOBO;
  if (kobo === 0) {
    return String(whole);
  }
  return `${whole}.${String(kobo).padStart(2, '0')}`;
}

const minorOf = (text: string): number => parseNaira(text) ?? 0;

export function childrenFor(
  options: RecordingOptions,
  state: Pick<SheetState, 'payer' | 'studentId'>
): readonly RecordingChild[] {
  if (state.payer === SOMEONE_ELSE) {
    return options.students.filter(
      (student) => student.studentId === state.studentId
    );
  }
  return (
    options.payers.find((payer) => payer.guardianId === state.payer)
      ?.children ?? []
  );
}

const owedOf = (children: readonly RecordingChild[]): number[] =>
  children.map((child) => child.owesMinor);

function prefilled(
  children: readonly RecordingChild[]
): Pick<SheetState, 'amount' | 'shares'> {
  const shares = Object.fromEntries(
    children.map((child) => [
      child.studentId,
      nairaText(Math.max(0, child.owesMinor)),
    ])
  );
  return { amount: nairaText(totalOwed(owedOf(children))), shares };
}

function firstMethod(methods: PaymentMethods): PaymentMethod {
  return PAYMENT_METHODS.find((method) => methods[method]) ?? 'cash';
}

function startingPayer(
  options: RecordingOptions,
  prefill: Prefill
): Pick<SheetState, 'payer' | 'studentId'> {
  const known = options.payers.find(
    (payer) => payer.guardianId === prefill.guardianId
  );
  const firstStudent = options.students[0]?.studentId ?? '';
  if (known !== undefined) {
    return { payer: known.guardianId, studentId: firstStudent };
  }
  const asked = options.students.find(
    (student) => student.studentId === prefill.studentId
  );
  if (asked !== undefined) {
    return { payer: SOMEONE_ELSE, studentId: asked.studentId };
  }
  const first = options.payers[0];
  return first === undefined
    ? { payer: SOMEONE_ELSE, studentId: firstStudent }
    : { payer: first.guardianId, studentId: firstStudent };
}

export function initialState(
  options: RecordingOptions,
  prefill: Prefill = {},
  random?: RandomBytes
): SheetState {
  const who = startingPayer(options, prefill);
  const method = firstMethod(options.methods);
  return {
    ...who,
    payerName: '',
    ...prefilled(childrenFor(options, who)),
    paidOn: options.today,
    accountId: preferredAccountId(options.accounts, method),
    method,
    providerReference: '',
    reference: generatePaymentReference(method, options.today, random),
    referenceTouched: false,
  };
}

export function withPayer(
  options: RecordingOptions,
  state: SheetState,
  payer: string
): SheetState {
  const next = { ...state, payer };
  return { ...next, ...prefilled(childrenFor(options, next)) };
}

export function withStudent(
  options: RecordingOptions,
  state: SheetState,
  studentId: string
): SheetState {
  const next = { ...state, studentId };
  return { ...next, ...prefilled(childrenFor(options, next)) };
}

export function withAmount(
  options: RecordingOptions,
  state: SheetState,
  amount: string
): SheetState {
  const children = childrenFor(options, state);
  const spread = spreadAmount(minorOf(amount), owedOf(children));
  return {
    ...state,
    amount,
    shares: Object.fromEntries(
      children.map((child, index) => [
        child.studentId,
        nairaText(spread[index] ?? 0),
      ])
    ),
  };
}

export function withShare(
  state: SheetState,
  studentId: string,
  text: string
): SheetState {
  return { ...state, shares: { ...state.shares, [studentId]: text } };
}

export function accountsFor(
  accounts: readonly RecordingMoneyAccount[],
  method: PaymentMethod
): RecordingMoneyAccount[] {
  return accounts.filter((account) => accountTakesMethod(account.kind, method));
}

/** METHOD_ACCOUNT_KINDS lists kinds in preference order, so cash opens on a cash account when there is one. */
function preferredAccountId(
  accounts: readonly RecordingMoneyAccount[],
  method: PaymentMethod
): string {
  const usable = accountsFor(accounts, method);
  for (const kind of METHOD_ACCOUNT_KINDS[method]) {
    const match = usable.find((account) => account.kind === kind);
    if (match !== undefined) {
      return match.id;
    }
  }
  return '';
}

export function withMethod(
  state: SheetState,
  method: PaymentMethod,
  fresh: string
): SheetState {
  return {
    ...state,
    method,
    reference: state.referenceTouched ? state.reference : fresh,
  };
}

export function withAccount(
  state: SheetState,
  accounts: readonly RecordingMoneyAccount[]
): SheetState {
  const usable = accountsFor(accounts, state.method);
  if (usable.some((account) => account.id === state.accountId)) {
    return state;
  }
  return {
    ...state,
    accountId: preferredAccountId(accounts, state.method),
  };
}

export const splitTotal = (state: SheetState): number =>
  Object.values(state.shares).reduce((sum, text) => sum + minorOf(text), 0);

export const amountOf = (state: SheetState): number => minorOf(state.amount);

export const owedTotal = (
  options: RecordingOptions,
  state: SheetState
): number => totalOwed(owedOf(childrenFor(options, state)));

export function validate(
  state: SheetState,
  proof: { file: File | undefined; uploaded: boolean }
): SheetErrors {
  const amount = amountOf(state);
  const split = splitTotal(state);
  const candidates: [SheetField, string | undefined][] = [
    ['proof', proofError(state.method, proof)],
    [
      'reference',
      state.reference.trim() === ''
        ? PAYMENT_REFERENCE_REQUIRED_MESSAGE
        : undefined,
    ],
    ['amount', amount <= 0 ? PAYMENT_AMOUNT_MESSAGE : undefined],
    [
      'split',
      split <= 0 ? PAYMENT_NO_ALLOCATION_MESSAGE : splitMismatch(split, amount),
    ],
    [
      'payerName',
      state.payer === SOMEONE_ELSE && state.payerName.trim() === ''
        ? PAYMENT_PAYER_REQUIRED_MESSAGE
        : undefined,
    ],
  ];
  return Object.fromEntries(
    candidates.filter(
      (entry): entry is [SheetField, string] => entry[1] !== undefined
    )
  );
}

function proofError(
  method: PaymentMethod,
  proof: { file: File | undefined; uploaded: boolean }
): string | undefined {
  if (method !== 'transfer') {
    return undefined;
  }
  if (proof.file === undefined) {
    return proof.uploaded ? undefined : PAYMENT_PROOF_REQUIRED_MESSAGE;
  }
  return isProofFile(proof.file) ? undefined : PAYMENT_PROOF_TYPE_MESSAGE;
}

function splitMismatch(split: number, amount: number): string | undefined {
  return split === amount
    ? undefined
    : paymentSplitMismatchMessage(split, amount);
}

export function toRequest(
  options: RecordingOptions,
  state: SheetState,
  proofFileId: string | undefined
): RecordPaymentInput {
  const allocations = childrenFor(options, state)
    .map((child) => ({
      studentId: child.studentId,
      amountMinor: minorOf(state.shares[child.studentId] ?? ''),
    }))
    .filter((row) => row.amountMinor > 0);
  const provider = state.providerReference.trim();
  return {
    reference: state.reference.trim(),
    ...(state.payer === SOMEONE_ELSE
      ? { payerName: state.payerName.trim() }
      : { payerGuardianId: state.payer }),
    moneyAccountId: state.accountId,
    method: state.method,
    ...(provider === '' ? {} : { providerReference: provider }),
    ...(proofFileId === undefined || state.method !== 'transfer'
      ? {}
      : { proofFileId }),
    amountMinor: amountOf(state),
    paidOn: state.paidOn,
    allocations,
  };
}
