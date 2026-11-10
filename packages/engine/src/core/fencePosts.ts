import { CHUNK, type Vec3 } from './coords.ts';
import { paddedIndex } from './meshInput.ts';
import type { BlockDef } from './schema.ts';

export type FencePostDefs = BlockDef['fencePosts'][];

interface FencePost {
  id: number;
  min: Vec3;
  max: Vec3;
  capBottom: boolean;
  capTop: boolean;
}

const needsPost = (neighbours: readonly boolean[], [x, z]: readonly number[], interval: number): boolean => {
  const [west, east, north, south] = neighbours;
  if (west && east && !north && !south) {
    return x! % interval === 0;
  }
  if (north && south && !west && !east) {
    return z! % interval === 0;
  }
  return true;
};

/** World-lattice spacing avoids a scan to an unloaded run end and never restarts at chunk boundaries. */
export const deriveFencePosts = (padded: Uint16Array, definitions: FencePostDefs, origin: Vec3): FencePost[] => {
  const posts: FencePost[] = [];
  if (!definitions.some(Boolean)) {
    return posts;
  }
  const at = (x: number, y: number, z: number): number => padded[paddedIndex(x + 1, y + 1, z + 1)]!;
  const connects = (x: number, y: number, z: number): boolean => definitions[at(x, y, z)] !== undefined;
  const supports = (x: number, y: number, z: number): boolean => {
    const definition = definitions[at(x, y, z)];
    return Boolean(
      definition &&
        needsPost(
          [connects(x - 1, y, z), connects(x + 1, y, z), connects(x, y, z - 1), connects(x, y, z + 1)],
          [origin[0] + x, origin[2] + z],
          definition.spacingBlocks,
        ),
    );
  };
  const column = (x: number, z: number): void => {
    let previous: FencePost | undefined;
    for (let y = 0; y < CHUNK; y++) {
      const id = at(x, y, z);
      if (!supports(x, y, z)) {
        previous = undefined;
        continue;
      }
      if (previous?.id === id && previous.max[1] === y) {
        previous.max[1] = y + 1;
        previous.capTop = !(at(x, y + 1, z) === id && supports(x, y + 1, z));
        continue;
      }
      const half = definitions[id]!.widthBlocks / 2;
      previous = {
        id,
        min: [x + 0.5 - half, y, z + 0.5 - half],
        max: [x + 0.5 + half, y + 1, z + 0.5 + half],
        capBottom: !(at(x, y - 1, z) === id && supports(x, y - 1, z)),
        capTop: !(at(x, y + 1, z) === id && supports(x, y + 1, z)),
      };
      posts.push(previous);
    }
  };
  for (let z = 0; z < CHUNK; z++) {
    for (let x = 0; x < CHUNK; x++) {
      column(x, z);
    }
  }
  return posts;
};
