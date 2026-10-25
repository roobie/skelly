import { AuthoredSite } from '../core/authoredSite.ts';
import { BlockEntities, type EntitySpec } from '../core/blockEntities.ts';
import { StressCity } from '../core/city.ts';
import { worldOpaque, worldSolid, worldSoundBlocking } from '../core/collision.ts';
import { blockColors, type Registry } from '../core/content.ts';
import { CHUNK, toChunk, type Vec3 } from '../core/coords.ts';
import { Forest } from '../core/forest.ts';
import { GauntletSite } from '../core/gauntlet.ts';
import { type LootPointSource, type LootSpawnPoint, lootPointsByColumn } from '../core/loot.ts';
import { blockLiquids, blockPatterns, blockWeatherability } from '../core/meshInput.ts';
import { HandlingRange } from '../core/range.ts';
import type { Scale } from '../core/scale.ts';
import type { ScenarioKind } from '../core/scenarioKinds.ts';
import type { ScenarioDef } from '../core/schema.ts';
import { TEMPLATE_BLOCK_SIZE } from '../core/settlementSpawns.ts';
import { focusPose, ShowroomCatalogue } from '../core/showroom.ts';
import { type ColumnSource, type FurnitureSpawn, fillFurnitureLoot, type Site } from '../core/site.ts';
import { sitePalette, terrainShapeOf } from '../core/sitePalette.ts';
import { type PlacedPowerDevice, placedPowerDevices } from '../core/sitePower.ts';
import { authoredSkyBoxes, SkyFields } from '../core/skyField.ts';
import { World } from '../core/world.ts';
import { type Surface, worldGroundAt } from '../core/worldgen.ts';
import type { ChunkMeshes } from '../render/chunks.ts';
import type { DebugStart, GameConfig } from './config.ts';
import { Streamer, type StreamerStats } from './streamer.ts';
import { testHouseRangeSupply } from './testHouseRange.ts';
import { buildDebugWeatheringTestSite } from './weatheringTestSite.ts';

export interface WorldSetup extends ColumnSource {
  config: GameConfig;
  registry: Registry;
  contentErrors: string;
  scenario: ScenarioDef | undefined;
  powerDevices: readonly PlacedPowerDevice[];
  world: World;
  entities: BlockEntities;
  /** The site's sky field cache: the session answers from it and the renderer draws it. */
  skyFields: SkyFields;
  site: Site | undefined;
  groundAt: (xm: number, zm: number) => number;
  isSolid: (x: number, y: number, z: number) => boolean;
  isOpaque: (x: number, y: number, z: number) => boolean;
  isSoundBlocking: (x: number, y: number, z: number) => boolean;
  streamer: Streamer;
  spawn: { pos: Vec3; yaw: number };
}

/** The authored site owns the house; this wrapper adds only the debug range and the showroom catalogue. */
export class DebugTestHouseSite implements Site {
  readonly range: HandlingRange;
  readonly catalogue: ShowroomCatalogue | undefined;
  readonly surface: Surface;
  readonly spawn: Site['spawn'];
  readonly house: AuthoredSite;
  private readonly rack: EntitySpec;
  private readonly registry: Registry;
  private readonly seed: number;
  private readonly target: EntitySpec;
  private readonly lootPoints: ReadonlyMap<string, readonly LootSpawnPoint[]>;

