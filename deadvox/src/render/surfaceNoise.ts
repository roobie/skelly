import { DataTexture, LinearFilter, RedFormat, RepeatWrapping, UnsignedByteType } from 'three';

// This is the lattice period of hash21, not a world-space detail setting.
export const SURFACE_NOISE_PERIOD = 512;
const f = Math.fround;
const fract = (value: number): number => f(value - Math.floor(value));

/** Float arithmetic follows the shader hash; byte quantization makes this an opt-in look. */
export const createSurfaceNoise = (): DataTexture => {
  const size = SURFACE_NOISE_PERIOD;
  const data = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let px = fract(f(x * f(0.1031)));
      let py = fract(f(y * f(0.1031)));
      let pz = px;
      const dot = f(f(f(px * f(py + f(33.33))) + f(py * f(pz + f(33.33)))) + f(pz * f(px + f(33.33))));
      px = f(px + dot);
      py = f(py + dot);
      pz = f(pz + dot);
      data[x + size * y] = Math.round(fract(f(f(px + py) * pz)) * 255);
    }
  }
  const texture = new DataTexture(data, size, size, RedFormat, UnsignedByteType);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
};
