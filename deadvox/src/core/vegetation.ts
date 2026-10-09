// Seed-owned vegetation placements; every chunk stamps the same clipped boxes independently.
import type { Chunk } from './chunk.ts';
import type { Registry } from './content.ts';
import { CHUNK, type Vec3 } from './coords.ts';
import { Rng, valueNoise2 } from './random.ts';
import type { Scale } from './scale.ts';
import { type Rect, rectDistance } from './site.ts';
import { type BlockBox, type MetreBox, rasterize, stampChunk } from './structure.ts';

export type TreeShape = 'broadleaf' | 'conifer' | 'young';
export const TREE_MIX: readonly TreeShape[] = ['broadleaf', 'broadleaf', 'conifer', 'young'];
export const TREE_CELL_METRES = 8;
export const DEFAULT_TREE_DENSITY = 0.5;
export const FOREST_HALF_EXTENT_METRES = 384;

/** Frozen d24-2 field: smooth seeded value noise with broad 0.75 plateaus. Coordinates are metres. */
export const FOREST_DENSITY_FIELD = {
  wavelengthMetres: 128,
  seedSalt: 137,
  floor: 0.2,
  gain: 1,
  ceiling: 0.75,
} as const;
export const forestDensityAt = (seed: number, x: number, z: number): number => {
  const field = FOREST_DENSITY_FIELD;
  return Math.min(
    field.ceiling,
    field.floor +
      field.gain * valueNoise2(seed + field.seedSalt, x / field.wavelengthMetres, z / field.wavelengthMetres),
  );
};

export interface TreePlacement {
  readonly shape: TreeShape;
  readonly origin: Vec3;
  readonly bounds: Rect;
  readonly boxes: readonly BlockBox[];
}

/** The complete canopy footprint must clear a reserved rectangle, not just the trunk. */
export const rectsOverlap = (a: Rect, b: Rect): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;

const crown = (leaf: number, centreY: number, [rx, ry, rz]: Vec3): MetreBox[] => {
  const boxes: MetreBox[] = [];
  for (let y = centreY - ry; y < centreY + ry; y += 0.5) {
    for (let z = -rz; z < rz; z += 0.5) {
      const remaining = 1 - ((y + 0.25 - centreY) / ry) ** 2 - ((z + 0.25) / rz) ** 2;
      if (remaining > 0) {
        const width = rx * Math.sqrt(remaining);
        boxes.push({ min: [-width, y, z], max: [width, y + 0.5, z + 0.5], block: leaf });
      }
    }
  }
  return boxes;
};

/** Metre-authored shapes reuse structure rasterization and chunk clipping, not another stamping engine. */
const treeShapes = (registry: Registry, scale: Scale): Readonly<Record<TreeShape, readonly BlockBox[]>> => {
  const trunk = registry.blockIds.get('tree_trunk')!;
  const branch = registry.blockIds.get('tree_branch')!;
  const leaf = registry.blockIds.get('leaves')!;
  const pine: MetreBox[] = [];
  for (let y = 2; y < 8.5; y += 0.5) {
    const width = Math.max(0.25, (8.5 - y) * 0.38);
    pine.push({ min: [-width, y, -width], max: [width, y + 0.5, width], block: leaf });
  }
  const wood = (height: number, reach: number): MetreBox[] => [
    { min: [-reach, height - 1.5, -0.25], max: [reach, height - 1, 0.25], block: branch },
    { min: [-0.25, height - 2, -reach], max: [0.25, height - 1.5, reach], block: branch },
    { min: [-0.25, 0, -0.25], max: [0.25, height, 0.25], block: trunk },
  ];
  const authored: Record<TreeShape, MetreBox[]> = {
    broadleaf: [...crown(leaf, 5.5, [3, 2, 2.5]), ...wood(5, 2)],
    conifer: [...pine, ...wood(8.5, 1)],
    young: [...crown(leaf, 3.25, [1.5, 1.5, 1.5]), ...wood(3.25, 1)],
  };
  // Anchor on the centre of a ground block, so a 0.5m trunk occupies one 0.5m cell.
  const compile = (boxes: MetreBox[]) =>
    rasterize(
      boxes.map((box) => ({
        ...box,
        min: [box.min[0] + scale.blockSize / 2, box.min[1], box.min[2] + scale.blockSize / 2] as Vec3,
        max: [box.max[0] + scale.blockSize / 2, box.max[1], box.max[2] + scale.blockSize / 2] as Vec3,
      })),
      scale.blockSize,
    );
  return { broadleaf: compile(authored.broadleaf), conifer: compile(authored.conifer), young: compile(authored.young) };
};

