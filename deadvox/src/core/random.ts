// Seeded randomness: stateless noise for worldgen, and random streams for systems.

/** Hash of integer coordinates to [0, 1). */
export const hash3 = (seed: number, x: number, y: number, z: number): number => {
  let h = seed ^ Math.imul(x, 0x27_d4_eb_2d) ^ Math.imul(y, 0x16_56_67_b1) ^ Math.imul(z, 0x9e_37_79_b1);
  h = Math.imul(h ^ (h >>> 15), 0x85_eb_ca_6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2_b2_ae_35);
  h ^= h >>> 16;
  return (h >>> 0) / 4_294_967_296;
};

const smooth = (t: number): number => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Smooth 2D value noise in [0, 1). */
export const valueNoise2 = (seed: number, x: number, z: number): number => {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = smooth(x - x0);
  const tz = smooth(z - z0);
  const a = lerp(hash3(seed, x0, 0, z0), hash3(seed, x0 + 1, 0, z0), tx);
  const b = lerp(hash3(seed, x0, 0, z0 + 1), hash3(seed, x0 + 1, 0, z0 + 1), tx);
  return lerp(a, b, tz);
};

/** Fractal (octave-summed) value noise in [0, 1). */
export const fbm2 = (seed: number, x: number, z: number, octaves: number): number => {
  let sum = 0;
  let norm = 0;
  let amp = 1;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2(seed + i * 1013, x * freq, z * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
};

// ---- random streams ----

/** The four words of an sfc32 generator's state; saves store it as is. */
export type RngState = readonly [number, number, number, number];

/** FNV-1a hash of a string. */
const hashString = (text: string): number => {
  let h = 0x81_1c_9d_c5;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 0x01_00_01_93);
  }
  return h >>> 0;
};

/**
 * A seeded random stream (sfc32). Every system draws from its own stream, derived
 * from the world seed and the system's id, never from `Math.random` (DESIGN.md,
 * "Determinism").
 */
export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(state: RngState) {
    [this.a, this.b, this.c, this.d] = state;
  }

  /** The stream for a system: the same seed and id always give the same numbers. */
  static stream(seed: number, id: string): Rng {
    const h = hashString(id);
    const rng = new Rng([seed | 0, h | 0, Math.imul(seed ^ h, 0x9e_37_79_b1), 1]);
    for (let i = 0; i < 12; i++) {
      rng.next();
    }
    return rng;
  }

  /** A number in [0, 1). */
  next(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return (t >>> 0) / 4_294_967_296;
  }

  /** An integer in [min, max], both inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** A number in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  state(): RngState {
    return [this.a, this.b, this.c, this.d];
  }
}
