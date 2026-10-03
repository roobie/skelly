// First-look forest workload. No foliage-specific renderer, LOD or cut-out path in this round.
import type { Chunk } from './chunk.ts';
import type { Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import type { Scale } from './scale.ts';
import { type Rect, rectDistance, type Site } from './site.ts';
import {
  FOREST_HALF_EXTENT_METRES,
  leafLitterAt,
  stampTrees,
  type TreePlacement,
  vegetationPlacements,
} from './vegetation.ts';
import { type Surface, terrainHeight } from './worldgen.ts';

export class Forest implements Site {
  readonly bounds: Rect;
  readonly trees: readonly TreePlacement[];
  readonly spawn: { pos: Vec3; yaw: number };
  readonly surface: Surface;

  constructor(seed: number, registry: Registry, scale: Scale, density: number) {
    const reach = FOREST_HALF_EXTENT_METRES / scale.blockSize;
    this.bounds = { x0: -reach, z0: -reach, x1: reach, z1: reach };
    // Flat inland ground isolates tree cost; extent covers the full 162m route plus the view radius.
    const floor = Math.max(Math.ceil(16 / scale.blockSize), terrainHeight(seed, scale, 0, 0));
    this.spawn = { pos: [0, (floor + 1) * scale.blockSize, 0], yaw: 0 };
    const clearing = 4 / scale.blockSize;
    this.trees = vegetationPlacements({
      seed,
      registry,
      scale,
      area: this.bounds,
      density,
      ground: () => floor,
      reserved: [{ x0: -clearing, z0: -clearing, x1: clearing, z1: clearing }],
    });
    const litter = registry.blockIds.get('leaf_litter')!;
    this.surface = {
      height: (x, z, natural) => (rectDistance(this.bounds, x, z) === 0 ? floor : natural),
      top: (x, z) => (leafLitterAt(this.trees, x, z) ? litter : undefined),
    };
  }

  stamp(chunk: Chunk): void {
    stampTrees(chunk, this.trees);
  }
  furnitureIn() {
    return [];
  }
  zombiesIn() {
    return [];
  }
}
