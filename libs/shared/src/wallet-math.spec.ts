import { allocateSpend, childSpendable, walletFigures } from './wallet-math';

describe('walletFigures', () => {
  it('sets aside the sum of the earmarks and leaves the rest free', () => {
    expect(walletFigures(5_000_000, [1_000_000, 500_000], 0)).toEqual({
      balanceMinor: 5_000_000,
      setAsideMinor: 1_500_000,
      heldMinor: 0,
      freeMinor: 3_500_000,
    });
  });

  it('is all free with no earmarks and all zero for an empty wallet', () => {
    expect(walletFigures(700_000, [], 0)).toEqual({
      balanceMinor: 700_000,
      setAsideMinor: 0,
      heldMinor: 0,
      freeMinor: 700_000,
    });
    expect(walletFigures(0, [], 0)).toEqual({
      balanceMinor: 0,
      setAsideMinor: 0,
      heldMinor: 0,
      freeMinor: 0,
    });
  });

  it('keeps every figure an integer number of kobo', () => {
    const figures = walletFigures(10_001, [3333, 3333, 3333], 0);
    expect(figures).toEqual({
      balanceMinor: 10_001,
      setAsideMinor: 9999,
      heldMinor: 0,
      freeMinor: 2,
    });
  });

  it('takes held money out of the free money and leaves the balance alone', () => {
    expect(walletFigures(5_000_000, [1_000_000], 1_500_000)).toEqual({
      balanceMinor: 5_000_000,
      setAsideMinor: 1_000_000,
      heldMinor: 1_500_000,
      freeMinor: 2_500_000,
    });
  });

  it('leaves nothing free when everything not set aside is held', () => {
    expect(walletFigures(2_000_000, [500_000], 1_500_000).freeMinor).toBe(0);
  });

  it('shows a negative free figure when the hold is more than what is free', () => {
    expect(walletFigures(1_000_000, [], 1_200_000).freeMinor).toBe(-200_000);
  });
});

describe('childSpendable', () => {
  it('caps at what the child owes', () => {
    expect(
      childSpendable(
        { owedMinor: 2_000_000, earmarkMinor: 500_000 },
        10_000_000
      )
    ).toBe(2_000_000);
  });

  it('caps at the earmark plus the free money', () => {
    expect(
      childSpendable({ owedMinor: 9_000_000, earmarkMinor: 500_000 }, 1_000_000)
    ).toBe(1_500_000);
  });

  it('is zero for a child who owes nothing or is in credit', () => {
    expect(
      childSpendable({ owedMinor: 0, earmarkMinor: 500_000 }, 100_000)
    ).toBe(0);
    expect(
      childSpendable({ owedMinor: -300_000, earmarkMinor: 0 }, 100_000)
    ).toBe(0);
  });
});

describe('allocateSpend', () => {
  const ada = {
    studentId: 'ada',
    owedMinor: 2_000_000,
    earmarkMinor: 800_000,
  };
  const ben = { studentId: 'ben', owedMinor: 2_000_000, earmarkMinor: 0 };

  it('uses the earmark first and takes only the rest from free money', () => {
    expect(
      allocateSpend(
        [{ studentId: 'ada', amountMinor: 1_200_000 }],
        [ada, ben],
        500_000
      )
    ).toEqual({
      ok: true,
      lines: [
        {
          studentId: 'ada',
          amountMinor: 1_200_000,
          fromEarmarkMinor: 800_000,
          fromFreeMinor: 400_000,
        },
      ],
    });
  });

  it('takes nothing from free money when the earmark covers the line', () => {
    expect(
      allocateSpend([{ studentId: 'ada', amountMinor: 300_000 }], [ada], 0)
    ).toEqual({
      ok: true,
      lines: [
        {
          studentId: 'ada',
          amountMinor: 300_000,
          fromEarmarkMinor: 300_000,
          fromFreeMinor: 0,
        },
      ],
    });
  });

  it('refuses a line over the earmark plus free money and names the maximum', () => {
    expect(
      allocateSpend(
        [{ studentId: 'ada', amountMinor: 1_300_001 }],
        [ada],
        500_000
      )
    ).toEqual({ ok: false, studentId: 'ada', spendableMinor: 1_300_000 });
  });

  it('refuses a line over what the child owes', () => {
    expect(
      allocateSpend(
        [{ studentId: 'ben', amountMinor: 2_000_001 }],
        [ben],
        9_900_000
      )
    ).toEqual({ ok: false, studentId: 'ben', spendableMinor: 2_000_000 });
  });

  it('shares the free money across lines, so two lines cannot both take all of it', () => {
    expect(
      allocateSpend(
        [
          { studentId: 'ben', amountMinor: 600_000 },
          { studentId: 'ada', amountMinor: 800_000 + 500_000 },
        ],
        [ada, ben],
        1_000_000
      )
    ).toEqual({ ok: false, studentId: 'ada', spendableMinor: 1_200_000 });
  });

  it('refuses a student who is not among the children with nothing spendable', () => {
    expect(
      allocateSpend([{ studentId: 'zed', amountMinor: 1 }], [ada], 1_000_000)
    ).toEqual({ ok: false, studentId: 'zed', spendableMinor: 0 });
  });

  it('allows a line of exactly the maximum', () => {
    const result = allocateSpend(
      [{ studentId: 'ben', amountMinor: 1_000_000 }],
      [ben],
      1_000_000
    );
    expect(result).toEqual({
      ok: true,
      lines: [
        {
          studentId: 'ben',
          amountMinor: 1_000_000,
          fromEarmarkMinor: 0,
          fromFreeMinor: 1_000_000,
        },
      ],
    });
  });
});
