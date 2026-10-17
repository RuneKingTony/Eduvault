import { spreadAmount, splitLine, totalOwed } from './payment-split';

const OWED = [18_000_000, 6_000_000, 6_000_000];

describe('spreadAmount', () => {
  it('fills the children in order up to what each owes', () => {
    expect(spreadAmount(20_000_000, OWED)).toEqual([18_000_000, 2_000_000, 0]);
  });

  it('gives each child what they owe when the amount is exactly the total', () => {
    expect(spreadAmount(30_000_000, OWED)).toEqual(OWED);
  });

  it('puts anything above the total owed on the first child as credit', () => {
    expect(spreadAmount(32_000_000, OWED)).toEqual([
      20_000_000, 6_000_000, 6_000_000,
    ]);
  });

  it('puts the whole amount on the first child when nobody owes anything', () => {
    expect(spreadAmount(500_000, [0, -100_000, 0])).toEqual([500_000, 0, 0]);
  });

  it('treats a child in credit as owing nothing', () => {
    expect(spreadAmount(300_000, [-50_000, 200_000])).toEqual([
      100_000, 200_000,
    ]);
  });

  it('returns nothing for no children and zeroes for no amount', () => {
    expect(spreadAmount(100, [])).toEqual([]);
    expect(spreadAmount(0, OWED)).toEqual([0, 0, 0]);
    expect(spreadAmount(-5, OWED)).toEqual([0, 0, 0]);
  });
});

describe('totalOwed', () => {
  it('adds what is owed and leaves out credit', () => {
    expect(totalOwed([6_000_000, -500_000, 2_000_000])).toBe(8_000_000);
  });
});

describe('splitLine', () => {
  const figures = { currency: 'NGN', owedMinor: 30_000_000 };

  it('says so when the split does not add up to the amount', () => {
    expect(
      splitLine({ ...figures, splitMinor: 20_000_000, amountMinor: 25_000_000 })
    ).toEqual({
      matches: false,
      text: 'Split ₦200,000 ≠ amount ₦250,000',
    });
  });

  it('describes a part payment', () => {
    expect(
      splitLine({ ...figures, splitMinor: 20_000_000, amountMinor: 20_000_000 })
    ).toEqual({
      matches: true,
      text: 'Split ₦200,000 matches the amount · part payment, ₦100,000 still owed after this',
    });
  });

  it('describes extra kept as credit', () => {
    expect(
      splitLine({ ...figures, splitMinor: 32_000_000, amountMinor: 32_000_000 })
    ).toEqual({
      matches: true,
      text: 'Split ₦320,000 matches the amount · ₦20,000 extra kept as credit',
    });
  });

  it('adds nothing when the amount is exactly what is owed', () => {
    expect(
      splitLine({ ...figures, splitMinor: 30_000_000, amountMinor: 30_000_000 })
    ).toEqual({ matches: true, text: 'Split ₦300,000 matches the amount' });
  });
});
