import { assertBalancedLines } from '../../common/ledger';
import { saleChargeMemo, saleCostPosting } from './sale-posting';

const shared = {
  organizationId: 'school',
  invoiceId: 'invoice',
  chargeNumber: 'CHG-2026-00007',
  effectiveOn: '2026-10-07',
  postedBy: 'user',
  campusId: 'lekki',
};

describe('saleChargeMemo', () => {
  it('names the student on the charge’s journal entry', () => {
    expect(saleChargeMemo('Ada Obi')).toBe('Store purchase · Ada Obi');
  });
});

describe('saleCostPosting', () => {
  const input = {
    ...shared,
    costExpenseId: 'cost-5200',
    storeStockId: 'stock-1300',
    costMinor: 650_000,
  };

  it('moves the cost from store stock to cost of items sold, balanced', () => {
    const posting = saleCostPosting(input);
    expect(posting?.kind).toBe('store_cost');
    expect(posting?.reference).toBe('CHG-2026-00007-COST');
    expect(posting?.lines).toEqual([
      {
        ledgerAccountId: 'cost-5200',
        campusId: 'lekki',
        debitMinor: 650_000,
        creditMinor: 0,
      },
      {
        ledgerAccountId: 'stock-1300',
        campusId: 'lekki',
        debitMinor: 0,
        creditMinor: 650_000,
      },
    ]);
    assertBalancedLines(posting?.lines ?? []);
  });

  it('posts nothing when the stock cost nothing', () => {
    expect(saleCostPosting({ ...input, costMinor: 0 })).toBeUndefined();
  });
});
