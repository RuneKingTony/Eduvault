import {
  STORE_SALE_POS_PROOF_MESSAGE,
  STORE_SALE_REQUIRED_MESSAGE,
  STORE_SALE_TRANSFER_PROOF_MESSAGE,
  SALE_METHOD_ORDER,
  booksForLevel,
  fittingSaleAccounts,
  isSellable,
  storeSaleNoAccountMessage,
  type Item,
  type PaymentMethod,
  type PaymentMethods,
  type RecordSaleInput,
  type SaleOptions,
} from '@eduvault/api-contract';
import { naira } from '@eduvault/shared';

export type SaleStudent = SaleOptions['students'][number];
export type SaleAccountOption = SaleOptions['accounts'][number];

export const NO_METHOD_MESSAGE = 'Choose how the student paid.';

export interface SaleState {
  reference: string;
  studentId: string;
  method: PaymentMethod | '';
  accountId: string;
  quantities: Readonly<Record<string, string>>;
}

export const saleMethods = (methods: PaymentMethods): PaymentMethod[] =>
  SALE_METHOD_ORDER.filter((method) => methods[method]);

export const initialSale = (
  reference: string,
  methods: PaymentMethods
): SaleState => ({
  reference,
  studentId: '',
  method: saleMethods(methods)[0] ?? '',
  accountId: '',
  quantities: {},
});

export const withStudent = (
  state: SaleState,
  studentId: string
): SaleState => ({
  ...state,
  studentId,
  accountId: '',
  quantities: {},
});

export const withMethod = (
  state: SaleState,
  method: PaymentMethod
): SaleState => ({ ...state, method, accountId: '' });

export const withAccount = (
  state: SaleState,
  accountId: string
): SaleState => ({
  ...state,
  accountId,
});

export function withQuantity(
  state: SaleState,
  change: { itemId: string; text: string; onHand: number }
): SaleState {
  const digits = change.text.replaceAll(/\D/g, '');
  const capped =
    digits === '' ? '' : String(Math.min(Number(digits), change.onHand));
  return {
    ...state,
    quantities: { ...state.quantities, [change.itemId]: capped },
  };
}

export const stockOn = (item: Pick<Item, 'stock'>, campusId: string): number =>
  item.stock.find((row) => row.campusId === campusId)?.onHand ?? 0;

export interface SaleRow {
  item: Item;
  onHand: number;
}

export interface SaleSection {
  title: string;
  rows: SaleRow[];
}

export function saleSections(
  items: readonly Item[],
  student: Pick<SaleStudent, 'campusId' | 'levelId' | 'levelName'>
): SaleSection[] {
  const live = items.filter((item) => isSellable(item));
  const rowsOf = (list: readonly Item[]): SaleRow[] =>
    list.map((item) => ({ item, onHand: stockOn(item, student.campusId) }));
  const books = booksForLevel(live, student.levelId);
  const uniforms = live.filter((item) => item.kind === 'uniform');
  return [
    {
      title: `Books for ${student.levelName ?? ''}`.trim(),
      rows: rowsOf(books),
    },
    { title: 'Uniforms', rows: rowsOf(uniforms) },
  ].filter((section) => section.rows.length > 0);
}

export type Into =
  | { status: 'chosen'; account: SaleAccountOption }
  | { status: 'choose'; accounts: SaleAccountOption[] }
  | { status: 'none' };

export function intoFor(
  method: PaymentMethod | '',
  student: Pick<SaleStudent, 'campusId'> | undefined,
  accounts: readonly SaleAccountOption[]
): Into | undefined {
  if (method === '' || student === undefined) {
    return undefined;
  }
  const fits = fittingSaleAccounts(method, student.campusId, accounts);
  const [only] = fits;
  if (only === undefined) {
    return { status: 'none' };
  }
  return fits.length === 1
    ? { status: 'chosen', account: only }
    : { status: 'choose', accounts: fits };
}

export function effectiveAccount(
  state: Pick<SaleState, 'accountId'>,
  into: Into | undefined
): SaleAccountOption | undefined {
  if (into === undefined || into.status === 'none') {
    return undefined;
  }
  if (into.status === 'chosen') {
    return into.account;
  }
  return (
    into.accounts.find((account) => account.id === state.accountId) ??
    into.accounts[0]
  );
}

const quantityOf = (text: string | undefined): number =>
  /^\d+$/.test(text?.trim() ?? '') ? Number(text) : 0;

export const saleLines = (
  state: SaleState
): { itemId: string; quantity: number }[] =>
  Object.entries(state.quantities)
    .map(([itemId, text]) => ({ itemId, quantity: quantityOf(text) }))
    .filter((line) => line.quantity > 0);

export const saleTotalMinor = (
  state: SaleState,
  items: readonly Pick<Item, 'id' | 'sellPriceMinor'>[]
): number =>
  saleLines(state).reduce(
    (sum, line) =>
      sum +
      line.quantity *
        (items.find((item) => item.id === line.itemId)?.sellPriceMinor ?? 0),
    0
  );

interface Check {
  student: SaleStudent | undefined;
  into: Into | undefined;
  hasProof: boolean;
}

export function validateSale(
  state: SaleState,
  { student, into, hasProof }: Check
): string | undefined {
  if (student === undefined || saleLines(state).length === 0) {
    return STORE_SALE_REQUIRED_MESSAGE;
  }
  if (state.method === '') {
    return NO_METHOD_MESSAGE;
  }
  if (!hasProof && state.method === 'pos') {
    return STORE_SALE_POS_PROOF_MESSAGE;
  }
  if (!hasProof && state.method === 'transfer') {
    return STORE_SALE_TRANSFER_PROOF_MESSAGE;
  }
  if (into?.status === 'none') {
    return storeSaleNoAccountMessage(state.method, student.campusName);
  }
  return undefined;
}

export const needsProof = (method: PaymentMethod | ''): boolean =>
  method === 'pos' || method === 'transfer';

export function saleRequest(
  state: SaleState,
  sent: { accountId: string | undefined; proofFileId: string | undefined }
): RecordSaleInput {
  return {
    reference: state.reference,
    studentId: state.studentId,
    method: state.method === '' ? 'cash' : state.method,
    ...(sent.accountId === undefined ? {} : { moneyAccountId: sent.accountId }),
    ...(sent.proofFileId === undefined
      ? {}
      : { proofFileId: sent.proofFileId }),
    lines: saleLines(state),
  };
}

export const studentLabel = (
  student: Pick<SaleStudent, 'name' | 'admissionNumber'>
): string => `${student.name} · ${student.admissionNumber}`;

export function owesLabel(balanceMinor: number): string {
  if (balanceMinor > 0) {
    return `${naira(balanceMinor)} owing`;
  }
  return balanceMinor < 0 ? `${naira(-balanceMinor)} extra paid` : 'Paid up';
}
