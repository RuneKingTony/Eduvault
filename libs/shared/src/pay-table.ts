import {
  childSpendable,
  type SpendChild,
  type SpendRequestLine,
} from './wallet-math';

export interface PayTableChild extends SpendChild {
  oldestUnpaidOn: string | null;
}

export interface PayTableRow {
  studentId: string;
  capMinor: number;
  amountMinor: number;
  over: boolean;
}

export function oldestFirst<T extends { oldestUnpaidOn: string | null }>(
  children: readonly T[]
): T[] {
  return children.toSorted((a, b) => {
    if (a.oldestUnpaidOn === b.oldestUnpaidOn) {
      return 0;
    }
    if (a.oldestUnpaidOn === null) {
      return 1;
    }
    if (b.oldestUnpaidOn === null) {
      return -1;
    }
    return a.oldestUnpaidOn < b.oldestUnpaidOn ? -1 : 1;
  });
}

const fromFreeOf = (child: SpendChild, amountMinor: number): number =>
  Math.max(0, amountMinor - child.earmarkMinor);

/**
 * Lines are taken in order: a child's set-aside money is used first, and free money an
 * earlier line uses is gone for later ones, as the API allocates it.
 */
export function payTableRows(
  children: readonly SpendChild[],
  amountsMinor: Readonly<Record<string, number>>,
  freeMinor: number
): PayTableRow[] {
  let freeLeftMinor = freeMinor;
  return children.map((child) => {
    const capMinor = childSpendable(child, freeLeftMinor);
    const amountMinor = amountsMinor[child.studentId] ?? 0;
    freeLeftMinor -= fromFreeOf(child, Math.min(amountMinor, capMinor));
    return {
      studentId: child.studentId,
      capMinor,
      amountMinor,
      over: amountMinor > capMinor,
    };
  });
}

export function payAllICan(
  children: readonly SpendChild[],
  freeMinor: number
): SpendRequestLine[] {
  let freeLeftMinor = freeMinor;
  return children.flatMap((child) => {
    const amountMinor = childSpendable(child, freeLeftMinor);
    freeLeftMinor -= fromFreeOf(child, amountMinor);
    return amountMinor > 0 ? [{ studentId: child.studentId, amountMinor }] : [];
  });
}
