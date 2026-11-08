/** Seeded PRNG (mulberry32): deterministic, identical to frontend/scripts/generate-data.mjs. */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 3 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Random = {
  next: () => number;
  pick: <T>(list: readonly T[]) => T;
  int: (lo: number, hi: number) => number;
};

export function createRandom(seed: number): Random {
  const next = prng(seed);
  return {
    next,
    pick: <T>(list: readonly T[]): T => {
      const value = list[Math.floor(next() * list.length)];
      if (value === undefined) throw new Error('pick() from an empty list');
      return value;
    },
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
  };
}
