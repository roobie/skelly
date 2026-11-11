import type { Chunk } from './chunk.ts';
import type { Rect } from './site.ts';
import { type BlockBox, stampChunk } from './structure.ts';
import type { Surface } from './worldgen.ts';

export function createWeatheringTerrain(data: {
  readonly blockSize: number;
  readonly padTop: number;
  readonly heightPad: Rect;
  readonly materialPad: Rect;
  readonly concrete: number;
  readonly structures: readonly BlockBox[];
}) {
  const { blockSize, padTop, heightPad, materialPad, concrete, structures } = data;
  const surface: Surface = {
    height: (x, z, natural) =>
      x * blockSize >= heightPad.x0 &&
      x * blockSize < heightPad.x1 &&
      z * blockSize >= heightPad.z0 &&
      z * blockSize < heightPad.z1
        ? padTop
        : natural,
    top: (x, z) =>
      x * blockSize >= materialPad.x0 &&
      x * blockSize < materialPad.x1 &&
      z * blockSize >= materialPad.z0 &&
      z * blockSize < materialPad.z1
        ? concrete
        : undefined,
  };
  return {
    surface,
    stamp: (chunk: Chunk): void => {
      stampChunk(chunk, structures);
    },
  };
}
