import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping } from 'three';

/** Deterministic, so every client draws the same sky. */
const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d_2b_79_f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= Math.imul(t ^ (t >>> 7), 61 | t) + t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
};

const smooth = (t: number): number => t * t * (3 - 2 * t);
const between = (a: number, b: number, t: number): number => a + (b - a) * t;

/** One periodic value-noise octave sampled on [0, 1)², wrapping at `period`. */
const latticeNoise = (period: number, random: () => number): ((x: number, y: number) => number) => {
  const lattice = Float32Array.from({ length: period * period }, random);
  return (x: number, y: number) => {
    const fx = x * period;
    const fy = y * period;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = smooth(fx - x0);
    const ty = smooth(fy - y0);
    const at = (ix: number, iy: number): number => {
      const width = ((ix % period) + period) % period;
      const height = ((iy % period) + period) % period;
      return lattice[height * period + width]!;
    };
    return between(between(at(x0, y0), at(x0 + 1, y0), tx), between(at(x0, y0 + 1), at(x0 + 1, y0 + 1), tx), ty);
  };
};

const OCTAVES = 4;

/** Tileable fractal noise in [0, 1] on a `size`² grid. */
const fractalNoise = (basePeriod: number, seed: number, size: number): Float32Array => {
  const random = mulberry32(seed);
  const octaves = Array.from({ length: OCTAVES }, (_, index) => latticeNoise(basePeriod * 2 ** index, random));
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let value = 0;
      let weight = 0;
      for (const [index, noise] of octaves.entries()) {
        const amplitude = 1 / 2 ** index;
        value += noise(x / size, y / size) * amplitude;
        weight += amplitude;
      }
      out[y * size + x] = value / weight;
    }
  }
  return out;
};

const TEXTURE_SIZE = 256;
const BROAD_PERIOD = 5;
const WISP_PERIOD = 13;
const WISP_SEED_OFFSET = 101;

/**
 * A tileable cloud texture: red holds the broad masses, green the wispy break-up. Mipmapped, so a layer
 * seen at the grazing angles near the horizon is filtered instead of shimmering.
 */
export const cloudTexture = (seed: number): DataTexture => {
  const broad = fractalNoise(BROAD_PERIOD, seed, TEXTURE_SIZE);
  const wisp = fractalNoise(WISP_PERIOD, seed + WISP_SEED_OFFSET, TEXTURE_SIZE);
  const data = new Uint8Array(TEXTURE_SIZE * TEXTURE_SIZE * 4);
  for (let i = 0; i < TEXTURE_SIZE * TEXTURE_SIZE; i++) {
    data[i * 4] = broad[i]! * 255;
    data[i * 4 + 1] = wisp[i]! * 255;
    data[i * 4 + 3] = 255;
  }
  const texture = new DataTexture(data, TEXTURE_SIZE, TEXTURE_SIZE);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
};
