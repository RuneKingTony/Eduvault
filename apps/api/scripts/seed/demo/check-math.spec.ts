import {
  expectedBalances,
  expectedReceivable,
  expectedStock,
  expectedStockValueMinor,
  expectedStoreSalesMinor,
  expectedWalletBalance,
  owedAndCredit,
  voidedMinor,
} from './check-math';
import { termChargeMinor } from './money-plan';
import { buildDemoPlan, withoutSchoolActivity, type DemoPlan } from './plan';
import { saleTotalMinor, STORE_ITEMS } from './store-plan';

const planned = buildDemoPlan({ students: 40, teachers: 4 }, '2026-10-07');
const plan = withoutSchoolActivity(planned);

describe('expectedReceivable', () => {
  it('charges every student their level term fee', () => {
    const total = plan.families
      .flatMap((family) => family.children)
      .reduce((sum, child) => sum + termChargeMinor(child.level), 0);
    expect(expectedReceivable(plan).chargedMinor).toBe(total);
  });

  it('adds payments and guardian spends', () => {
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
  });
});

const overpaidMinor = (from: DemoPlan): number =>
  from.payments
    .filter((row) => row.behaviour === 'overpaid')
    .reduce((sum, row) => sum + row.amountMinor - row.dueMinor, 0);

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
    expect(creditMinor).toBeGreaterThan(0);
    expect(creditMinor).toBe(overpaidMinor(plan));
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

const firstChild = plan.families.flatMap((family) => family.children)[0];
const secondChild = plan.families.flatMap((family) => family.children)[1];

const zero = () => 0;

const withAdjustment = (
  kind: 'credit_note' | 'write_off' | 'refund',
  state: 'approved' | 'pending' | 'declined',
  amountMinor = 300_000
): DemoPlan => ({
  ...plan,
  approvals: {
    ...plan.approvals,
    adjustments: [
      {
        kind,
        state,
        student: firstChild?.number ?? (0 as never),
        amountMinor,
        reason: 'test',
        daysAgo: 5,
        decidedDaysAgo: state === 'pending' ? null : 4,
        declineReason: state === 'declined' ? 'no' : null,
      },
    ],
  },
});

const balanceOf = (target: DemoPlan) =>
  expectedBalances(target, zero).get(firstChild?.number ?? (0 as never)) ?? 0;

describe('the original plan, with no school activity', () => {
  it('gives the numbers it gave before the store and approvals were planned', () => {
    const expected = expectedReceivable(plan);
    const paid = plan.payments.reduce((sum, row) => sum + row.amountMinor, 0);
    const spent = plan.wallets.reduce(
      (sum, row) => sum + row.spend.amountMinor,
      0
    );
    expect(expected.plannedCreditsMinor).toBe(paid + spent);
    expect(expected.reversedMinor).toBe(0);
    expect(expectedStoreSalesMinor(plan)).toBe(0);
    expect(voidedMinor(plan)).toBe(0);
    const balances = expectedBalances(plan, zero);
    expect([...balances.values()].reduce((sum, row) => sum + row, 0)).toBe(
      expected.chargedMinor - paid - spent
    );
    expect(owedAndCredit([...balances.values()]).creditMinor).toBe(
      overpaidMinor(plan)
    );
  });
});

describe('a planned credit note or write-off', () => {
  it.each(['credit_note', 'write_off'] as const)(
    'credits the student’s receivable when %s is approved',
    (kind) => {
      const target = withAdjustment(kind, 'approved');
      expect(balanceOf(target)).toBe(balanceOf(plan) - 300_000);
      expect(expectedReceivable(target).plannedCreditsMinor).toBe(
        expectedReceivable(plan).plannedCreditsMinor + 300_000
      );
      expect(expectedReceivable(target).reversedMinor).toBe(0);
    }
  );
});

describe('a planned refund', () => {
  it('debits the student’s receivable when approved', () => {
    const target = withAdjustment('refund', 'approved');
    expect(balanceOf(target)).toBe(balanceOf(plan) + 300_000);
    expect(expectedReceivable(target).reversedMinor).toBe(300_000);
    expect(expectedReceivable(target).plannedCreditsMinor).toBe(
      expectedReceivable(plan).plannedCreditsMinor
    );
  });
});

describe('planned items with no ledger effect', () => {
  it.each(['pending', 'declined'] as const)(
    'leaves every number alone for a %s adjustment of each kind',
    (state) => {
      for (const kind of ['credit_note', 'write_off', 'refund'] as const) {
        const target = withAdjustment(kind, state);
        expect(expectedReceivable(target)).toEqual(expectedReceivable(plan));
        expect(expectedBalances(target, zero)).toEqual(
          expectedBalances(plan, zero)
        );
      }
    }
  );

  it('leaves every number alone for discounts, however decided', () => {
    const target: DemoPlan = {
      ...plan,
      approvals: {
        ...plan.approvals,
        discounts: planned.approvals.discounts,
      },
    };
    expect(planned.approvals.discounts.length).toBeGreaterThan(0);
    expect(expectedReceivable(target)).toEqual(expectedReceivable(plan));
    expect(expectedBalances(target, zero)).toEqual(
      expectedBalances(plan, zero)
    );
  });
});

