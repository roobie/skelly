import { AuthoredSite } from '../core/authoredSite.ts';
import { BlockEntities, type EntitySpec } from '../core/blockEntities.ts';
import { StressCity } from '../core/city.ts';
import { worldOpaque, worldSolid } from '../core/collision.ts';
import { blockColors, blockId, type Registry } from '../core/content.ts';
import { toChunk, type Vec3 } from '../core/coords.ts';
import { Forest } from '../core/forest.ts';
import { HAMLET_BLOCK_SIZE, HAMLET_TEMPLATES, Hamlet } from '../core/hamlet.ts';
import { rollLoot } from '../core/loot.ts';
import { blockPatterns } from '../core/meshInput.ts';
import { Rng } from '../core/random.ts';
import { HandlingRange } from '../core/range.ts';
import type { Scale } from '../core/scale.ts';
import type { FurnitureSpawn, Rect, Site } from '../core/site.ts';
import { type BlockBox, rasterize, stampChunk } from '../core/structure.ts';
import { World } from '../core/world.ts';
import { type Surface, terrainHeightMetres, worldGroundAt } from '../core/worldgen.ts';
import type { ChunkMeshes } from '../render/chunks.ts';
import { BUNDLED_CONTENT } from './bundledContent.ts';
import type { DebugStart, GameConfig } from './config.ts';
import { Streamer, type StreamerStats } from './streamer.ts';
import { HOUSE_OFFSET, LOT_CENTRE, SPAWN_OFFSET, SPAWN_YAW, testHouse, testHouseFurniture } from './testHouse.ts';
import { testHouseRangeStock } from './testHouseRange.ts';
import { buildDebugWeatheringTestSite } from './weatheringTestSite.ts';

export interface WorldSetup {
  config: GameConfig;
  registry: Registry;
  /** Content problems, one per line; empty when all content loaded. */
  contentErrors: string;
  world: World;
  /** Furniture and doors. The game adds them as their columns generate. */
  entities: BlockEntities;
  /** The generated site, including a debug-only test-house range when enabled. */
  site: Site | undefined;
  /** The top of the ground in metres at a point in metres, the site's flattening included. */
  groundAt: (xm: number, zm: number) => number;
  /** Blocks and block entities that stop movement. */
  isSolid: (x: number, y: number, z: number) => boolean;
  isOpaque: (x: number, y: number, z: number) => boolean;
  streamer: Streamer;
  /** Player start in metres (feet), and the yaw that faces the hamlet or the test house. */
  spawn: { pos: Vec3; yaw: number };
  /** The test house's furniture and table-authored loot in a column; authored/procedural sites bring their own. */
  furnitureIn: (cx: number, cz: number) => FurnitureSpawn[];
}

/** The test house, rasterized, and a spawn point facing its front door. */
export const testHouseScene = (config: GameConfig, registry: Registry) => {
  const { seed, scale } = config;
  const id = (name: string) => blockId(registry, name);
  // The test house sits on a level lot at a whole-metre height, so it lines up with any block size.
  const floor = Math.round(terrainHeightMetres(seed, HOUSE_OFFSET[0] + LOT_CENTRE[0], HOUSE_OFFSET[1] + LOT_CENTRE[1]));
  const house = testHouse(
    [HOUSE_OFFSET[0], floor, HOUSE_OFFSET[1]],
    {
      brick: id('brick'),
      plaster: id('plaster'),
      planks: id('planks'),
      tiles: id('tiles'),
      fabric: id('fabric'),
      roof: id('roof'),
      dirt: id('dirt'),
      grass: id('grass'),
      stone: id('stone'),
      sidingRed: id('siding_red'),
      sidingBlue: id('siding_blue'),
      galvanized: id('galvanized'),
      cobblestone: id('cobblestone_mossy'),
      dressedStone: id('dressed_stone'),
      hazard: id('hazard_yellow'),
    },
    scale.blockSize,
  );
  const spawn: Vec3 = [HOUSE_OFFSET[0] + SPAWN_OFFSET[0], floor, HOUSE_OFFSET[1] + SPAWN_OFFSET[2]];
  // Furniture is authored for the hamlet's block size; at others the house stays bare.
  const furniture =
    scale.blockSize === HAMLET_BLOCK_SIZE
      ? testHouseFurniture([HOUSE_OFFSET[0], floor, HOUSE_OFFSET[1]], scale.blockSize, (type) => {
          const def = registry.furniture.get(type);
          if (!def) {
            throw new Error(`content does not define furniture "${type}"`);
          }
          return def.size;
        })
      : [];
  return {
    structures: rasterize(house, scale.blockSize),
    spawn: { pos: spawn, yaw: SPAWN_YAW },
    furniture: furniture.map(({ loot, ...spec }) => ({
      spec,
      loot: loot ? rollLoot(registry, loot, Rng.stream(seed, `loot:${spec.pos.join(',')}`)) : [],
    })),
  };
};

