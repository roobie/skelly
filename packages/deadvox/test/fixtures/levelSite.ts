import { CHUNK, type World } from '@skelly/engine/world';
import { scale } from '../snapshotTestSupport.ts';

const groundTop = (world: World, x: number, z: number): number | undefined => {
  for (let y = (scale.maxCy + 1) * CHUNK - 1; y >= scale.minCy * CHUNK; y--) {
    if (world.getBlock(x, y, z) !== 0) {
      return y;
    }
  }
  return undefined;
};

/** The shared ground top across a rectangle of cells, or undefined when it is not level. */
const levelTop = (world: World, [x0, x1]: [number, number], [z0, z1]: [number, number]) => {
  const tops = new Set<number | undefined>();
  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) {
      tops.add(groundTop(world, x, z));
    }
  }
  return tops.size === 1 ? [...tops][0] : undefined;
};

/** A cell inside the column with level ground for `spread` cells either side along x and `depth` cells along z. */
export const levelSite = (world: World, [cx, cz]: [number, number], spread: number, depth: number) => {
  const margin = spread + 3;
  for (let z = cz * CHUNK + margin; z < (cz + 1) * CHUNK - margin; z++) {
    for (let x = cx * CHUNK + margin; x < (cx + 1) * CHUNK - margin; x++) {
      const north = z - Math.floor(depth / 2);
      const top = levelTop(world, [x - spread, x + spread], [north, north + depth - 1]);
      if (top !== undefined) {
        return { x, z, north, ground: top + 1 };
      }
    }
  }
  throw new Error(`Column ${cx},${cz} has no level ground for the fixture`);
};
