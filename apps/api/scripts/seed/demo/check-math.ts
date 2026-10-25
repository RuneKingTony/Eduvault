import { termChargeMinor, type WalletPlan } from './money-plan';
import type { StudentNumber } from './people-plan';
import type { DemoPlan } from './plan';

interface ExpectedReceivable {
  chargedMinor: number;
  /** Credits the plan makes itself: payments and guardian spends. Auto-pay credits come on top. */
  plannedCreditsMinor: number;
  overpaidMinor: number;
}

export function expectedReceivable(plan: DemoPlan): ExpectedReceivable {
  let chargedMinor = 0;
  for (const family of plan.families) {
    for (const child of family.children) {
      chargedMinor += termChargeMinor(child.level);
    }
  }
  let paidMinor = 0;
  let overpaidMinor = 0;
  for (const payment of plan.payments) {
    paidMinor += payment.amountMinor;
    if (payment.behaviour === 'overpaid') {
      overpaidMinor += payment.amountMinor - payment.dueMinor;
    }
  }
  const spentMinor = plan.wallets.reduce(
    (total, wallet) => total + wallet.spend.amountMinor,
    0
  );
  return {
    chargedMinor,
    plannedCreditsMinor: paidMinor + spentMinor,
    overpaidMinor,
  };
}

export function expectedBalances(
  plan: DemoPlan,
  autoPaidMinor: (child: StudentNumber) => number
): Map<StudentNumber, number> {
  const balances = new Map<StudentNumber, number>();
  for (const family of plan.families) {
    const payment = plan.payments.find((row) => row.family === family.number);
    for (const child of family.children) {
      const paid =
        payment?.allocations.find((row) => row.child === child.number)
          ?.amountMinor ?? 0;
      const spent =
        plan.wallets.find((row) => row.spend.child === child.number)?.spend
          .amountMinor ?? 0;
      balances.set(
        child.number,
        termChargeMinor(child.level) -
          paid -
          spent -
          autoPaidMinor(child.number)
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
