import {
  nextChildCode,
  naturalBalance,
  rollUpChart,
  visibleChart,
  type ChartAccount,
} from './ledger-balance';

const account = (
  code: number,
  extra: Partial<ChartAccount> = {}
): ChartAccount => ({
  id: `id-${code}`,
  code,
  name: `Account ${code}`,
  type: 'income',
  parentId: null,
  systemKey: null,
  debitMinor: 0,
  creditMinor: 0,
  ...extra,
});

describe('naturalBalance', () => {
  it('reads assets and expenses as debit minus credit', () => {
    expect(naturalBalance('asset', 900, 400)).toBe(500);
    expect(naturalBalance('expense', 100, 400)).toBe(-300);
  });

  it('reads liabilities, equity and income as credit minus debit', () => {
    expect(naturalBalance('liability', 100, 400)).toBe(300);
    expect(naturalBalance('equity', 0, 1200)).toBe(1200);
    expect(naturalBalance('income', 700, 200)).toBe(-500);
  });
});

describe('rollUpChart', () => {
  it('adds each child to its parent and leaves the children as they are', () => {
    const rolled = rollUpChart([
      account(4000, { debitMinor: 0, creditMinor: 100 }),
      account(4010, { parentId: 'id-4000', creditMinor: 500 }),
      account(4020, { parentId: 'id-4000', creditMinor: 250, debitMinor: 50 }),
    ]);
    expect(
      rolled.map((row) => [row.code, row.debitMinor, row.creditMinor])
    ).toEqual([
      [4000, 50, 850],
      [4010, 0, 500],
      [4020, 50, 250],
    ]);
  });

  it('rolls grandchildren up through every level', () => {
    const rolled = rollUpChart([
      account(1000),
      account(1100, { parentId: 'id-1000' }),
      account(1110, { parentId: 'id-1100', debitMinor: 70 }),
    ]);
    expect(rolled.map((row) => row.debitMinor)).toEqual([70, 70, 70]);
  });

  it('keeps an account with no children as it is', () => {
    expect(
      rollUpChart([account(3000, { creditMinor: 9 })])[0]?.creditMinor
    ).toBe(9);
  });
});

describe('visibleChart', () => {
  it('hides the refunds account and Other charges but keeps the rest', () => {
    const shown = visibleChart([
      account(2100, { systemKey: 'customer_credit_refunds' }),
      account(4000, { systemKey: 'fee_income' }),
      account(4060, { parentId: 'id-4000', systemKey: 'other_charges' }),
      account(4010, { parentId: 'id-4000' }),
    ]);
    expect(shown.map((row) => row.code)).toEqual([4000, 4010]);
  });

  it('orders top-level accounts by code, each followed by its children by code', () => {
    const shown = visibleChart([
      account(5000),
      account(4020, { parentId: 'id-4000' }),
      account(1200),
      account(4010, { parentId: 'id-4000' }),
      account(4000),
      account(1210, { parentId: 'id-1200' }),
    ]);
    expect(shown.map((row) => row.code)).toEqual([
      1200, 1210, 4000, 4010, 4020, 5000,
    ]);
  });
});

describe('the wallet and gateway accounts', () => {
  it('shows Student wallets and rolls Monnify collections into Money accounts', () => {
    const rolled = rollUpChart([
      account(1200, { type: 'asset', systemKey: 'money_accounts' }),
      account(1230, {
        type: 'asset',
        parentId: 'id-1200',
        systemKey: 'monnify_collections',
        debitMinor: 900,
        creditMinor: 100,
      }),
      account(1240, { type: 'asset', parentId: 'id-1200', debitMinor: 500 }),
      account(2200, {
        type: 'liability',
        systemKey: 'student_wallets',
        creditMinor: 1200,
      }),
    ]);
    expect(
      visibleChart(rolled).map((row) => [row.code, row.debitMinor])
    ).toEqual([
      [1200, 1400],
      [1230, 900],
      [1240, 500],
      [2200, 0],
    ]);
  });
});

describe('nextChildCode', () => {
  it('starts ten above the parent when there are no children', () => {
    expect(nextChildCode(4000, [], [4000, 4500])).toBe(4010);
  });

  it('goes ten above the highest child', () => {
    expect(nextChildCode(4000, [4010, 4080, 4020], [])).toBe(4090);
  });

  it('steps past a code another account already holds', () => {
    expect(nextChildCode(4000, [4490], [4500])).toBe(4510);
    expect(nextChildCode(4000, [4480], [4500, 4490])).toBe(4510);
  });

  it('gives 1210, then 1220, then 1230 under 1200', () => {
    const taken = [1100, 1200, 1300];
    expect(nextChildCode(1200, [], taken)).toBe(1210);
    expect(nextChildCode(1200, [1210], taken)).toBe(1220);
    expect(nextChildCode(1200, [1210, 1220], taken)).toBe(1230);
  });

  it('goes ten above Monnify collections, which holds 1230 from the start', () => {
    const taken = [1100, 1200, 1230, 1300];
    expect(nextChildCode(1200, [1230], taken)).toBe(1240);
    expect(nextChildCode(1200, [1230, 1240], taken)).toBe(1250);
  });

  it('steps past Store stock at 1300', () => {
    expect(nextChildCode(1200, [1290], [1300])).toBe(1310);
  });
});
