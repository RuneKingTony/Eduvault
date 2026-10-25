import {
  expectedBalances,
  expectedReceivable,
  expectedWalletBalance,
  owedAndCredit,
} from './check-math';
import { termChargeMinor } from './money-plan';
import { buildDemoPlan } from './plan';

const plan = buildDemoPlan({ students: 40, teachers: 4 }, '2026-10-07');

describe('expectedReceivable', () => {
  it('charges every student their level term fee', () => {
    const total = plan.families
      .flatMap((family) => family.children)
      .reduce((sum, child) => sum + termChargeMinor(child.level), 0);
    expect(expectedReceivable(plan).chargedMinor).toBe(total);
  });

  it('adds payments and guardian spends, and counts only overpayment as credit', () => {
    const expected = expectedReceivable(plan);
    const payments = plan.payments.reduce(
      (sum, row) => sum + row.amountMinor,
      0
    );
    const spends = plan.wallets.reduce(
      (sum, row) => sum + row.spend.amountMinor,
      0
    );
    expect(expected.plannedCreditsMinor).toBe(payments + spends);
    const overpaid = plan.payments.filter(
      (row) => row.behaviour === 'overpaid'
    );
    expect(overpaid.length).toBeGreaterThan(0);
    expect(expected.overpaidMinor).toBe(
      overpaid.reduce((sum, row) => sum + row.amountMinor - row.dueMinor, 0)
    );
    expect(expected.overpaidMinor).toBeGreaterThan(0);
  });
});

describe('owedAndCredit', () => {
  it('splits signed balances into owed and credit', () => {
    expect(owedAndCredit([500, -200, 0, 300, -100])).toEqual({
      owedMinor: 800,
      creditMinor: 300,
    });
    expect(owedAndCredit([])).toEqual({ owedMinor: 0, creditMinor: 0 });
  });
});

const must = <T>(value: T | undefined): T => {
  if (value === undefined) {
    throw new Error('The small plan is missing a wallet this spec needs.');
  }
  return value;
};

describe('expectedWalletBalance', () => {
  const autoPayWallet = must(plan.wallets.find((row) => row.autoPay !== null));
  const plainWallet = must(plan.wallets.find((row) => row.autoPay === null));

  it('is the top-up less the spend when auto-pay is off', () => {
    expect(expectedWalletBalance(plainWallet, 0)).toBe(
      plainWallet.topUpMinor - plainWallet.spend.amountMinor
    );
  });

  it('adds the second top-up and takes off what auto-pay paid', () => {
    const second = autoPayWallet.autoPay?.secondTopUpMinor ?? 0;
    expect(second).toBeGreaterThan(0);
    expect(expectedWalletBalance(autoPayWallet, 0)).toBe(
      autoPayWallet.topUpMinor + second - autoPayWallet.spend.amountMinor
    );
    expect(expectedWalletBalance(autoPayWallet, 100_000)).toBe(
      expectedWalletBalance(autoPayWallet, 0) - 100_000
    );
  });
});

describe('expectedBalances', () => {
  it('leaves every student what was charged less payments and spends, and sums to the receivable', () => {
    const balances = expectedBalances(plan, () => 0);
    expect(balances.size).toBe(40);
    const expected = expectedReceivable(plan);
    const total = [...balances.values()].reduce((sum, row) => sum + row, 0);
    expect(total).toBe(expected.chargedMinor - expected.plannedCreditsMinor);
    const { creditMinor } = owedAndCredit([...balances.values()]);
    expect(creditMinor).toBe(expected.overpaidMinor);
  });

  it('takes what auto-pay paid off the student it paid for', () => {
    const [first] = plan.families.flatMap((family) => family.children);
    const plain = expectedBalances(plan, () => 0);
    const paid = expectedBalances(plan, (child) =>
      child === first?.number ? 100_000 : 0
    );
    expect((plain.get(first?.number ?? (0 as never)) ?? 0) - 100_000).toBe(
      paid.get(first?.number ?? (0 as never))
    );
  });
});
