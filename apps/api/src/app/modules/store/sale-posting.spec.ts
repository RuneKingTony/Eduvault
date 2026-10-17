import { assertBalancedLines } from '../../common/ledger';
import {
  saleChargePosting,
  saleCostPosting,
  saleCostReference,
  saleLineDescription,
} from './sale-posting';

const shared = {
  organizationId: 'school',
  invoiceId: 'invoice',
  chargeNumber: 'CHG-2026-00007',
  effectiveOn: '2026-10-07',
  postedBy: 'user',
  campusId: 'lekki',
};

describe('saleChargePosting', () => {
  const posting = saleChargePosting({
    ...shared,
    studentId: 'ada',
    studentName: 'Ada Obi',
    receivableId: 'owed-1100',
    salesAccountId: 'sales-4500',
    lines: [{ amountMinor: 650_000 }, { amountMinor: 450_000 }],
  });

  it('posts a store entry under the charge number, owed by the student', () => {
    expect(posting.kind).toBe('store');
    expect(posting.reference).toBe('CHG-2026-00007');
    expect(posting.sourceId).toBe('invoice');
    expect(posting.memo).toBe('Store purchase · Ada Obi');
  });

  it('debits what the student owes and credits store sales, balanced', () => {
    assertBalancedLines(posting.lines);
    const debits = posting.lines.filter((line) => line.debitMinor > 0);
    expect(debits.map((line) => line.ledgerAccountId)).toEqual([
      'owed-1100',
      'owed-1100',
    ]);
    expect(
      posting.lines
        .filter((line) => line.creditMinor > 0)
        .every((line) => line.ledgerAccountId === 'sales-4500')
    ).toBe(true);
  });

  it('puts the store’s campus on every line', () => {
    expect(posting.lines.every((line) => line.campusId === 'lekki')).toBe(true);
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

describe('sale line copy', () => {
  it('words a charge line and the cost reference', () => {
    expect(saleLineDescription('School shirt, Size 12', 2)).toBe(
      'School shirt, Size 12 × 2'
    );
    expect(saleCostReference('CHG-2026-00007')).toBe('CHG-2026-00007-COST');
  });
});
