import {
  PAYMENT_METHOD_LABELS,
  type JournalKind,
  type PaymentMethod,
  type StatementLink,
  type StatementRow,
  type StatementRowStatus,
  type StatementUnpaid,
} from '@eduvault/api-contract';
import {
  splitMovement,
  unpaidCharges,
  type KindMovement,
} from '../../common/ledger';

export interface MovementRecord extends KindMovement {
  entryId: string;
  sequence: number;
  effectiveOn: string;
  reference: string;
  memo: string | null;
  storeSale: boolean;
  invoice: { id: string; termLabel: string; descriptions: string } | null;
  payment: {
    id: string;
    receiptNumber: string;
    payerName: string;
    method: PaymentMethod;
    voided: boolean;
  } | null;
}

const OPENING = 'Opening balance';
const VOID_MEMO = /^Void of (?<receipt>.+?): (?<reason>.*)$/;

const CHARGE_PREFIX: Partial<Record<JournalKind, string>> = {
  store: 'Store purchase: ',
  adhoc: 'One-off: ',
};

function chargeDescription(movement: MovementRecord): string {
  const prefix = CHARGE_PREFIX[movement.kind];
  return prefix === undefined
    ? `Term fees, ${movement.invoice?.termLabel ?? ''}`
    : `${prefix}${movement.invoice?.descriptions ?? ''}`;
}

function voidDescription(movement: MovementRecord): string {
  const parts = VOID_MEMO.exec(movement.memo ?? '')?.groups;
  return parts === undefined
    ? `Cancelled: ${movement.memo ?? movement.reference}`
    : `Cancelled: ${parts['receipt']}, ${parts['reason']}`;
}

function paymentDescription(movement: MovementRecord): string {
  const { payment } = movement;
  return payment === null
    ? `Payment ${movement.reference}`
    : `Payment ${payment.receiptNumber} from ${payment.payerName} (${PAYMENT_METHOD_LABELS[payment.method]})`;
}

function openingDescription(movement: MovementRecord): string {
  return movement.memo === null || movement.memo === OPENING
    ? OPENING
    : `${OPENING}: ${movement.memo}`;
}

const memoOrReference = (movement: MovementRecord): string =>
  movement.memo ?? movement.reference;

const chargeWithDiscount = (
  movement: MovementRecord,
  status: StatementRowStatus
): string => {
  const charge = chargeDescription(movement);
  return status === 'reduced' ? `Discount on ${charge}` : charge;
};

const DESCRIBERS: Record<
  JournalKind,
  (movement: MovementRecord, status: StatementRowStatus) => string
> = {
  invoice: chargeWithDiscount,
  adhoc: chargeWithDiscount,
  store: chargeWithDiscount,
  payment: paymentDescription,
  payment_void: voidDescription,
  opening: openingDescription,
  adjustment: memoOrReference,
  store_receive: memoOrReference,
  store_cost: memoOrReference,
  store_count: memoOrReference,
  wallet_topup: () => 'Wallet top-up',
  wallet_spend: () => 'Paid from wallet',
};

export const describeMovement = (
  movement: MovementRecord,
  status: StatementRowStatus
): string => DESCRIBERS[movement.kind](movement, status);

export type Describer = typeof describeMovement;

const familyVoidDescription = (movement: MovementRecord): string => {
  const receipt = VOID_MEMO.exec(movement.memo ?? '')?.groups?.['receipt'];
  return receipt === undefined
    ? 'Payment cancelled'
    : `Payment ${receipt} cancelled`;
};

const FAMILY_DESCRIBERS: Partial<Record<JournalKind, Describer>> = {
  payment_void: familyVoidDescription,
  opening: () => OPENING,
  adjustment: (_movement, status) =>
    status === 'refunded' ? 'Refund' : 'Adjustment',
  store_receive: () => 'Adjustment',
  store_cost: () => 'Adjustment',
  store_count: () => 'Adjustment',
};

/** Staff-typed memos and void reasons are internal, so a family sees none of them. */
export const describeForFamily: Describer = (movement, status) =>
  (FAMILY_DESCRIBERS[movement.kind] ?? describeMovement)(movement, status);

export function movementLink(movement: MovementRecord): StatementLink {
  if (movement.invoice !== null) {
    return { type: 'invoice', id: movement.invoice.id };
  }
  return movement.payment === null
    ? null
    : { type: 'payment', id: movement.payment.id };
}

export function statementRowsOf(
  movementsOldestFirst: readonly MovementRecord[],
  describe: Describer = describeMovement
): StatementRow[] {
  return movementsOldestFirst.flatMap((movement) =>
    splitMovement(movement).map(({ status, amountMinor }) => ({
      entryId: movement.entryId,
      effectiveOn: movement.effectiveOn,
      reference: movement.reference,
      description: describe(movement, status),
      status,
      voided: movement.kind === 'payment' && movement.payment?.voided === true,
      amountMinor,
      link: movementLink(movement),
    }))
  );
}

export const withNet = (
  movement: MovementRecord
): MovementRecord & { netMinor: number } => ({
  ...movement,
  netMinor: movement.debitMinor - movement.creditMinor,
});

const unpaidLabel = (movement: MovementRecord): string => {
  if (movement.kind === 'opening') {
    return OPENING;
  }
  return movement.kind === 'payment_void'
    ? familyVoidDescription(movement)
    : movement.reference;
};

export function unpaidOf(
  movementsOldestFirst: readonly MovementRecord[]
): StatementUnpaid[] {
  const nets = movementsOldestFirst
    .filter((movement) => !movement.storeSale)
    .map((movement) => withNet(movement));
  return unpaidCharges(nets).map((charge) => ({
    reference: unpaidLabel(charge),
    outstandingMinor: charge.outstandingMinor,
    link: movementLink(charge),
  }));
}

export const lastPageOf = (total: number, pageSize: number): number =>
  Math.max(1, Math.ceil(total / pageSize));

export function pageOfRows<T>(
  rows: readonly T[],
  asked: number | undefined,
  pageSize: number
): { items: T[]; page: number } {
  const last = lastPageOf(rows.length, pageSize);
  const page = Math.min(asked ?? last, last);
  return {
    items: rows.slice((page - 1) * pageSize, page * pageSize),
    page,
  };
}

export function scopeNote(campusNames: readonly string[] | 'all'): string {
  if (campusNames === 'all') {
    return 'All campuses';
  }
  return campusNames.length === 0
    ? 'No campuses'
    : `${campusNames.join(', ')} campus`;
}
