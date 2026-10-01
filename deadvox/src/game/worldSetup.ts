import { BlockEntities, type EntitySpec } from '../core/blockEntities.ts';
import { StressCity } from '../core/city.ts';
import { worldSolid } from '../core/collision.ts';
import { blockColors, blockId, buildRegistry, type ContentSource, type Registry } from '../core/content.ts';
import { toChunk, type Vec3 } from '../core/coords.ts';
import { HAMLET_BLOCK_SIZE, HAMLET_TEMPLATES, Hamlet } from '../core/hamlet.ts';
import type { Scale } from '../core/scale.ts';
import type { FurnitureSpawn, Site } from '../core/site.ts';
import { type BlockBox, rasterize } from '../core/structure.ts';
import { World } from '../core/world.ts';
import { terrainHeightMetres, worldGroundAt } from '../core/worldgen.ts';
import type { ChunkMeshes } from '../render/chunks.ts';
import type { GameConfig } from './config.ts';
import { Streamer, type StreamerStats } from './streamer.ts';
import { HOUSE_OFFSET, LOT_CENTRE, SPAWN_OFFSET, SPAWN_YAW, testHouse, testHouseFurniture } from './testHouse.ts';

export interface WorldSetup {
  config: GameConfig;
  registry: Registry;
  /** Content problems, one per line; empty when all content loaded. */
  contentErrors: string;
  world: World;
  /** Furniture and doors. The game adds them as their columns generate. */
  entities: BlockEntities;
  /** The hamlet or the city, when this world has one. */
  site: Site | undefined;
  /** The top of the ground in metres at a point in metres, the site's flattening included. */
  groundAt: (xm: number, zm: number) => number;
  /** Blocks and block entities that stop movement. */
  isSolid: (x: number, y: number, z: number) => boolean;
  streamer: Streamer;
  /** Player start in metres (feet), and the yaw that faces the hamlet or the test house. */
  spawn: { pos: Vec3; yaw: number };
  /** The test house's furniture anchored in a column, empty-handed; a hamlet or city brings its own through `site`. */
  furnitureIn: (cx: number, cz: number) => FurnitureSpawn[];
}

/** The test house, rasterized, and a spawn point facing its front door. */
const testHouseSite = (config: GameConfig, registry: Registry) => {
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
  return { structures: rasterize(house, scale.blockSize), spawn: { pos: spawn, yaw: SPAWN_YAW }, furniture };
};

/**
 * The hamlet or the city, if the config asks for one and content has what it needs.
 * Otherwise (other block sizes, broken content) the world has the test house.
 */
const buildSite = (config: GameConfig, registry: Registry): Site | undefined => {
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

const loadContent = (): { registry: Registry; contentErrors: string } => {
  // Base content is bundled. Mods would be appended to this list (from URLs or local files).
  const files = import.meta.glob<unknown>('../content/base/*.json', { eager: true, import: 'default' });
  const sources: ContentSource[] = Object.entries(files)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([source, data]) => ({ source, data }));
  const { registry, issues } = buildRegistry(sources);
  return { registry, contentErrors: issues.map((i) => `${i.source} ${i.path}: ${i.message}`).join('\n') };
};

export function createWorldSetup(config: GameConfig, meshes: ChunkMeshes, stats?: StreamerStats): WorldSetup {
  const { registry, contentErrors } = loadContent();
  const { seed, scale } = config;
  const id = (name: string) => blockId(registry, name);

  const built = buildSite(config, registry);
  const site: { structures: BlockBox[]; spawn: WorldSetup['spawn']; furniture: EntitySpec[] } = built
    ? { structures: [], spawn: built.spawn, furniture: [] }
    : testHouseSite(config, registry);
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
    streamer,
    spawn: site.spawn,
    furnitureIn: (cx, cz) =>
      site.furniture
        .filter((spec) => toChunk(spec.pos[0]) === cx && toChunk(spec.pos[2]) === cz)
        .map((spec) => ({ spec, loot: [] })),
  };
}

/** Convert the generated world spawn (metres) into the player's block-space body origin. */
export function playerStartFromWorld(setup: Pick<WorldSetup, 'spawn'>, scale: Scale): { position: Vec3; yaw: number } {
  const [x, y, z] = setup.spawn.pos;
  const { blockSize } = scale;
  return { position: [x / blockSize, y / blockSize + 0.01, z / blockSize], yaw: setup.spawn.yaw };
}
