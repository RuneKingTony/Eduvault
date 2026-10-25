import { createRandom, mulberry32 } from './prng';

const run = (next: () => number) => Array.from({ length: 5 }, next);

describe('mulberry32', () => {
  it('gives the same sequence for the same seed', () => {
    expect(run(mulberry32(7))).toEqual(run(mulberry32(7)));
  });

  it('stays in [0, 1) and differs between seeds', () => {
    const next = mulberry32(1);
    for (let index = 0; index < 1000; index += 1) {
      const value = next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

describe('createRandom', () => {
  it('keeps between inside its bounds and reaches both ends', () => {
    const random = createRandom(3);
    const seen = new Set(
      Array.from({ length: 500 }, () => random.between(2, 5))
    );
    expect([...seen].toSorted((a, b) => a - b)).toEqual([2, 3, 4, 5]);
  });

  it('shuffles without losing or changing the input', () => {
    const items = [1, 2, 3, 4, 5, 6];
    const shuffled = createRandom(9).shuffle(items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6]);
    expect(shuffled.toSorted((a, b) => a - b)).toEqual(items);
  });

  it('refuses to pick from nothing', () => {
    expect(() => createRandom(1).pick([])).toThrow(/empty/);
  });
});
