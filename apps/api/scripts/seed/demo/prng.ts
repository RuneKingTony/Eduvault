export interface Random {
  int(limit: number): number;
  between(min: number, max: number): number;
  chance(probability: number): boolean;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
}

const UINT32 = 4_294_967_296;

/** Mulberry32: tiny, fast and good enough to make two runs build the same school. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / UINT32;
  };
}

export function createRandom(seed: number): Random {
  const next = mulberry32(seed);
  const int = (limit: number) => Math.floor(next() * limit);
  const pick = <T>(items: readonly T[]): T => {
    const item = items[int(items.length)];
    if (item === undefined) {
      throw new Error('Cannot pick from an empty list.');
    }
    return item;
  };
  return {
    int,
    between: (min, max) => min + int(max - min + 1),
    chance: (probability) => next() < probability,
    pick,
    shuffle: <T>(items: readonly T[]): T[] => {
      const copy = [...items];
      for (let index = copy.length - 1; index > 0; index -= 1) {
        const other = int(index + 1);
        const held = copy[index] as T;
        copy[index] = copy[other] as T;
        copy[other] = held;
      }
      return copy;
    },
  };
}
