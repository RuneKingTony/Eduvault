import {
  balanceToday,
  broughtForward,
  broughtForwardBefore,
  termSlice,
  type ReceivableMovement,
} from './brought-forward';

const move = (sequence: number, netMinor: number): ReceivableMovement => ({
  sequence,
  netMinor,
});

describe('broughtForward', () => {
  it('adds what was posted before the charge and nothing after it', () => {
    const movements = [
      move(3, 22_600_000),
      move(1, 1_200_000),
      move(5, -18_000_000),
    ];
    expect(broughtForward(movements, 3)).toBe(1_200_000);
    expect(balanceToday(movements)).toBe(5_800_000);
  });

  it('is zero for the first entry', () => {
    expect(broughtForward([move(1, 500)], 1)).toBe(0);
  });

  it('counts an earlier entry posted in the same transaction, not a later one', () => {
    const movements = [move(10, 700), move(11, 900), move(12, -300)];
    expect(broughtForward(movements, 11)).toBe(700);
    expect(broughtForward(movements, 12)).toBe(1600);
  });

  it('nets payments and discounts against what was owed', () => {
    expect(broughtForward([move(1, 1000), move(2, -400)], 9)).toBe(600);
  });
});

describe('balanceToday', () => {
  it('is the whole movement total and zero with none', () => {
    expect(balanceToday([])).toBe(0);
    expect(balanceToday([move(1, 100), move(2, -250)])).toBe(-150);
  });
});

const dated = (effectiveOn: string, netMinor: number) => ({
  effectiveOn,
  netMinor,
});

describe('broughtForwardBefore', () => {
  const history = [
    dated('2026-01-05', 1000),
    dated('2026-03-01', -400),
    dated('2026-03-01', 250),
  ];

  it('is zero when nothing is dated before the day', () => {
    expect(broughtForwardBefore(history, '2026-01-05')).toBe(0);
    expect(broughtForwardBefore([], '2026-01-05')).toBe(0);
  });

  it('adds every entry dated before the day and none on it', () => {
    expect(broughtForwardBefore(history, '2026-03-01')).toBe(1000);
    expect(broughtForwardBefore(history, '2026-03-02')).toBe(850);
  });
});

describe('termSlice', () => {
  const history = [
    dated('2026-08-01', 700),
    dated('2026-09-01', 3000),
    dated('2026-09-15', -1200),
    dated('2026-12-18', 100),
    dated('2026-12-19', -50),
  ];

  it('is ₦0 brought forward when nothing is before the window', () => {
    const slice = termSlice(history, { fromOn: '2026-08-01', toOn: null });
    expect(slice.broughtForwardMinor).toBe(0);
    expect(slice.inTerm).toHaveLength(5);
  });

  it('puts an entry on the first day in the term', () => {
    const slice = termSlice(history, {
      fromOn: '2026-09-01',
      toOn: '2026-12-18',
    });
    expect(slice.inTerm[0]).toEqual(dated('2026-09-01', 3000));
    expect(slice.broughtForwardMinor).toBe(700);
  });

  it('leaves out an entry the day after the last day', () => {
    const slice = termSlice(history, {
      fromOn: '2026-09-01',
      toOn: '2026-12-18',
    });
    expect(slice.inTerm.map(({ effectiveOn }) => effectiveOn)).toEqual([
      '2026-09-01',
      '2026-09-15',
      '2026-12-18',
    ]);
  });

  it('takes everything after the first day for the latest term', () => {
    const slice = termSlice(history, { fromOn: '2026-09-15', toOn: null });
    expect(slice.inTerm).toHaveLength(3);
    expect(slice.broughtForwardMinor).toBe(3700);
  });

  it('adds up so that brought forward plus the term is the closing', () => {
    const slice = termSlice(history, {
      fromOn: '2026-09-01',
      toOn: '2026-12-18',
    });
    expect(slice.closingMinor).toBe(
      slice.broughtForwardMinor + balanceToday(slice.inTerm)
    );
    expect(slice.closingMinor).toBe(2600);
  });

  it('closes one window on the next window brought forward over a mixed history', () => {
    const mixed = [
      dated('2026-06-01', -800),
      dated('2026-09-02', 4000),
      dated('2026-09-20', -4000),
      dated('2026-11-30', 4000),
      dated('2027-01-10', 5200),
      dated('2027-02-01', -4000),
      dated('2027-03-05', 1500),
    ];
    const first = termSlice(mixed, {
      fromOn: '2026-09-01',
      toOn: '2027-01-04',
    });
    const second = termSlice(mixed, {
      fromOn: '2027-01-05',
      toOn: '2027-04-30',
    });
    const third = termSlice(mixed, { fromOn: '2027-05-01', toOn: null });
    expect(first.closingMinor).toBe(second.broughtForwardMinor);
    expect(second.closingMinor).toBe(third.broughtForwardMinor);
    expect(third.closingMinor).toBe(balanceToday(mixed));
    expect(third.inTerm).toEqual([]);
  });

  it('has no entries in a window that ends before it opens', () => {
    const slice = termSlice(history, {
      fromOn: '2026-09-15',
      toOn: '2026-09-14',
    });
    expect(slice.inTerm).toEqual([]);
    expect(slice.closingMinor).toBe(slice.broughtForwardMinor);
  });
});
