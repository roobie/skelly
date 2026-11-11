import type { Chunk } from './chunk.ts';
import type { CityPlan } from './cityPlan.ts';
import type { Registry } from './content.ts';
import { toChunk, type Vec3 } from './coords.ts';
import { type LootSpawnPoint, lootPointsByColumn } from './loot.ts';
import type { PublicCartographicFeature } from './publicCartography.ts';
import type { Scale } from './scale.ts';
import { TEMPLATE_BLOCK_SIZE } from './settlementSpawns.ts';
import {
  type ActorSpawn,
  type FurnitureSpawn,
  furnitureOf,
  lootSourcesOf,
  type Rect,
  type Site,
  SupplyFootprints,
} from './site.ts';
import { sitePalette } from './sitePalette.ts';
import { footprint, type Placement, placedPieces } from './templates.ts';
import { createCitySurface, stampCityTerrain } from './terrainEvaluator.ts';
import { type SiteTerrainPlan, terrainPlacements } from './terrainPlan.ts';
import type { Surface } from './worldgen.ts';

export class CitySite implements Site {
  readonly terrain: SiteTerrainPlan;
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
    this.terrain = {
      kind: 'city',
      data: { grid: plan.grid, bounds: plan.bounds, core: plan.core, floor: plan.floor },
      paving: this.paving,
      structures: plan.structures,
      placements: terrainPlacements(plan.placements),
    };
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
    return createCitySurface(this.plan, this.paving);
  }

  stamp(chunk: Chunk): void {
    stampCityTerrain(chunk, this.plan.structures, this.byColumn.get(`${chunk.cx},${chunk.cz}`) ?? []);
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

  actorsIn(_cx: number, _cz: number): ActorSpawn[] {
    return [];
  }
}
