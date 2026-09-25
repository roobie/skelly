// Slice 1's hamlet (SLICE-1.md, milestone 1.5): a short asphalt road with five
// buildings on it, near spawn. Everything here is a pure function of the seed and a
// position: where the hamlet goes, the ground under its road and lots, which blocks
// its buildings put in a chunk, and what each container holds. So any chunk can be
// generated on its own, in any order, and comes out the same.

import type { EntitySpec } from './blockEntities.ts';
import type { Chunk } from './chunk.ts';
import type { Registry } from './content.ts';
import { CHUNK, toChunk, type Vec3 } from './coords.ts';
import { type Rolled, rollLoot } from './loot.ts';
import { Rng } from './random.ts';
import type { Scale } from './scale.ts';
import { compileTemplate, footprint, type Placement, placedPieces, stampPlacement, type Turn } from './templates.ts';
import { type Surface, terrainHeight } from './worldgen.ts';

/** Templates are drawn in half-metre blocks. */
export const HAMLET_BLOCK_SIZE = 0.5;

/** Layout tunables, in blocks. */
export const HAMLET = {
  /** The road's width. */
  road: 12,
  /** Road beyond the first and last lot, at each end. */
  roadEnds: 16,
  /** Ground around a building that's flattened with it. */
  pad: 2,
  /** Between a lot and the road, and between lots: the ground ramps here. */
  gap: 8,
  /** How far flattening reaches into the natural ground. At most `gap`, so lots stay flat. */
  blend: 8,
  /** The road's height follows the ground, averaged over this many blocks each way. */
  roadSmoothing: 12,
} as const;

/** Buildings north of the road (their fronts face south, onto it), then south of it. */
const NORTH_SIDE = ['small_house', 'bungalow', 'corner_store'] as const;
const SOUTH_SIDE = ['gas_station', 'shed'] as const;
/** Every template the hamlet uses. */
export const HAMLET_TEMPLATES: readonly string[] = [...NORTH_SIDE, ...SOUTH_SIDE];

/** Where the hamlet may go: offsets from the world origin in metres, on a grid. */
const SITE = { step: 32, reach: 160, sample: 4, lowest: 15 } as const;

export interface Rect {
  x0: number;
  z0: number;
  /** Exclusive. */
  x1: number;
  z1: number;
}

export interface Lot {
  readonly placement: Placement;
  /** The flattened ground, in blocks. */
  readonly rect: Rect;
  /** Height of its top ground block; the template's layer 0 replaces it. */
  readonly floor: number;
}

/** A piece of furniture and what worldgen put in it. */
export interface FurnitureSpawn {
  spec: EntitySpec;
  loot: Rolled[];
}

const smoothstep = (t: number) => t * t * (3 - 2 * t);

/** Blocks from a column to a rectangle; 0 inside. */
const rectDistance = (r: Rect, x: number, z: number): number => {
  const dx = x < r.x0 ? r.x0 - x : Math.max(0, x - (r.x1 - 1));
  const dz = z < r.z0 ? r.z0 - z : Math.max(0, z - (r.z1 - 1));
  return Math.hypot(dx, dz);
};

const grow = (r: Rect, by: number): Rect => ({ x0: r.x0 - by, z0: r.z0 - by, x1: r.x1 + by, z1: r.z1 + by });

export class Hamlet {
  readonly road: Rect;
  readonly lots: readonly Lot[];
  /** Everything the hamlet touches, flattening included, in blocks. */
  readonly bounds: Rect;
  /** Where the player starts: feet in metres, and a yaw that looks down the road. */
  readonly spawn: { pos: Vec3; yaw: number };
  private readonly seed: number;
  private readonly scale: Scale;
  private readonly registry: Registry;
  private readonly asphalt: number;
  /** Road heights from `roadHeights[0]` at x = road.x0. */
  private readonly roadHeights: Int32Array;