const boundsOf = (boxes: readonly BlockBox[]): Rect => {
  if (boxes.length === 0) {
    throw new Error('the test house has no structure bounds');
  }
  return {
    x0: Math.min(...boxes.map(({ min }) => min[0])),
    z0: Math.min(...boxes.map(({ min }) => min[2])),
    x1: Math.max(...boxes.map(({ max }) => max[0])),
    z1: Math.max(...boxes.map(({ max }) => max[2])),
  };
};

/** Debug-only site wrapper: the test house remains the structure owner; the shared range owns the lane. */
export class DebugTestHouseSite implements Site {
  readonly range: HandlingRange;
  readonly surface: Surface;
  readonly spawn: Site['spawn'];
  private readonly structures: BlockBox[];
  private readonly rack: EntitySpec;
  private readonly stock: ReturnType<typeof testHouseRangeStock>;
  private readonly target: EntitySpec;

  constructor(config: GameConfig, registry: Registry, house: ReturnType<typeof testHouseScene>) {
    this.structures = house.structures;
    this.spawn = house.spawn;
    this.range = new HandlingRange(config.seed, registry, config.scale, {
      beside: boundsOf(this.structures),
      floor: house.spawn.pos[1] / config.scale.blockSize - 1,
    });
    this.surface = {
      height: (x, z, natural) => this.range.approachHeight(x, z, natural),
      top: (x, z) => this.range.top(x, z),
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
    this.stock = testHouseRangeStock(registry);
    const targetType = 'range_target';
    const targetSize = registry.furniture.get(targetType)?.size;
    if (!targetSize) {
      throw new Error(`content does not define furniture "${targetType}"`);
    }
    this.target = {
      type: targetType,
      pos: [this.range.targetXs[0]!, this.range.floor + 1, centreZ - Math.floor(targetSize[2] / 2)],
      size: [...targetSize],
      facing: 'w',
    };
  }

  stamp(chunk: Parameters<Site['stamp']>[0]): void {
    stampChunk(chunk, this.structures);
    this.range.stamp(chunk);
  }

  furnitureIn(cx: number, cz: number): FurnitureSpawn[] {
    const spawns = this.range.furnitureIn(cx, cz);
    if (toChunk(this.rack.pos[0]) === cx && toChunk(this.rack.pos[2]) === cz) {
      spawns.push({ spec: this.rack, loot: this.stock });
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
  house: ReturnType<typeof testHouseScene> | undefined,
): DebugTestHouseSite | undefined =>
  config.site === 'testHouse' && config.debug && house ? new DebugTestHouseSite(config, registry, house) : undefined;

/**
 * The hamlet or the city, if the config asks for one and content has what it needs.
 * Otherwise (other block sizes, broken content) the world has the test house.
 */
const buildSite = (config: GameConfig, registry: Registry): Site | undefined => {
  const layout = registry.layouts.get(config.site);
  if (layout) {
    return new AuthoredSite(config.seed, registry, config.scale, layout);
  }
  if (!['hamlet', 'city', 'forest', 'testHouse'].includes(config.site)) {
    throw new Error(`Content does not define site "${config.site}"`);
  }
  if (config.site === 'forest') {
    return new Forest(config.seed, registry, config.scale, config.density);
  }
  const buildable =
    config.scale.blockSize === HAMLET_BLOCK_SIZE &&
    registry.blockIds.has('asphalt') &&
    HAMLET_TEMPLATES.every((t) => registry.templates.has(t));
  if (!buildable || config.site === 'testHouse') {
    return undefined;
  }
  return config.site === 'city'
    ? new StressCity(config.seed, registry, config.scale, config.storeys)
    : new Hamlet(config.seed, registry, config.scale);
};

export function createWorldSetup(config: GameConfig, meshes: ChunkMeshes, stats?: StreamerStats): WorldSetup {
  const { registry, issues } = BUNDLED_CONTENT;
  const contentErrors = issues.map((i) => `${i.source} ${i.path}: ${i.message}`).join('\n');
  const { seed, scale } = config;
  const id = (name: string) => blockId(registry, name);

  const house = config.site === 'testHouse' ? testHouseScene(config, registry) : undefined;
  const built =
    buildDebugWeatheringTestSite(config, registry) ??
    buildDebugTestHouseSite(config, registry, house) ??
    buildSite(config, registry);
  const site: { structures: BlockBox[]; spawn: WorldSetup['spawn']; furniture: FurnitureSpawn[] } = built
    ? { structures: [], spawn: built.spawn, furniture: house?.furniture ?? [] }
    : (house ?? testHouseScene(config, registry));
  // Without a site this is the formula the 1.0 and 1.1 benchmarks used, so their results still compare.
  const groundAt = (xm: number, zm: number): number => worldGroundAt({ seed, scale, surface: built?.surface, xm, zm });

  const world = new World();
  const entities = new BlockEntities(registry);
  const isSolid = worldSolid(world, registry, entities);
  const streamer = new Streamer({
    world,
    meshes,
    seed,
    terrain: { grass: id('grass'), dirt: id('dirt'), stone: id('stone'), sand: id('sand') },
    colors: blockColors(registry),
    patterns: blockPatterns(registry),
    scale,
    structures: site.structures,
    surface: built?.surface,
    stamp: built ? (chunk) => built.stamp(chunk) : undefined,
    radius: config.radiusChunks,
    ...(stats ? { stats } : {}),
  });

  return {
    config,
    registry,
    contentErrors,
    world,
    entities,
    site: built,
    groundAt,
    isSolid,
    isOpaque: worldOpaque(world, registry, entities),
    streamer,
    spawn: site.spawn,
    furnitureIn: (cx, cz) =>
      site.furniture.filter(({ spec }) => toChunk(spec.pos[0]) === cx && toChunk(spec.pos[2]) === cz),
  };
}

/** Resolve the initial pose in block space; restored state bypasses debug starts. */
export function playerStartFromWorld(
  setup: Pick<WorldSetup, 'spawn' | 'groundAt'>,
  scale: Scale,
  debugStart?: DebugStart,
  restoring = false,
): { position: Vec3; yaw: number } {
  const { blockSize } = scale;
  if (debugStart && !restoring) {
    const { x, z, yawDegrees } = debugStart;
    return {
      position: [x / blockSize, setup.groundAt(x, z) / blockSize + 0.01, z / blockSize],
      yaw: yawDegrees === undefined ? setup.spawn.yaw : (yawDegrees * Math.PI) / 180,
    };
  }
  const [x, y, z] = setup.spawn.pos;
  return { position: [x / blockSize, y / blockSize + 0.01, z / blockSize], yaw: setup.spawn.yaw };
}
