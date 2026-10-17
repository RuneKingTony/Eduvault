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
  invoice: { id: string; termLabel: string; descriptions: string } | null;
  payment: {
    id: string;
    receiptNumber: string;
    payerName: string;
    method: PaymentMethod;
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
};

export const describeMovement = (
  movement: MovementRecord,
  status: StatementRowStatus
): string => DESCRIBERS[movement.kind](movement, status);

export function movementLink(movement: MovementRecord): StatementLink {
  if (movement.invoice !== null) {
    return { type: 'invoice', id: movement.invoice.id };
  }
  return movement.payment === null
    ? null
    : { type: 'payment', id: movement.payment.id };
}

export function statementRowsOf(
  movementsOldestFirst: readonly MovementRecord[]
): StatementRow[] {
  return movementsOldestFirst.flatMap((movement) =>
    splitMovement(movement).map(({ status, amountMinor }) => ({
      entryId: movement.entryId,
      effectiveOn: movement.effectiveOn,
      reference: movement.reference,
      description: describeMovement(movement, status),
      status,
      amountMinor,
      link: movementLink(movement),
    }))
  );
}

export function unpaidOf(
  movementsOldestFirst: readonly MovementRecord[]
): StatementUnpaid[] {
  const nets = movementsOldestFirst.map((movement) => ({
    ...movement,
    netMinor: movement.debitMinor - movement.creditMinor,
  }));
  return unpaidCharges(nets).map((charge) => ({
    reference: charge.kind === 'opening' ? OPENING : charge.reference,
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
