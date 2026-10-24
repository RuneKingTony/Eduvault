import { allocateSpend } from './wallet-math';
import { oldestFirst, payAllICan, payTableRows } from './pay-table';

const ada = { studentId: 'ada', owedMinor: 2_000_000, earmarkMinor: 0 };
const bayo = { studentId: 'bayo', owedMinor: 1_500_000, earmarkMinor: 0 };

describe('payTableRows', () => {
  it('caps each child at what they owe', () => {
    const rows = payTableRows([ada, bayo], {}, 10_000_000);
    expect(rows.map((row) => row.capMinor)).toEqual([2_000_000, 1_500_000]);
  });

  it('caps at the earmark plus the free money', () => {
    const [row] = payTableRows(
      [{ ...ada, owedMinor: 9_000_000, earmarkMinor: 500_000 }],
      {},
      1_000_000
    );
    expect(row?.capMinor).toBe(1_500_000);
  });

  it('reads zero for a child who owes nothing, and for an empty wallet', () => {
    const rows = payTableRows(
      [{ studentId: 'cleo', owedMinor: 0, earmarkMinor: 0 }, ada],
      {},
      0
    );
    expect(rows.map((row) => row.capMinor)).toEqual([0, 0]);
    expect(rows.map((row) => row.amountMinor)).toEqual([0, 0]);
    expect(rows.map((row) => row.over)).toEqual([false, false]);
  });

  it('uses set-aside money first, so free money is left for the next child', () => {
    const marked = { ...ada, earmarkMinor: 2_000_000 };
    const rows = payTableRows(
      [marked, bayo],
      { ada: 2_000_000, bayo: 1_000_000 },
      1_000_000
    );
    expect(rows.map((row) => row.capMinor)).toEqual([2_000_000, 1_000_000]);
    expect(rows.map((row) => row.over)).toEqual([false, false]);
  });

  it('does not count the same free money for two lines', () => {
    const rows = payTableRows(
      [ada, bayo],
      { ada: 1_500_000, bayo: 1_000_000 },
      2_000_000
    );
    expect(rows.map((row) => row.capMinor)).toEqual([2_000_000, 500_000]);
    expect(rows.map((row) => row.over)).toEqual([false, true]);
  });

  it('flags an amount over the cap', () => {
    const [row] = payTableRows([ada], { ada: 2_000_001 }, 10_000_000);
    expect(row).toEqual({
      studentId: 'ada',
      capMinor: 2_000_000,
      amountMinor: 2_000_001,
      over: true,
    });
  });

  it('agrees with the allocation the API makes', () => {
    const children = [{ ...ada, earmarkMinor: 300_000 }, bayo];
    const lines = payAllICan(children, 1_000_000);
    const allocation = allocateSpend(lines, children, 1_000_000);
    expect(allocation.ok).toBe(true);
  });
});

describe('payAllICan', () => {
  it('pays the first child in full before the next gets what is left', () => {
    expect(payAllICan([ada, bayo], 2_500_000)).toEqual([
      { studentId: 'ada', amountMinor: 2_000_000 },
      { studentId: 'bayo', amountMinor: 500_000 },
    ]);
  });

  it('takes the earmark first and leaves the free money for the others', () => {
    expect(
      payAllICan([{ ...ada, earmarkMinor: 2_000_000 }, bayo], 1_500_000)
    ).toEqual([
      { studentId: 'ada', amountMinor: 2_000_000 },
      { studentId: 'bayo', amountMinor: 1_500_000 },
    ]);
  });

  it('gives no line to a child who owes nothing or when the wallet is empty', () => {
    expect(payAllICan([ada, bayo], 0)).toEqual([]);
    expect(
      payAllICan([{ studentId: 'cleo', owedMinor: 0, earmarkMinor: 0 }], 1000)
    ).toEqual([]);
  });

  it('never goes over the free money', () => {
    const lines = payAllICan([ada, bayo], 999_999);
    expect(lines).toEqual([{ studentId: 'ada', amountMinor: 999_999 }]);
  });
});

describe('oldestFirst', () => {
  it('orders by the oldest unpaid charge, undated last, ties keeping their order', () => {
    const children = [
      { id: 'a', oldestUnpaidOn: null },
      { id: 'b', oldestUnpaidOn: '2026-09-01' },
      { id: 'c', oldestUnpaidOn: '2026-01-15' },
      { id: 'd', oldestUnpaidOn: '2026-09-01' },
    ];
    expect(oldestFirst(children).map((child) => child.id)).toEqual([
      'c',
      'b',
      'd',
      'a',
    ]);
    expect(children[0]?.id).toBe('a');
  });
});
