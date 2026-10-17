import {
  approvalPlan,
  differenceValue,
  differencesSummary,
  lineDifference,
  netValue,
  type CountLineFacts,
} from './stock-count';

const tie: CountLineFacts = {
  itemId: 'tie',
  displayName: 'School tie',
  expectedQuantity: 3,
  countedQuantity: 2,
  costPriceMinor: 120_000,
};

const shirt: CountLineFacts = {
  itemId: 'shirt',
  displayName: 'School shirt, Size 14',
  expectedQuantity: 4,
  countedQuantity: 5,
  costPriceMinor: 300_000,
};

describe('lineDifference', () => {
  it('is counted minus expected', () => {
    expect(lineDifference(tie)).toBe(-1);
    expect(lineDifference(shirt)).toBe(1);
    expect(lineDifference({ expectedQuantity: 2, countedQuantity: 2 })).toBe(0);
  });
});

describe('differenceValue', () => {
  it('values one tie short at its average, rounded half up', () => {
    const stock = { onHand: 3, valueMinor: 350_000 };
    expect(differenceValue(-1, stock, 120_000)).toBe(116_667);
  });

  it('values a shortage of everything held at the whole remaining value', () => {
    const stock = { onHand: 3, valueMinor: 350_000 };
    expect(differenceValue(-3, stock, 120_000)).toBe(350_000);
  });

  it('never takes more than the stock held, and nothing when none is held', () => {
    const stock = { onHand: 1, valueMinor: 120_000 };
    expect(differenceValue(-4, stock, 120_000)).toBe(120_000);
    expect(differenceValue(-1, { onHand: 0, valueMinor: 0 }, 120_000)).toBe(0);
  });

  it('values one shirt extra at the average of ₦3,250', () => {
    const stock = { onHand: 4, valueMinor: 1_300_000 };
    expect(differenceValue(1, stock, 300_000)).toBe(325_000);
  });

  it('values a surplus at the cost price when none is held', () => {
    const none = { onHand: 0, valueMinor: 0 };
    expect(differenceValue(2, none, 300_000)).toBe(600_000);
  });
});

describe('netValue', () => {
  it('counts shortages as loss and surpluses as gain', () => {
    expect(
      netValue([
        { difference: -1, valueMinor: 116_667 },
        { difference: 1, valueMinor: 325_000 },
      ])
    ).toBe(-208_333);
    expect(netValue([{ difference: -2, valueMinor: 650_000 }])).toBe(650_000);
  });

  it('is zero when nothing differs', () => {
    expect(netValue([{ difference: 0, valueMinor: 0 }])).toBe(0);
    expect(netValue([])).toBe(0);
  });
});

describe('differencesSummary', () => {
  it('lists each difference as missing or extra', () => {
    expect(
      differencesSummary([
        { displayName: 'School shirt, Size 14', difference: -2 },
        { displayName: 'School tie', difference: -1 },
        { displayName: 'Mathematics, JSS 1', difference: 3 },
        { displayName: 'Cap', difference: 0 },
      ])
    ).toBe(
      'School shirt, Size 14: 2 missing; School tie: 1 missing; Mathematics, JSS 1: 3 extra'
    );
  });

  it('says matches when nothing differs', () => {
    expect(differencesSummary([{ displayName: 'Cap', difference: 0 }])).toBe(
      'matches'
    );
  });
});

describe('approvalPlan', () => {
  it('takes one tie out at its average and posts that as the loss', () => {
    const plan = approvalPlan(
      [tie],
      new Map([['tie', { onHand: 3, valueMinor: 350_000 }]])
    );
    expect(plan).toEqual({
      status: 'ready',
      movements: [{ itemId: 'tie', quantity: -1, valueMinor: -116_667 }],
      netMinor: 116_667,
    });
  });

  it('adds one shirt at ₦3,250 and posts that as a gain', () => {
    const plan = approvalPlan(
      [shirt],
      new Map([['shirt', { onHand: 4, valueMinor: 1_300_000 }]])
    );
    expect(plan).toEqual({
      status: 'ready',
      movements: [{ itemId: 'shirt', quantity: 1, valueMinor: 325_000 }],
      netMinor: -325_000,
    });
  });

  it('adds a surplus at the cost price when none is held', () => {
    const plan = approvalPlan(
      [{ ...shirt, expectedQuantity: 0, countedQuantity: 2 }],
      new Map()
    );
    expect(plan).toEqual({
      status: 'ready',
      movements: [{ itemId: 'shirt', quantity: 2, valueMinor: 600_000 }],
      netMinor: -600_000,
    });
  });

  it('lets the last unit take the remaining value', () => {
    const plan = approvalPlan(
      [{ ...tie, expectedQuantity: 1, countedQuantity: 0 }],
      new Map([['tie', { onHand: 1, valueMinor: 116_667 }]])
    );
    expect(plan).toMatchObject({
      movements: [{ quantity: -1, valueMinor: -116_667 }],
      netMinor: 116_667,
    });
  });

  it('nets a shortage against a surplus', () => {
    const plan = approvalPlan(
      [tie, shirt],
      new Map([
        ['tie', { onHand: 3, valueMinor: 350_000 }],
        ['shirt', { onHand: 4, valueMinor: 1_300_000 }],
      ])
    );
    expect(plan).toMatchObject({ netMinor: 116_667 - 325_000 });
  });

  it('has no net value when the differences cancel out', () => {
    const plan = approvalPlan(
      [
        { ...tie, expectedQuantity: 2, countedQuantity: 1 },
        { ...shirt, expectedQuantity: 1, countedQuantity: 2 },
      ],
      new Map([
        ['tie', { onHand: 2, valueMinor: 300_000 }],
        ['shirt', { onHand: 1, valueMinor: 150_000 }],
      ])
    );
    expect(plan).toMatchObject({
      status: 'ready',
      netMinor: 0,
      movements: [{ quantity: -1 }, { quantity: 1 }],
    });
  });

  it('skips lines that match', () => {
    const plan = approvalPlan(
      [{ ...tie, countedQuantity: 3 }],
      new Map([['tie', { onHand: 3, valueMinor: 350_000 }]])
    );
    expect(plan).toEqual({ status: 'ready', movements: [], netMinor: 0 });
  });

  it('refuses when stock has moved and a shortage would go below zero', () => {
    const plan = approvalPlan(
      [tie],
      new Map([['tie', { onHand: 0, valueMinor: 0 }]])
    );
    expect(plan).toEqual({ status: 'moved' });
    expect(approvalPlan([tie], new Map())).toEqual({ status: 'moved' });
  });
});