  constructor(seed: number, registry: Registry, scale: Scale) {
    if (scale.blockSize !== HAMLET_BLOCK_SIZE) {
      throw new Error(`the hamlet's templates need ${HAMLET_BLOCK_SIZE} m blocks`);
    }
    this.seed = seed;
    this.scale = scale;
    this.registry = registry;
    this.asphalt = registry.blockIds.get('asphalt')!;
    const layout = this.layout();
    const [ox, oz] = this.site(layout.width, layout.depth);
    this.road = { x0: ox, z0: oz + layout.roadZ, x1: ox + layout.width, z1: oz + layout.roadZ + HAMLET.road };
    this.roadHeights = this.smoothRoad();
    this.lots = layout.lots.map(({ template, x, z, turn }) => {
      const compiled = compileTemplate(registry, registry.templates.get(template)!);
      const probe: Placement = { template: compiled, origin: [0, 0, 0], turn };
      const [w, d] = footprint(probe);
      const rect = { x0: ox + x, z0: oz + z, x1: ox + x + w, z1: oz + z + d };
      const cx = Math.floor((rect.x0 + rect.x1) / 2);
      const cz = Math.floor((rect.z0 + rect.z1) / 2);
      const floor = terrainHeight(seed, scale, cx, cz);
      return {
        placement: { template: compiled, origin: [rect.x0, floor, rect.z0], turn },
        rect: grow(rect, HAMLET.pad),
        floor,
      };
    });
    this.bounds = grow(
      {
        x0: Math.min(this.road.x0, ...this.lots.map((l) => l.rect.x0)),
        z0: Math.min(this.road.z0, ...this.lots.map((l) => l.rect.z0)),
        x1: Math.max(this.road.x1, ...this.lots.map((l) => l.rect.x1)),
        z1: Math.max(this.road.z1, ...this.lots.map((l) => l.rect.z1)),
      },
      HAMLET.blend,
    );
    const sx = this.road.x0 + 2;
    const roadTop = this.roadHeights[2]!;
    this.spawn = {
      pos: [
        (sx + 0.5) * scale.blockSize,
        (roadTop + 1) * scale.blockSize,
        ((this.road.z0 + this.road.z1) / 2) * scale.blockSize,
      ],
      yaw: -Math.PI / 2, // east, down the road
    };
  }

  /** The ground under the road and lots, blended into the natural ground around them. */
  get surface(): Surface {
    return {
      height: (x, z, natural) => this.height(x, z, natural),
      top: (x, z) => (rectDistance(this.road, x, z) === 0 ? this.asphalt : undefined),
    };
  }

  /** Writes the buildings' blocks that fall inside a chunk. */
  stamp(chunk: Chunk): void {
    const x0 = chunk.cx * CHUNK;
    const z0 = chunk.cz * CHUNK;
    for (const lot of this.lots) {
      const { origin, template } = lot.placement;
      const [w, d] = footprint(lot.placement);
      const y0 = chunk.cy * CHUNK;
      const clear =
        origin[0] >= x0 + CHUNK ||
        origin[0] + w <= x0 ||
        origin[2] >= z0 + CHUNK ||
        origin[2] + d <= z0 ||
        origin[1] >= y0 + CHUNK ||
        origin[1] + template.size[1] <= y0;
      if (!clear) {
        stampPlacement(chunk, lot.placement);
      }
    }
  }

  /**
   * Furniture anchored in the column (cx, cz), with loot rolled for each container
   * from a stream of its own, keyed by where it is.
   */
  furnitureIn(cx: number, cz: number): FurnitureSpawn[] {
    const out: FurnitureSpawn[] = [];
    for (const lot of this.lots) {
      for (const piece of placedPieces(lot.placement)) {
        if (toChunk(piece.pos[0]) !== cx || toChunk(piece.pos[2]) !== cz) {
          continue;
        }
        const rng = Rng.stream(this.seed, `loot:${piece.pos.join(',')}`);
        out.push({
          spec: { type: piece.furniture, pos: piece.pos, size: piece.size, facing: piece.facing },
          loot: piece.loot === undefined ? [] : rollLoot(this.registry, piece.loot, rng),
        });
      }
    }
    return out;
  }

  // ---- internals ----

