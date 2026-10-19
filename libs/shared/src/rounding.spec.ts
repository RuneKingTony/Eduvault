import { roundHalfUp } from './rounding';

describe('roundHalfUp', () => {
  it('is exact when the product divides evenly', () => {
    expect(roundHalfUp([3_500_000], 10)).toBe(350_000);
    expect(roundHalfUp([18_000_000, 5], 100)).toBe(900_000);
  });

  it('rounds exactly half up and anything below it down', () => {
    expect(roundHalfUp([5], 2)).toBe(3);
    expect(roundHalfUp([1], 2)).toBe(1);
    expect(roundHalfUp([7], 3)).toBe(2);
    expect(roundHalfUp([8], 3)).toBe(3);
    expect(roundHalfUp([1], 3)).toBe(0);
    expect(roundHalfUp([333, 50], 100)).toBe(167);
  });

  it('agrees with the plain floor formula wherever that is exact', () => {
    for (let numerator = -40; numerator <= 400; numerator += 1) {
      for (const denominator of [1, 2, 3, 7, 100]) {
        expect(roundHalfUp([numerator], denominator)).toBe(
          Math.floor((2 * numerator + denominator) / (2 * denominator))
        );
      }
    }
  });

  it('stays exact where the product passes 2^53', () => {
    const value = 100_000 * 100_000_000;
    expect(roundHalfUp([value, 99_999], 100_000)).toBe(99_999 * 100_000_000);
  });
});
