import {
  balanceToday,
  broughtForward,
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