  /** Lots relative to the hamlet's north-west corner, and the road between them. */
  private layout() {
    const rng = Rng.stream(this.seed, 'hamlet');
    const north = [...NORTH_SIDE];
    for (let i = north.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [north[i], north[j]] = [north[j]!, north[i]!];
    }
    const size = (id: string, turn: Turn) =>
      footprint({
        template: compileTemplate(this.registry, this.registry.templates.get(id)!),
        origin: [0, 0, 0],
        turn,
      });
    const row = (ids: readonly string[], turn: Turn) => {
      let x = HAMLET.roadEnds + HAMLET.pad;
      return ids.map((template) => {
        const [w, d] = size(template, turn);
        const lot = { template, x, w, d, turn };
        x += w + 2 * HAMLET.pad + HAMLET.gap;
        return lot;
      });
    };
    const northRow = row(north, 2);
    const southRow = row(SOUTH_SIDE, 0);
    const deepest = Math.max(...northRow.map((l) => l.d));
    const roadZ = HAMLET.pad + deepest + HAMLET.pad + HAMLET.gap;
    const southZ = roadZ + HAMLET.road + HAMLET.gap + HAMLET.pad;
    const lots = [
      ...northRow.map((l) => ({ ...l, z: roadZ - HAMLET.gap - HAMLET.pad - l.d })),
      ...southRow.map((l) => ({ ...l, z: southZ })),
    ];
    const width = Math.max(...lots.map((l) => l.x + l.w)) + HAMLET.pad + HAMLET.roadEnds;
    const depth = Math.max(...lots.map((l) => l.z + l.d)) + HAMLET.pad;
    return { lots, roadZ, width, depth };
  }

  /**
   * The north-west corner (in blocks) of the flattest site near the origin that isn't
   * down on the beach. Ties go to the site nearest the origin.
   */
  private site(width: number, depth: number): [number, number] {
    const s = this.scale.blockSize;
    let best: [number, number] = [0, 0];
    let bestScore = Number.POSITIVE_INFINITY;
    const steps = SITE.reach / SITE.step;
    for (let j = -steps; j <= steps; j++) {
      for (let i = -steps; i <= steps; i++) {
        // Centred on the grid point.
        const corner: [number, number] = [
          Math.round((i * SITE.step) / s - width / 2),
          Math.round((j * SITE.step) / s - depth / 2),
        ];
        const { lo, hi } = this.heightRange(corner, width, depth);
        const score = hi - lo + (lo < SITE.lowest ? 100 : 0) + Math.hypot(i, j) * 0.01;
        if (score < bestScore) {
          bestScore = score;
          best = corner;
        }
      }
    }
    return best;
  }

  /** The lowest and highest natural ground over an area, in metres, sampled every few metres. */
  private heightRange([x0, z0]: [number, number], width: number, depth: number): { lo: number; hi: number } {
    const s = this.scale.blockSize;
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    for (let z = 0; z <= depth; z += SITE.sample / s) {
      for (let x = 0; x <= width; x += SITE.sample / s) {
        const h = terrainHeight(this.seed, this.scale, x0 + x, z0 + z) * s;
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
      }
    }
    return { lo, hi };
  }

  /** The road's top block along its length: the ground on its centre line, averaged. */
  private smoothRoad(): Int32Array {
    const { x0, x1, z0, z1 } = this.road;
    const cz = Math.floor((z0 + z1) / 2);
    const r = HAMLET.roadSmoothing;
    const natural = (x: number) => terrainHeight(this.seed, this.scale, x, cz);
    const out = new Int32Array(x1 - x0);
    for (let x = x0; x < x1; x++) {
      let sum = 0;
      for (let dx = -r; dx <= r; dx++) {
        sum += natural(x + dx);
      }
      out[x - x0] = Math.round(sum / (2 * r + 1));
    }
    return out;
  }

  private roadHeightAt(x: number): number {
    const i = Math.min(Math.max(x - this.road.x0, 0), this.roadHeights.length - 1);
    return this.roadHeights[i]!;
  }

  /**
   * Blends the natural ground toward the road's and lots' heights. Each pulls with a
   * weight that falls from 1 at its edge to 0 `blend` blocks out; lots and the road
   * are at least that far apart, so each stays flat.
   */
  private height(x: number, z: number, natural: number): number {
    if (rectDistance(this.bounds, x, z) > 0) {
      return natural;
    }
    let weights = 0;
    let pull = 0;
    const add = (rect: Rect, target: number) => {
      const d = rectDistance(rect, x, z);
      if (d < HAMLET.blend) {
        const w = smoothstep(1 - d / HAMLET.blend);
        weights += w;
        pull += w * (target - natural);
      }
    };
    add(this.road, this.roadHeightAt(x));
    for (const lot of this.lots) {
      add(lot.rect, lot.floor);
    }
    return Math.round(natural + pull / Math.max(1, weights));
  }
}
