import { smoothstep } from './authoredTerrain.mjs';
import type { Chunk } from './chunk.ts';
import { type CityPlan, cityRowStart } from './cityPlan.ts';
import type { Registry } from './content.ts';
import { CHUNK, toChunk, type Vec3 } from './coords.ts';
import { type LootSpawnPoint, lootPointsByColumn } from './loot.ts';
import type { PublicCartographicFeature } from './publicCartography.ts';
import type { Scale } from './scale.ts';
import { cityRowDepth } from './settlementPools.ts';
import { TEMPLATE_BLOCK_SIZE } from './settlementSpawns.ts';
import {
  type FurnitureSpawn,
  furnitureOf,
  lootSourcesOf,
  type Rect,
  rectDistance,
  type Site,
  SupplyFootprints,
  type ZombieSpawn,
} from './site.ts';
import { sitePalette } from './sitePalette.ts';
import { stampChunk } from './structure.ts';
import { footprint, type Placement, placedPieces, stampPlacement } from './templates.ts';
import type { Surface } from './worldgen.ts';

const mod = (n: number, m: number) => ((n % m) + m) % m;

export class CitySite implements Site {
  readonly seed: number;
  readonly registry: Registry;
  readonly plan: CityPlan;
  readonly spawn: Site['spawn'];
  readonly publicCartography: readonly PublicCartographicFeature[];
  protected readonly byColumn = new Map<string, Placement[]>();
  private readonly paving: number;
  private readonly lootColumns: ReadonlyMap<string, readonly LootSpawnPoint[]>;
  private readonly supplyFootprints: SupplyFootprints;

  constructor(seed: number, registry: Registry, scale: Scale, plan: CityPlan) {
    if (scale.blockSize !== TEMPLATE_BLOCK_SIZE) {
      throw new Error(`the city's templates need ${TEMPLATE_BLOCK_SIZE} m blocks`);
    }
    this.seed = seed;
    this.registry = registry;
    this.plan = plan;
    this.paving = sitePalette(registry).paving;
    this.lootColumns = lootPointsByColumn(
      plan.placements.flatMap((placement) =>
        lootSourcesOf(
          registry,
          'city',
          placement,
          plan.composition?.lootSources.find((source) => source.placement === placement)?.fixedLoot,
        ),
      ),
    );
    this.supplyFootprints = new SupplyFootprints(
      plan.placements.flatMap(placedPieces),
      [...this.lootColumns.values()].flat(),
    );
    this.spawn = { pos: plan.spawn.map((value) => value * scale.blockSize) as Vec3, yaw: -Math.PI / 2 };
    const paved = plan.grid.paving ?? [
      ...Array.from({ length: plan.grid.blocksX * 2 + 1 }, (_, i) => ({
        x0: (i - plan.grid.blocksX) * (plan.grid.street + plan.grid.blockX),
        x1: (i - plan.grid.blocksX) * (plan.grid.street + plan.grid.blockX) + plan.grid.street,
        z0: plan.core.z0,
        z1: plan.core.z1,
      })),
      ...Array.from({ length: plan.grid.blocksZ * 2 + 1 }, (_, i) => ({
        x0: plan.core.x0,
        x1: plan.core.x1,
        z0: (i - plan.grid.blocksZ) * (plan.grid.street + plan.grid.blockZ),
        z1: (i - plan.grid.blocksZ) * (plan.grid.street + plan.grid.blockZ) + plan.grid.street,
      })),
    ];
    this.publicCartography = paved.map(({ x0, x1, z0, z1 }) => ({
      kind: 'road',
      bounds: {
        x0: x0 * scale.blockSize,
        x1: x1 * scale.blockSize,
        z0: z0 * scale.blockSize,
        z1: z1 * scale.blockSize,
      },
    }));
    for (const placement of plan.placements) {
      const [width, depth] = footprint(placement);
      for (let cz = toChunk(placement.origin[2]); cz <= toChunk(placement.origin[2] + depth - 1); cz++) {
        for (let cx = toChunk(placement.origin[0]); cx <= toChunk(placement.origin[0] + width - 1); cx++) {
          const key = `${cx},${cz}`;
          const list = this.byColumn.get(key) ?? [];
          list.push(placement);
          this.byColumn.set(key, list);
        }
      }
    }
  }

  get authoredPlacements(): readonly Placement[] {
    return this.plan.composition ? this.placements : [];
  }

  get placements() {
    return this.plan.placements;
  }
  get bounds() {
    return this.plan.bounds;
  }
  get floor() {
    return this.plan.floor;
  }

  get surface(): Surface {
    const { grid, bounds, core, floor } = this.plan;
    const alleys = Array.from(
      { length: grid.rows / 2 - 1 },
      (_, pair) => cityRowStart(grid, pair * 2) + 2 * cityRowDepth(grid),
    );
    return {
      height: (x, z, natural) => {
        const distance = rectDistance(bounds, x, z);
        if (distance === 0) {
          return floor;
        }
        if (grid.flatSurroundings) {
          return floor;
        }
        if (distance >= grid.blend) {
          return natural;
        }
        return Math.round(natural + smoothstep(1 - distance / grid.blend) * (floor - natural));
      },
      top: (x, z) => {
        if (rectDistance(bounds, x, z) !== 0) {
          return;
        }
        if (grid.paving) {
          return grid.paving.some((rect) => rect.x0 <= x && x < rect.x1 && rect.z0 <= z && z < rect.z1)
            ? this.paving
            : undefined;
        }
        const central = (0 <= x && x < grid.street) || (0 <= z && z < grid.street);
        const localZ = mod(z, grid.street + grid.blockZ);
        const alley = alleys.some((start) => localZ >= start && localZ < start + grid.street);
        const street = mod(x, grid.street + grid.blockX) < grid.street || localZ < grid.street || alley;
        return central || (rectDistance(core, x, z) === 0 && street) ? this.paving : undefined;
      },
    };
  }

  stamp(chunk: Chunk): void {
    stampChunk(chunk, this.plan.structures);
    const y0 = chunk.cy * CHUNK;
    for (const placement of this.byColumn.get(`${chunk.cx},${chunk.cz}`) ?? []) {
      if (placement.origin[1] < y0 + CHUNK && placement.origin[1] + placement.template.size[1] > y0) {
        stampPlacement(chunk, placement);
      }
    }
  }

  supplySourcesIn(area: Rect) {
    return this.supplyFootprints.in(area);
  }

  lootPointsIn(cx: number, cz: number): readonly LootSpawnPoint[] {
    return this.lootColumns.get(`${cx},${cz}`) ?? [];
  }

  furnitureIn(cx: number, cz: number): FurnitureSpawn[] {
    return (this.byColumn.get(`${cx},${cz}`) ?? []).flatMap((placement) =>
      furnitureOf(this, placement, [cx, cz], this.lootPointsIn(cx, cz)),
    );
  }

  zombiesIn(_cx: number, _cz: number): ZombieSpawn[] {
    return [];
  }
}