  constructor(config: GameConfig, registry: Registry, house: AuthoredSite) {
    this.house = house;
    this.spawn = house.spawn;
    const layout = registry.layouts.get(config.site)!;
    const { bounds } = layout;
    const s = config.scale.blockSize;
    this.range = new HandlingRange(config.seed, registry, config.scale, {
      beside: { x0: bounds.x0 / s, x1: bounds.x1 / s, z0: bounds.z0 / s, z1: bounds.z1 / s },
      floor: house.spawn.pos[1] / s - 1,
    });
    const catalogue = house.showroom && new ShowroomCatalogue(registry, house.showroom.catalogue);
    this.catalogue = catalogue;
    this.surface = {
      height: (x, z, natural) => {
        const ground = this.range.approachHeight(x, z, house.surface.height(x, z, natural));
        return catalogue ? catalogue.height(x, z, ground) : ground;
      },
      top: (x, z) => this.range.top(x, z) ?? catalogue?.top(x, z) ?? house.surface.top?.(x, z),
    };
    const rackType = 'range_rack';
    const rackSize = registry.furniture.get(rackType)?.size;
    if (!rackSize) {
      throw new Error(`content does not define furniture "${rackType}"`);
    }
    const centreZ = Math.floor((this.range.rect.z0 + this.range.rect.z1) / 2);
    this.rack = {
      type: rackType,
      pos: [this.range.rect.x0 + 3, this.range.floor + 1, centreZ + 4],
      size: [...rackSize],
      facing: 's',
    };
    this.registry = registry;
    this.seed = config.seed;
    const source: LootPointSource = {
      site: layout.id,
      building: 'range-rack',
      anchor: [0, 0, 0],
      channel: 'container',
      position: this.rack.pos,
      destination: this.rack.pos,
      context: layout.lootContext,
      supply: { kind: 'fixed', items: testHouseRangeSupply(registry) },
      required: false,
      fixture: true,
    };
    this.lootPoints = lootPointsByColumn([source]);
    const targetType = 'range_target';
    const targetSize = registry.furniture.get(targetType)?.size;
    if (!targetSize) {
      throw new Error(`content does not define furniture "${targetType}"`);
    }
    this.target = {
      type: targetType,
      pos: [this.range.targets[0]!.x, this.range.floor + 1, this.range.targets[0]!.z - Math.floor(targetSize[2] / 2)],
      size: [...targetSize],
      facing: 'w',
    };
  }

  get authoredPlacements() {
    return this.house.placements;
  }

  /** A slot wins over the catalogue, so a feature's own staging is what a focus shows. */
  focus(furniture: string): Site['spawn'] | undefined {
    const pose = this.catalogue && focusPose(this.catalogue.props, furniture, this.house.showroom!.focusDistance);
    return this.house.focus(furniture) ?? (pose && { pos: [...pose.pos], yaw: pose.yaw });
  }

  stamp(chunk: Parameters<Site['stamp']>[0]): void {
    this.house.stamp(chunk);
    this.range.stamp(chunk);
  }

  lootPointsIn(cx: number, cz: number) {
    return [...this.house.lootPointsIn(cx, cz), ...(this.lootPoints.get(`${cx},${cz}`) ?? [])];
  }

  furnitureIn(cx: number, cz: number): FurnitureSpawn[] {
    const spawns = [
      ...this.house.furnitureIn(cx, cz),
      ...this.range.furnitureIn(cx, cz),
      ...(this.catalogue?.furnitureIn(cx, cz) ?? []),
    ];
    if (toChunk(this.rack.pos[0]) === cx && toChunk(this.rack.pos[2]) === cz) {
      spawns.push(
        ...fillFurnitureLoot(this.registry, this.seed, [{ spec: this.rack, loot: [] }], this.lootPointsIn(cx, cz)),
      );
    }
    if (toChunk(this.target.pos[0]) === cx && toChunk(this.target.pos[2]) === cz) {
      spawns.push({ spec: this.target, loot: [] });
    }
    return spawns;
  }

  zombiesIn(): ReturnType<Site['zombiesIn']> {
    return [];
  }
}

export const buildDebugTestHouseSite = (
  config: GameConfig,
  registry: Registry,
  house: Site | undefined,
): DebugTestHouseSite | undefined =>
  config.site === 'testHouse' && config.debug && house instanceof AuthoredSite
    ? new DebugTestHouseSite(config, registry, house)
    : undefined;

const SCENARIO_SITES: Record<ScenarioKind, (options: ConstructorParameters<typeof GauntletSite>[0]) => Site> = {
  gauntlet: (options) => new GauntletSite(options),
};

const buildSite = (config: GameConfig, registry: Registry): Site | undefined => {
  const scenario = registry.scenarios.get(config.site);
  if (scenario) {
    return SCENARIO_SITES[scenario.kind]({ seed: config.seed, registry, scale: config.scale, scenario });
  }
  const layout = registry.layouts.get(config.site);
  if (layout) {
    return new AuthoredSite(config.seed, registry, config.scale, layout);
  }
  if (!['city', 'forest'].includes(config.site)) {
    throw new Error(`Content does not define site "${config.site}"`);
  }
  if (config.site === 'forest') {
    return new Forest(config.seed, registry, config.scale, config.density);
  }
  if (config.scale.blockSize !== TEMPLATE_BLOCK_SIZE) {
    return undefined;
  }
  return new StressCity(config.seed, registry, config.scale, config.storeys);
};

