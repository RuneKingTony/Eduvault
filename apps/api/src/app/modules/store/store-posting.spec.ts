import { assertBalancedLines } from '../../common/ledger';
import {
  countPosting,
  deliveryPosting,
  openingStockPosting,
} from './store-posting';
import { receiveValue } from './stock-value';

const shared = {
  organizationId: 'school-a',
  deliveryId: 'delivery-1',
  campusId: 'lekki',
  receivedOn: '2026-10-07',
  postedBy: 'chika',
  storeStockId: 'store-stock',
  totalMinor: receiveValue(10, 350_000),
};

describe('deliveryPosting', () => {
  const posting = deliveryPosting({
    ...shared,
    number: 'DEL-2026-0001',
    supplierName: 'Adebayo Uniforms Ltd',
    moneyLedgerAccountId: 'bank-ledger',
  });

  it('debits store stock and credits the money account on the campus, as one ₦35,000 entry', () => {
    expect(posting).toMatchObject({
      organizationId: 'school-a',
      reference: 'DEL-2026-0001',
      kind: 'store_receive',
      effectiveOn: '2026-10-07',
      postedBy: 'chika',
      sourceId: 'delivery-1',
      memo: 'Delivery DEL-2026-0001 · Adebayo Uniforms Ltd',
    });
    expect(posting.lines).toEqual([
      {
        ledgerAccountId: 'store-stock',
        campusId: 'lekki',
        debitMinor: 3_500_000,
        creditMinor: 0,
      },
      {
        ledgerAccountId: 'bank-ledger',
        campusId: 'lekki',
        debitMinor: 0,
        creditMinor: 3_500_000,
      },
    ]);
  });

  it('balances', () => {
    expect(() => {
      assertBalancedLines(posting.lines);
    }).not.toThrow();
  });
});

describe('openingStockPosting', () => {
  const posting = openingStockPosting({
    ...shared,
    number: 'OPEN-STORE-lekki',
    storeName: 'Lekki campus store',
    openingBalanceId: 'opening-balance',
  });

  it('debits store stock and credits opening balance equity on the campus', () => {
    expect(posting).toMatchObject({
      reference: 'OPEN-STORE-lekki',
      kind: 'opening',
      memo: 'Opening stock · Lekki campus store',
    });
    expect(posting.lines).toEqual([
      {
        ledgerAccountId: 'store-stock',
        campusId: 'lekki',
        debitMinor: 3_500_000,
        creditMinor: 0,
      },
      {
        ledgerAccountId: 'opening-balance',
        campusId: 'lekki',
        debitMinor: 0,
        creditMinor: 3_500_000,
      },
    ]);
  });

  it('balances', () => {
    expect(() => {
      assertBalancedLines(posting.lines);
    }).not.toThrow();
  });
});

describe('countPosting', () => {
  const count = {
    organizationId: 'school-a',
    number: 'CNT-2026-0001',
    countId: 'count-1',
    campusId: 'lekki',
    effectiveOn: '2026-10-17',
    postedBy: 'grace',
    storeStockId: 'store-stock',
    storeLossesId: 'store-losses',
  };

  it('debits store losses and credits store stock for a net shortage', () => {
    const posting = countPosting({ ...count, netMinor: 350_000 });
    expect(posting).toMatchObject({
      organizationId: 'school-a',
      reference: 'CNT-2026-0001',
      kind: 'store_count',
      effectiveOn: '2026-10-17',
      postedBy: 'grace',
      sourceId: 'count-1',
      memo: 'Stock count CNT-2026-0001',
    });
    expect(posting?.lines).toEqual([
      {
        ledgerAccountId: 'store-losses',
        campusId: 'lekki',
        debitMinor: 350_000,
        creditMinor: 0,
      },
      {
        ledgerAccountId: 'store-stock',
        campusId: 'lekki',
        debitMinor: 0,
        creditMinor: 350_000,
      },
    ]);
  });

  it('debits store stock and credits store losses for a net surplus', () => {
    const posting = countPosting({ ...count, netMinor: -325_000 });
    expect(posting?.lines).toEqual([
      {
        ledgerAccountId: 'store-stock',
        campusId: 'lekki',
        debitMinor: 325_000,
        creditMinor: 0,
      },
      {
        ledgerAccountId: 'store-losses',
        campusId: 'lekki',
        debitMinor: 0,
        creditMinor: 325_000,
      },
    ]);
  });

  it('balances both ways', () => {
    for (const netMinor of [350_000, -325_000]) {
      const posting = countPosting({ ...count, netMinor });
      expect(() => {
        assertBalancedLines(posting?.lines ?? []);
      }).not.toThrow();
    }
  });

  it('posts nothing when the differences cancel out', () => {
    expect(countPosting({ ...count, netMinor: 0 })).toBeUndefined();
  });
});
