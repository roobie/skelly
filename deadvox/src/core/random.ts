// Seeded, stateless noise. The same seed and coordinates always give the same value.

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
