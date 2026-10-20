// Seeded randomness. Generation must be reproducible from a seed alone, on
// any machine, so this never touches Math.random.

export type Rng = () => number;

/** mulberry32: small, fast, and deterministic across platforms. */
export const seededRng = (seed: number): Rng => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d_2b_79_f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
};

export const pick = <T>(rng: Rng, items: readonly T[]): T => {
  if (items.length === 0) {
    throw new Error('pick from an empty list');
  }
  return items[Math.floor(rng() * items.length)]!;
};

/** True with the given probability. Always consumes one draw. */
export const chance = (rng: Rng, p: number): boolean => rng() < p;

/** A number in [min, max). Always consumes one draw. */
export const range = (rng: Rng, min: number, max: number): number => min + rng() * (max - min);

// ---- Stateless value noise, for mottling, tears and hair coverage ----
//
// This is independent of the Rng above: it's a pure function of (x, y, z,
// seed), not a stream, so a caller can query any point in any order and
// still get the same value every time (a requirement for painting features
// that test many voxels in whatever order the grid visits them).

/** Integer hash of a 3D lattice point to a value in [0, 1). */
const hash3 = (x: number, y: number, z: number, seed: number): number => {
  let h =
    (Math.imul(x, 374_761_393) ^
      Math.imul(y, 668_265_263) ^
      Math.imul(z, 2_147_483_647) ^
      Math.imul(seed, 2_654_435_761)) >>>
    0;
  h = Math.imul(h ^ (h >>> 13), 1_274_126_177);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4_294_967_296;
};

/** Hermite smoothstep, for a noise field with continuous derivatives at cell edges. */
const smoothstep = (t: number): number => t * t * (3 - 2 * t);

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Trilinear value noise in [0, 1), continuous and deterministic from the seed. */
export const noise3 = (x: number, y: number, z: number, seed: number): number => {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const fx = smoothstep(x - x0);
  const fy = smoothstep(y - y0);
  const fz = smoothstep(z - z0);
  const c000 = hash3(x0, y0, z0, seed);
  const c100 = hash3(x0 + 1, y0, z0, seed);
  const c010 = hash3(x0, y0 + 1, z0, seed);
  const c110 = hash3(x0 + 1, y0 + 1, z0, seed);
  const c001 = hash3(x0, y0, z0 + 1, seed);
  const c101 = hash3(x0 + 1, y0, z0 + 1, seed);
  const c011 = hash3(x0, y0 + 1, z0 + 1, seed);
  const c111 = hash3(x0 + 1, y0 + 1, z0 + 1, seed);
  const x00 = lerp(c000, c100, fx);
  const x10 = lerp(c010, c110, fx);
  const x01 = lerp(c001, c101, fx);
  const x11 = lerp(c011, c111, fx);
  const y0i = lerp(x00, x10, fy);
  const y1i = lerp(x01, x11, fy);
  return lerp(y0i, y1i, fz);
};