export const placeTree = (shape: TreeShape, origin: Vec3, prototype: readonly BlockBox[]): TreePlacement => {
  const boxes = prototype.map((box) => ({
    ...box,
    min: box.min.map((value, axis) => value + origin[axis]!) as Vec3,
    max: box.max.map((value, axis) => value + origin[axis]!) as Vec3,
  }));
  return {
    shape,
    origin,
    boxes,
    bounds: {
      x0: Math.min(...boxes.map((box) => box.min[0])),
      x1: Math.max(...boxes.map((box) => box.max[0])),
      z0: Math.min(...boxes.map((box) => box.min[2])),
      z1: Math.max(...boxes.map((box) => box.max[2])),
    },
  };
};

export const vegetationPlacements = ({
  seed,
  registry,
  scale,
  area,
  density,
  ground,
  reserved,
  shapeMix,
}: {
  seed: number;
  registry: Registry;
  scale: Scale;
  area: Rect;
  density: number | ((x: number, z: number) => number);
  ground: (x: number, z: number) => number;
  reserved: readonly Rect[];
  shapeMix?: (x: number, z: number) => readonly TreeShape[];
}): TreePlacement[] => {
  const shapes = treeShapes(registry, scale);
  const step = TREE_CELL_METRES / scale.blockSize;
  const jitter = Math.round(1.5 / scale.blockSize);
  const trees: TreePlacement[] = [];
  for (let cz = Math.floor(area.z0 / step); cz < Math.ceil(area.z1 / step); cz++) {
    for (let cx = Math.floor(area.x0 / step); cx < Math.ceil(area.x1 / step); cx++) {
      const rng = Rng.stream(seed, `vegetation:${cx},${cz}`);
      const occupancy =
        typeof density === 'number' ? density : density((cx + 0.5) * TREE_CELL_METRES, (cz + 0.5) * TREE_CELL_METRES);
      if (!rng.chance(occupancy)) {
        continue;
      }
      const x = Math.floor((cx + 0.5) * step) + rng.int(-jitter, jitter);
      const z = Math.floor((cz + 0.5) * step) + rng.int(-jitter, jitter);
      const mix = shapeMix?.((cx + 0.5) * TREE_CELL_METRES, (cz + 0.5) * TREE_CELL_METRES) ?? TREE_MIX;
      const shape = mix[rng.int(0, mix.length - 1)]!;
      const tree = placeTree(shape, [x, ground(x, z) + 1, z], shapes[shape]);
      if (
        tree.bounds.x0 >= area.x0 &&
        tree.bounds.x1 <= area.x1 &&
        tree.bounds.z0 >= area.z0 &&
        tree.bounds.z1 <= area.z1 &&
        !reserved.some((rect) => rectsOverlap(rect, tree.bounds))
      ) {
        trees.push(tree);
      }
    }
  }
  return trees;
};

const EMPTY_TREES: readonly TreePlacement[] = [];

/** Seed-owned footprint buckets, built once. Query cost depends on nearby trees, not site extent. */
export class TreeIndex {
  private readonly columns = new Map<string, TreePlacement[]>();

  constructor(trees: readonly TreePlacement[]) {
    for (const tree of trees) {
      // Bounds are exclusive block rectangles, shared by litter and clipped voxel writes.
      for (let cz = Math.floor(tree.bounds.z0 / CHUNK); cz < Math.ceil(tree.bounds.z1 / CHUNK); cz++) {
        for (let cx = Math.floor(tree.bounds.x0 / CHUNK); cx < Math.ceil(tree.bounds.x1 / CHUNK); cx++) {
          const key = `${cx},${cz}`;
          const bucket = this.columns.get(key) ?? [];
          bucket.push(tree);
          this.columns.set(key, bucket);
        }
      }
    }
  }

  inColumn(cx: number, cz: number): readonly TreePlacement[] {
    return this.columns.get(`${cx},${cz}`) ?? EMPTY_TREES;
  }

  at(x: number, z: number): readonly TreePlacement[] {
    return this.inColumn(Math.floor(x / CHUNK), Math.floor(z / CHUNK));
  }
}

export const stampTrees = (chunk: Chunk, trees: readonly TreePlacement[]): void => {
  const column = { x0: chunk.cx * CHUNK, x1: (chunk.cx + 1) * CHUNK, z0: chunk.cz * CHUNK, z1: (chunk.cz + 1) * CHUNK };
  for (const tree of trees) {
    if (rectsOverlap(column, tree.bounds)) {
      stampChunk(chunk, tree.boxes);
    }
  }
};

/** Litter follows the seed-owned tree footprint; surface generation does not depend on loaded neighbours. */
export const leafLitterAt = (trees: readonly TreePlacement[], x: number, z: number): boolean =>
  trees.some((tree) => tree.shape !== 'conifer' && rectDistance(tree.bounds, x, z) === 0);
