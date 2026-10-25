import { termChargeMinor, type WalletPlan } from './money-plan';
import type { FamilyNumber, StudentNumber } from './people-plan';
import type { DemoPlan } from './plan';
import type { DemoCampus } from './config';
import { heldAfterSales, saleTotalMinor, STORE_ITEMS } from './store-plan';

interface ExpectedReceivable {
  chargedMinor: number;
  /** Credits the plan makes itself: payments, guardian spends, approved credit notes and write-offs. Auto-pay credits come on top. */
  plannedCreditsMinor: number;
  /** Debits beyond the term fees: approved refunds and the reversals of approved voids. */
  reversedMinor: number;
}

const sum = <T>(rows: readonly T[], amount: (row: T) => number): number =>
  rows.reduce((total, row) => total + amount(row), 0);

/** Only an approved request touches the ledger; waiting and declined ones, and discounts, do not. */
const approvedAdjustments = (plan: DemoPlan) =>
  plan.approvals.adjustments.filter((row) => row.state === 'approved');

const isRefund = (row: { kind: string }): boolean => row.kind === 'refund';

const reductionsMinor = (plan: DemoPlan): number =>
  sum(
    approvedAdjustments(plan).filter((row) => !isRefund(row)),
    (row) => row.amountMinor
  );

const refundsMinor = (plan: DemoPlan): number =>
  sum(
    approvedAdjustments(plan).filter((row) => isRefund(row)),
    (row) => row.amountMinor
  );

const voidedFamilies = (plan: DemoPlan): ReadonlySet<FamilyNumber> =>
  new Set(
    plan.approvals.voids
      .filter((row) => row.state === 'approved')
      .map((row) => row.family)
  );

export const voidedMinor = (plan: DemoPlan): number => {
  const families = voidedFamilies(plan);
  return sum(
    plan.payments.filter((payment) => families.has(payment.family)),
    (payment) => payment.amountMinor
  );
};

export function expectedReceivable(plan: DemoPlan): ExpectedReceivable {
  let chargedMinor = 0;
  for (const family of plan.families) {
    for (const child of family.children) {
      chargedMinor += termChargeMinor(child.level);
    }
  }
  const paidMinor = sum(plan.payments, (payment) => payment.amountMinor);
  const spentMinor = sum(plan.wallets, (wallet) => wallet.spend.amountMinor);
  return {
    chargedMinor,
    plannedCreditsMinor: paidMinor + spentMinor + reductionsMinor(plan),
    reversedMinor: refundsMinor(plan) + voidedMinor(plan),
  };
}

/** A store sale is charged and paid in one go: the receivable grows and shrinks by the same amount. */
export const expectedStoreSalesMinor = (plan: DemoPlan): number =>
  sum(plan.store.sales, saleTotalMinor);

function adjustmentOf(
  plan: DemoPlan,
  child: StudentNumber
): { reducedMinor: number; refundedMinor: number } {
  const rows = approvedAdjustments(plan).filter((row) => row.student === child);
  return {
    reducedMinor: sum(
      rows.filter((row) => !isRefund(row)),
      (row) => row.amountMinor
    ),
    refundedMinor: sum(
      rows.filter((row) => isRefund(row)),
      (row) => row.amountMinor
    ),
  };
}

export function expectedBalances(
  plan: DemoPlan,
  autoPaidMinor: (child: StudentNumber) => number
): Map<StudentNumber, number> {
  const balances = new Map<StudentNumber, number>();
  const voided = voidedFamilies(plan);
  for (const family of plan.families) {
    const payment = plan.payments.find((row) => row.family === family.number);
    for (const child of family.children) {
      const paid =
        payment?.allocations.find((row) => row.child === child.number)
          ?.amountMinor ?? 0;
      const spent =
        plan.wallets.find((row) => row.spend.child === child.number)?.spend
          .amountMinor ?? 0;
      const { reducedMinor, refundedMinor } = adjustmentOf(plan, child.number);
      balances.set(
        child.number,
        termChargeMinor(child.level) -
          (voided.has(family.number) ? 0 : paid) -
          spent -
          autoPaidMinor(child.number) -
          reducedMinor +
          refundedMinor
      );
    }
  }
  return balances;
}

export function owedAndCredit(balances: readonly number[]): {
  owedMinor: number;
  creditMinor: number;
} {
  let owedMinor = 0;
  let creditMinor = 0;
  for (const balance of balances) {
    if (balance > 0) {
      owedMinor += balance;
    } else {
      creditMinor -= balance;
    }
  }
  return { owedMinor, creditMinor };
}

export function expectedWalletBalance(
  wallet: WalletPlan,
  autoPaidMinor: number
): number {
  return (
    wallet.topUpMinor +
    (wallet.autoPay?.secondTopUpMinor ?? 0) -
    wallet.spend.amountMinor -
    autoPaidMinor
  );
}

export function expectedStock(
  plan: DemoPlan,
  campus: DemoCampus
): Map<string, number> {
  const held = heldAfterSales(plan.store.sales, campus);
  for (const count of plan.store.counts) {
    if (count.campus === campus && count.decision === 'approved') {
      for (const line of count.lines) {
        held.set(line.item, (held.get(line.item) ?? 0) - line.missing);
      }
    }
  }
  return held;
}

export const expectedStockValueMinor = (
  plan: DemoPlan,
  campus: DemoCampus
): number => {
  const held = expectedStock(plan, campus);
  return sum(STORE_ITEMS, (item) => item.costMinor * (held.get(item.key) ?? 0));
};
