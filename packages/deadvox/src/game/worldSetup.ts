import { AuthoredSite } from '../core/authoredSite.ts';
import { BlockEntities } from '../core/blockEntities.ts';
import { CanonicalTerrain } from '../core/canonicalTerrain.ts';
import { StressCity } from '../core/city.ts';
import { worldOpaque, worldSolid, worldSoundBlocking } from '../core/collision.ts';
import { blockColors, type Registry } from '../core/content.ts';
import { CHUNK, type Vec3 } from '../core/coords.ts';
import { Forest } from '../core/forest.ts';
import { graphicsTuningOf } from '../core/graphicsTuning.ts';
import { blockLiquids, blockPatterns, blockWeatherability } from '../core/meshInput.ts';
import type { Scale } from '../core/scale.ts';
import { ScenarioCitySite } from '../core/scenarioCity.ts';
import type { ScenarioKind } from '../core/scenarioKinds.ts';
import type { AttemptPolicyDef } from '../core/schema/attemptPolicy.ts';
import type { ScenarioDef } from '../core/schema.ts';
import { TEMPLATE_BLOCK_SIZE } from '../core/settlementSpawns.ts';
import type { ColumnSource, Site } from '../core/site.ts';
import { sitePalette, terrainShapeOf } from '../core/sitePalette.ts';
import { type PlacedPowerDevice, placedPowerDevices } from '../core/sitePower.ts';
import { authoredSkyBoxes, SkyFields } from '../core/skyField.ts';
import { World } from '../core/world.ts';
import { worldGroundAt } from '../core/worldgen.ts';
import type { ChunkMeshes } from '../render/chunks.ts';
import type { DebugStart, GameConfig } from './config.ts';
import { Streamer, type StreamerStats } from './streamer.ts';
import { buildDebugWeatheringTestSite } from './weatheringTestSite.ts';

export interface WorldSetup extends ColumnSource {
  config: GameConfig;
  registry: Registry;
  contentErrors: string;
  scenario: ScenarioDef | undefined;
  readonly attemptPolicy?: AttemptPolicyDef | undefined;
  powerDevices: readonly PlacedPowerDevice[];
  world: World;
  canonicalTerrain: CanonicalTerrain;
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

const SCENARIO_SITES: Record<ScenarioKind, (options: ConstructorParameters<typeof ScenarioCitySite>[0]) => Site> = {
  assembledCity: (options) => new ScenarioCitySite(options),
};

const buildSite = (config: GameConfig, registry: Registry): Site | undefined => {
  const scenario = registry.scenarios.get(config.site);
  if (scenario) {
    const selected = registry.starts.get(config.startId);
    if (selected?.site !== config.site) {
      throw new Error(`Start "${config.startId}" does not start on site "${config.site}"`);
    }
    return SCENARIO_SITES[scenario.kind]({
      seed: config.seed,
      registry,
      scale: config.scale,
      scenario,
      start: selected.placement,
    });
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

export const siteForReviewMap = (config: GameConfig, registry = config.content.registry): Site | undefined =>
  buildSite(config, registry);

export function createWorldSetup(config: GameConfig, meshes: ChunkMeshes, stats?: StreamerStats): WorldSetup {
  const { registry, issues } = config.content;
  const contentErrors = issues.map((i) => `${i.source} ${i.path}: ${i.message}`).join('\n');
  const { seed, scale } = config;
  const weathering = buildDebugWeatheringTestSite(config, registry);
  const built: Site | undefined = weathering ?? siteForReviewMap(config, registry);
  const row = weathering ? undefined : (registry.scenarios.get(config.site) ?? registry.layouts.get(config.site));
  const shape = terrainShapeOf(registry);
  const groundAt = (xm: number, zm: number): number =>
    worldGroundAt({ seed, shape, scale, surface: built?.surface, xm, zm });
  const world = new World();
  const entities = new BlockEntities(registry);
  const isSolid = worldSolid(world, registry, entities);
  const terrain = {
    seed,
    blocks: sitePalette(registry).terrain,
    shape,
    scale,
    surface: built?.surface,
    stamp: built ? (chunk: Parameters<Site['stamp']>[0]) => built.stamp(chunk) : undefined,
  };
  const streamer = new Streamer({
    world,
    meshes,
    seed,
    terrain: terrain.blocks,
    shape: terrain.shape,
    colors: blockColors(registry),
    wireMeshes: registry.blocks.map((block) => block.wireMesh),
    liquids: blockLiquids(registry),
    fencePosts: registry.blocks.map((block) => block.fencePosts),
    patterns: blockPatterns(registry),
    weatherable: blockWeatherability(registry),
    scale,
    structures: [],
    surface: terrain.surface,
    stamp: terrain.stamp,
    radius: config.radiusChunks,
    preloadRings: graphicsTuningOf(registry).skyPreloadRings,
    hysteresis: config.streamHysteresisChunks,
    ...(stats ? { stats } : {}),
  });
  return {
    config,
    registry,
    contentErrors,
    scenario: registry.scenarios.get(config.site),
    attemptPolicy: row?.attemptPolicy,
    powerDevices: placedPowerDevices(registry, built?.authoredPlacements ?? []),
    world,
    canonicalTerrain: new CanonicalTerrain(world, terrain),
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
    supplySourcesIn: (area) => built?.supplySourcesIn(area) ?? [],
    actorsIn: (cx, cz) => built?.actorsIn(cx, cz) ?? [],
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
