import type { Chunk } from './chunk.ts';
import { type Rect, rectDistance } from './site.ts';
import { leafLitterAt, stampTrees, TreeIndex, type TreePlacement } from './vegetation.ts';
import type { Surface } from './worldgen.ts';

export function createForestTerrain(data: {
  readonly bounds: Rect;
  readonly floor: number;
  readonly trees: readonly TreePlacement[];
  readonly litter: number;
}) {
  const { bounds, floor, trees, litter } = data;
  const treeIndex = new TreeIndex(trees);
  const surface: Surface = {
    height: (x, z, natural) => (rectDistance(bounds, x, z) === 0 ? floor : natural),
    top: (x, z) => (leafLitterAt(treeIndex.at(x, z), x, z) ? litter : undefined),
  };
  return {
    surface,
    stamp: (chunk: Chunk): void => {
      stampTrees(chunk, treeIndex.inColumn(chunk.cx, chunk.cz));
    },
  };
}