export const siteForReviewMap = (config: GameConfig, registry = config.content.registry): Site | undefined => {
  const site = buildSite(config, registry);
  return buildDebugTestHouseSite(config, registry, site) ?? site;
};

export function createWorldSetup(config: GameConfig, meshes: ChunkMeshes, stats?: StreamerStats): WorldSetup {
  const { registry, issues } = config.content;
  const contentErrors = issues.map((i) => `${i.source} ${i.path}: ${i.message}`).join('\n');
  const { seed, scale } = config;
  const built: Site | undefined = buildDebugWeatheringTestSite(config, registry) ?? siteForReviewMap(config, registry);
  const shape = terrainShapeOf(registry);
  const groundAt = (xm: number, zm: number): number =>
    worldGroundAt({ seed, shape, scale, surface: built?.surface, xm, zm });
  const world = new World();
  const entities = new BlockEntities(registry);
  const isSolid = worldSolid(world, registry, entities);
  const streamer = new Streamer({
    world,
    meshes,
    seed,
    terrain: sitePalette(registry).terrain,
    shape,
    colors: blockColors(registry),
    wireMeshes: registry.blocks.map((block) => block.wireMesh),
    liquids: blockLiquids(registry),
    fencePosts: registry.blocks.map((block) => block.fencePosts),
    patterns: blockPatterns(registry),
    weatherable: blockWeatherability(registry),
    scale,
    structures: [],
    surface: built?.surface,
    stamp: built ? (chunk) => built.stamp(chunk) : undefined,
    radius: config.radiusChunks,
    ...(stats ? { stats } : {}),
  });
  return {
    config,
    registry,
    contentErrors,
    scenario: registry.scenarios.get(config.site),
    powerDevices: placedPowerDevices(registry, built?.authoredPlacements ?? []),
    world,
    entities,
    skyFields: new SkyFields(
      { world, entities, registry },
      { bottom: scale.minCy * CHUNK, top: (scale.maxCy + 1) * CHUNK - 1 },
      authoredSkyBoxes(built?.authoredPlacements ?? []),
    ),
    site: built,
    groundAt,
    isSolid,
    isOpaque: worldOpaque(world, registry, entities),
    isSoundBlocking: worldSoundBlocking(world, registry, { entities }),
    streamer,
    spawn: built?.spawn ?? { pos: [0, groundAt(0, 0), 0], yaw: 0 },
    lootPointsIn: (cx, cz) => built?.lootPointsIn(cx, cz) ?? [],
    furnitureIn: (cx, cz) => built?.furnitureIn(cx, cz) ?? [],
    zombiesIn: (cx, cz) => built?.zombiesIn(cx, cz) ?? [],
    hordesIn: (cx, cz) => built?.hordesIn?.(cx, cz) ?? [],
  };
}

/**
 * Resolve the initial pose in block space; restored state bypasses debug starts and focus. A focus the site
 * does not show falls back to the default spawn and is returned as `unknownFocus`, so the caller can say so.
 */
export function playerStartFromWorld(
  setup: Pick<WorldSetup, 'spawn' | 'groundAt'> & { site?: Site | undefined },
  scale: Scale,
  debugStart?: DebugStart,
  start: { restoring?: boolean; focus?: string | undefined } = {},
): { position: Vec3; yaw: number; unknownFocus?: string } {
  const { blockSize } = scale;
  const fresh = !start.restoring;
  if (debugStart && fresh) {
    const { x, z, yawDegrees } = debugStart;
    return {
      position: [x / blockSize, setup.groundAt(x, z) / blockSize + 0.01, z / blockSize],
      yaw: yawDegrees === undefined ? setup.spawn.yaw : (yawDegrees * Math.PI) / 180,
    };
  }
  const focus = fresh ? start.focus : undefined;
  const focused = focus === undefined ? undefined : setup.site?.focus?.(focus);
  const {
    pos: [x, y, z],
    yaw,
  } = focused ?? setup.spawn;
  return {
    position: [x / blockSize, y / blockSize + 0.01, z / blockSize],
    yaw,
    ...(focus !== undefined && !focused ? { unknownFocus: focus } : {}),
  };
}
