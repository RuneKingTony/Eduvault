import type {
  JournalKind,
  StatementRowStatus,
  StatementTotals,
} from '@eduvault/api-contract';

type MovementSide = 'debit' | 'credit';

export interface KindMovement {
  kind: JournalKind;
  debitMinor: number;
  creditMinor: number;
}

const CHARGE_SIDES: Record<MovementSide, StatementRowStatus> = {
  debit: 'charged',
  credit: 'reduced',
};

/** Every side lands in exactly one bucket, so Total - Reduced - Paid is the balance. */
const STATUS_BY_KIND: Record<
  JournalKind,
  Record<MovementSide, StatementRowStatus>
> = {
  payment: { debit: 'cancelled', credit: 'paid' },
  payment_void: { debit: 'cancelled', credit: 'paid' },
  adjustment: { debit: 'refunded', credit: 'reduced' },
  invoice: CHARGE_SIDES,
  adhoc: CHARGE_SIDES,
  store: CHARGE_SIDES,
  opening: CHARGE_SIDES,
  store_receive: CHARGE_SIDES,
  store_cost: CHARGE_SIDES,
  store_count: CHARGE_SIDES,
  wallet_topup: { debit: 'cancelled', credit: 'paid' },
  wallet_spend: { debit: 'cancelled', credit: 'paid' },
  wallet_refund: { debit: 'cancelled', credit: 'paid' },
  wallet_topup_void: { debit: 'cancelled', credit: 'paid' },
};

export const movementStatus = (
  kind: JournalKind,
  side: MovementSide
): StatementRowStatus => STATUS_BY_KIND[kind][side];

const SIDES: readonly MovementSide[] = ['debit', 'credit'];

const amountOf = (movement: KindMovement, side: MovementSide): number =>
  side === 'debit' ? movement.debitMinor : movement.creditMinor;

/** A reversal or a refund takes money back out of Paid; nothing else moves it down. */
const PAID_DELTA: Record<StatementRowStatus, number> = {
  charged: 0,
  reduced: 0,
  paid: 1,
  cancelled: -1,
  refunded: -1,
};

export function statementTotals(
  movements: readonly KindMovement[]
): StatementTotals {
  const totals = {
    balanceMinor: 0,
    totalMinor: 0,
    paidMinor: 0,
    reducedMinor: 0,
  };
  for (const movement of movements) {
    totals.balanceMinor += movement.debitMinor - movement.creditMinor;
    for (const side of SIDES) {
      const amount = amountOf(movement, side);
      const status = movementStatus(movement.kind, side);
      totals.totalMinor += status === 'charged' ? amount : 0;
      totals.reducedMinor += status === 'reduced' ? amount : 0;
      totals.paidMinor += PAID_DELTA[status] * amount;
    }
  }
  return totals;
}

interface StatementSplit {
  side: MovementSide;
  status: StatementRowStatus;
  amountMinor: number;
}

export function splitMovement(movement: KindMovement): StatementSplit[] {
  return SIDES.flatMap((side) => {
    const amountMinor = amountOf(movement, side);
    return amountMinor > 0
      ? [{ side, status: movementStatus(movement.kind, side), amountMinor }]
      : [];
  });
}

interface NetMovement {
  netMinor: number;
}

export function unpaidCharges<T extends NetMovement>(
  movementsOldestFirst: readonly T[]
): (T & { outstandingMinor: number })[] {
  let pool = movementsOldestFirst.reduce(
    (sum, movement) => sum + Math.max(0, -movement.netMinor),
    0
  );
  return movementsOldestFirst.flatMap((movement) => {
    if (movement.netMinor <= 0) {
      return [];
    }
    const covered = Math.min(pool, movement.netMinor);
    pool -= covered;
    const outstandingMinor = movement.netMinor - covered;
    return outstandingMinor > 0 ? [{ ...movement, outstandingMinor }] : [];
  });
}

/** What the family owes adds up the children who owe; one child's credit is never set against another's debt. */
export function familyTotals(balances: readonly number[]): {
  owedMinor: number;
  creditMinor: number;
} {
  return {
    owedMinor: balances.reduce((sum, balance) => sum + Math.max(0, balance), 0),
    creditMinor: balances.reduce(
      (sum, balance) => sum + Math.max(0, -balance),
      0
    ),
  };
}
