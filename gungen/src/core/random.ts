// Seeded randomness. Generation must be reproducible from a seed alone, on
// any machine, so this never touches Math.random.

export type Rng = () => number;

/** mulberry32: small, fast, and deterministic across platforms. */
export const seededRng = (seed: number): Rng => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const pick = <T>(rng: Rng, items: readonly T[]): T => {
  if (items.length === 0) throw new Error('pick from an empty list');
  return items[Math.floor(rng() * items.length)]!;
};

/** True with the given probability. Always consumes one draw. */
export const chance = (rng: Rng, p: number): boolean => rng() < p;
