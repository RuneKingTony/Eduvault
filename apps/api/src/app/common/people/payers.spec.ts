import { defaultPayer, defaultPaysFees, leavesNoPayer } from './payers';

describe('defaultPayer', () => {
  it('makes the first guardian pay when none does', () => {
    expect(
      defaultPayer([{ paysFees: false }, { paysFees: false }]).map(
        (draft) => draft.paysFees
      )
    ).toEqual([true, false]);
  });

  it('leaves a payer who is already ticked alone', () => {
    expect(
      defaultPayer([{ paysFees: false }, { paysFees: true }]).map(
        (draft) => draft.paysFees
      )
    ).toEqual([false, true]);
  });

  it('does nothing with no guardians', () => {
    expect(defaultPayer([])).toEqual([]);
  });
});

describe('defaultPaysFees', () => {
  it('forces payer for the first guardian only', () => {
    expect(defaultPaysFees(0, false)).toBe(true);
    expect(defaultPaysFees(1, false)).toBe(false);
    expect(defaultPaysFees(2, true)).toBe(true);
  });
});

describe('leavesNoPayer', () => {
  const links = [
    { guardianId: 'a', paysFees: true },
    { guardianId: 'b', paysFees: false },
  ];

  it('refuses unticking the only payer or removing them', () => {
    expect(
      leavesNoPayer(links, { kind: 'edit', guardianId: 'a', paysFees: false })
    ).toBe(true);
    expect(leavesNoPayer(links, { kind: 'remove', guardianId: 'a' })).toBe(
      true
    );
  });

  it('allows removing a non-payer or adding another payer first', () => {
    expect(leavesNoPayer(links, { kind: 'remove', guardianId: 'b' })).toBe(
      false
    );
    expect(
      leavesNoPayer(
        [
          { guardianId: 'a', paysFees: true },
          { guardianId: 'b', paysFees: true },
        ],
        { kind: 'edit', guardianId: 'a', paysFees: false }
      )
    ).toBe(false);
  });

  it('allows removing the last guardian, who leaves no guardians at all', () => {
    expect(
      leavesNoPayer([{ guardianId: 'a', paysFees: true }], {
        kind: 'remove',
        guardianId: 'a',
      })
    ).toBe(false);
  });
});