describe('a planned payment cancellation', () => {
  const family = plan.payments.find(
    (row) => row.amountMinor > 0 && row.behaviour === 'paid'
  );
  const cancel = (state: 'approved' | 'pending' | 'declined'): DemoPlan => ({
    ...plan,
    approvals: {
      ...plan.approvals,
      voids: [
        {
          family: family?.family ?? (0 as never),
          reason: 'test',
          state,
          daysAgo: 1,
          decidedDaysAgo: state === 'pending' ? null : 1,
          declineReason: state === 'declined' ? 'no' : null,
        },
      ],
    },
  });

  it('puts the payment back on what each child owes, and reverses its amount, when approved', () => {
    const target = cancel('approved');
    expect(family?.amountMinor).toBeGreaterThan(0);
    expect(voidedMinor(target)).toBe(family?.amountMinor);
    expect(expectedReceivable(target).reversedMinor).toBe(family?.amountMinor);
    expect(expectedReceivable(target).plannedCreditsMinor).toBe(
      expectedReceivable(plan).plannedCreditsMinor
    );
    const before = expectedBalances(plan, zero);
    const after = expectedBalances(target, zero);
    for (const allocation of family?.allocations ?? []) {
      expect(
        (after.get(allocation.child) ?? 0) - (before.get(allocation.child) ?? 0)
      ).toBe(allocation.amountMinor);
    }
  });

  it.each(['pending', 'declined'] as const)(
    'changes nothing while %s',
    (state) => {
      const target = cancel(state);
      expect(voidedMinor(target)).toBe(0);
      expect(expectedReceivable(target)).toEqual(expectedReceivable(plan));
      expect(expectedBalances(target, zero)).toEqual(
        expectedBalances(plan, zero)
      );
    }
  );
});

describe('planned store sales', () => {
  const buyer = secondChild;
  const target: DemoPlan = {
    ...plan,
    store: {
      ...plan.store,
      sales: [
        {
          number: 1,
          student: buyer?.number ?? (0 as never),
          campus: 'Main',
          method: 'cash',
          daysAgo: 5,
          lines: [{ item: STORE_ITEMS[0]?.key ?? '', quantity: 2 }],
        },
      ],
    },
  };

  it('are charged and paid together, so fee numbers and balances stay as they were', () => {
    expect(expectedReceivable(target)).toEqual(expectedReceivable(plan));
    expect(expectedBalances(target, zero)).toEqual(
      expectedBalances(plan, zero)
    );
  });

  it('add up from their lines at the item price', () => {
    const sale = target.store.sales[0];
    expect(saleTotalMinor(sale as never)).toBe(
      2 * (STORE_ITEMS[0]?.priceMinor ?? 0)
    );
    expect(expectedStoreSalesMinor(target)).toBe(saleTotalMinor(sale as never));
    expect(expectedStoreSalesMinor(plan)).toBe(0);
  });

  it('take stock off the shelf of the campus that sold it', () => {
    const key = STORE_ITEMS[0]?.key ?? '';
    expect(expectedStock(target, 'Main').get(key)).toBe(
      (expectedStock(plan, 'Main').get(key) ?? 0) - 2
    );
    expect(expectedStock(target, 'Annex').get(key)).toBe(
      expectedStock(plan, 'Annex').get(key)
    );
  });
});

describe('planned stock counts', () => {
  const lines = [{ item: STORE_ITEMS[1]?.key ?? '', held: 20, missing: 3 }];
  const counted = (decision: 'waiting' | 'approved'): DemoPlan => ({
    ...plan,
    store: {
      ...plan.store,
      counts: [{ campus: 'Annex', daysAgo: 3, decision, note: 'test', lines }],
    },
  });

  it('write the shortage off the stock and its value only when approved', () => {
    const key = STORE_ITEMS[1]?.key ?? '';
    const cost = STORE_ITEMS[1]?.costMinor ?? 0;
    expect(expectedStock(counted('approved'), 'Annex').get(key)).toBe(
      (expectedStock(plan, 'Annex').get(key) ?? 0) - 3
    );
    expect(expectedStockValueMinor(counted('approved'), 'Annex')).toBe(
      expectedStockValueMinor(plan, 'Annex') - 3 * cost
    );
    expect(expectedStock(counted('waiting'), 'Annex')).toEqual(
      expectedStock(plan, 'Annex')
    );
    expect(expectedStockValueMinor(counted('waiting'), 'Annex')).toBe(
      expectedStockValueMinor(plan, 'Annex')
    );
  });

  it('leave the other campus alone', () => {
    expect(expectedStock(counted('approved'), 'Main')).toEqual(
      expectedStock(plan, 'Main')
    );
  });
});
