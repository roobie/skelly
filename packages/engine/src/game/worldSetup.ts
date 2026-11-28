import { AuthoredSite } from '../core/authoredSite.ts';
import { BlockEntities } from '../core/blockEntities.ts';
import type { CanonicalTerrain } from '../core/canonicalTerrain.ts';
import { StressCity } from '../core/city.ts';
import {
  type LightBlocking,
  worldLightBlocking,
  worldOpaque,
  worldSolid,
  worldSoundBlocking,
} from '../core/collision.ts';
import { composeLayout } from '../core/composeLayout.ts';
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
import { SimulationTerrain } from '../core/simulationTerrain.ts';
import type { ColumnSource, Site } from '../core/site.ts';
import { sitePalette, terrainShapeOf } from '../core/sitePalette.ts';
import { type PlacedPowerDevice, placedPowerDevices } from '../core/sitePower.ts';
import { authoredSkyBoxes, SkyFields } from '../core/skyField.ts';
import { templateDamageSource } from '../core/templateDamage.ts';
import { createTerrainEvaluator, type TerrainEvaluator } from '../core/terrainEvaluator.ts';
import type { DebugStart, GameConfig } from './config.ts';
import { layoutVehicleSkyBoxes } from './layoutVehicles.ts';
import type { MesherSource } from './mesherProtocol.ts';
import { RenderWorld } from './renderWorld.ts';
import { type ChunkMeshSink, Streamer, type StreamerStats } from './streamer.ts';
import type { TerrainWorkerSource } from './terrainProtocol.ts';
import { buildDebugWeatheringTestSite } from './weatheringTestSite.ts';

export interface WorldSetup extends ColumnSource {
  config: GameConfig;
  registry: Registry;
  contentErrors: string;
  scenario:
    | (Pick<ScenarioDef, 'id' | 'body' | 'compression' | 'outbreakAgeGameHours' | 'decalLimit'> & {
        eventRules: readonly import('../core/schema/scenarios.ts').EventRuleDef[];
      })
    | undefined;
  readonly attemptPolicy?: AttemptPolicyDef | undefined;
  powerDevices: readonly PlacedPowerDevice[];
  world: RenderWorld;
  simulationWorld: SimulationTerrain;
  canonicalTerrain: CanonicalTerrain;
  entities: BlockEntities;
  /** The site's sky field cache: the session answers from it and the renderer draws it. */
  skyFields: SkyFields;
  site: Site | undefined;
  groundAt: (xm: number, zm: number) => number;
  isSolid: (x: number, y: number, z: number) => boolean;
  isOpaque: (x: number, y: number, z: number) => boolean;
  isLightBlocking: LightBlocking;
  isSoundBlocking: (x: number, y: number, z: number) => boolean;
  streamer: Streamer;
  spawn: { pos: Vec3; yaw: number };
}

type ScenarioSiteOptions = Omit<ConstructorParameters<typeof ScenarioCitySite>[0], 'scenario'> & {
  scenario: ScenarioDef;
};
const SCENARIO_SITES: Record<ScenarioKind, (options: ScenarioSiteOptions) => Site> = {
  assembledCity: (options) => {
    if (options.scenario.kind !== 'assembledCity') {
      throw new Error('Expected assembledCity scenario');
    }
    return new ScenarioCitySite({ ...options, scenario: options.scenario });
  },
  composedSite: ({ seed, registry, scale, scenario }) => {
    if (scenario.kind !== 'composedSite') {
      throw new Error('Expected composedSite scenario');
    }
    const composed = composeLayout(seed, registry, scenario);
    return new AuthoredSite(seed, registry, scale, composed.layout, {
      authoredMarkers: scenario.population.authoredMarkers,
      eventRules: composed.eventRules,
    });
  },
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

const measuredTerrain = (terrain: TerrainEvaluator, debug: boolean): TerrainEvaluator => {
  if (!debug) {
    return terrain;
  }
  return {
    ...terrain,
    generateColumn: (cx, cz) => {
      const start = performance.now();
      const column = terrain.generateColumn(cx, cz);
      performance.measure(`deadvox load: terrain evaluation main ${cx},${cz}`, { start });
      return column;
    },
  };
};

export function createWorldSetup(
  config: GameConfig,
  meshes: ChunkMeshSink,
  mesher: MesherSource,
  {
    stats,
    terrainWorkers,
    debug = false,
  }: { stats?: StreamerStats | undefined; terrainWorkers?: TerrainWorkerSource; debug?: boolean } = {},
): WorldSetup {
  const { registry, issues } = config.content;
  const contentErrors = issues.map((i) => `${i.source} ${i.path}: ${i.message}`).join('\n');
  const { seed, scale } = config;
  const weathering = buildDebugWeatheringTestSite(config, registry);
  const built: Site | undefined = weathering ?? siteForReviewMap(config, registry);
  const row = weathering ? undefined : (registry.scenarios.get(config.site) ?? registry.layouts.get(config.site));
  const shape = terrainShapeOf(registry);
  const world = new RenderWorld();
  const entities = new BlockEntities(registry, seed);
  const terrain = measuredTerrain(
    createTerrainEvaluator({
      seed,
      blocks: sitePalette(registry).terrain,
      shape,
      scale,
      site: built?.terrain ?? { kind: 'natural' },
      structures: [],
    }),
    debug,
  );
  const { groundAt } = terrain;
  const simulationWorld = new SimulationTerrain(terrain);
  const canonicalTerrain = simulationWorld.canonical;
  simulationWorld.blockDamage.bindGenerated(templateDamageSource(canonicalTerrain, registry, simulationWorld));
  simulationWorld.watchChunks((cx, _cy, cz) => {
    const state = canonicalTerrain.world;
    if (!state.isTouched(cx, cz)) {
      return;
    }
    const chunks = Array.from({ length: scale.maxCy - scale.minCy + 1 }, (_, at) =>
      state.getChunk(cx, scale.minCy + at, cz),
    );
    if (chunks.some((chunk) => !chunk)) {
      return;
    }
    for (const chunk of chunks) {
      world.addChunk(chunk!);
    }
    world.touchColumn(cx, cz);
  });
  const isSolid = worldSolid(simulationWorld, registry, entities);
  const tuning = graphicsTuningOf(registry);
  const streamer = new Streamer({
    world,
    meshes,
    mesher,
    terrain,
    publication: simulationWorld,
    colors: blockColors(registry),
    wireMeshes: registry.blocks.map((block) => block.wireMesh),
    struts: registry.blocks.map((block) => block.strut),
    liquids: blockLiquids(registry),
    fencePosts: registry.blocks.map((block) => block.fencePosts),
    patterns: blockPatterns(registry),
    weatherable: blockWeatherability(registry),
    scale,
    radius: config.radiusChunks,
    preloadRings: tuning.skyPreloadRings,
    columnsPerFrame: tuning.columnsPerFrame,
    hysteresis: config.streamHysteresisChunks,
    ...(stats ? { stats } : {}),
    ...(terrainWorkers ? { terrainWorkers: { source: terrainWorkers, ...tuning.terrainWorkers } } : {}),
    debug,
  });
  const scenario = registry.scenarios.get(config.site);
  const eventRules = scenario?.kind === 'composedSite' ? built?.eventRules : scenario?.eventRules;
  if (scenario && eventRules === undefined) {
    throw new Error(`Scenario "${scenario.id}" did not resolve its event rules`);
  }
  return {
    config,
    registry,
    contentErrors,
    scenario:
      scenario && eventRules
        ? {
            id: scenario.id,
            body: scenario.body,
            compression: scenario.compression,
            outbreakAgeGameHours: scenario.outbreakAgeGameHours,
            decalLimit: scenario.decalLimit,
            eventRules,
          }
        : undefined,
    attemptPolicy: row?.attemptPolicy,
    powerDevices: placedPowerDevices(registry, built?.authoredPlacements ?? []),
    world,
    simulationWorld,
    canonicalTerrain,
    entities,
    skyFields: new SkyFields(
      { world, entities, registry },
      { bottom: scale.minCy * CHUNK, top: (scale.maxCy + 1) * CHUNK - 1 },
      [
        ...authoredSkyBoxes(built?.authoredPlacements ?? []),
        ...layoutVehicleSkyBoxes(registry, config.site, scale.blockSize),
      ],
    ),
    site: built,
    groundAt,
    isSolid,
    isOpaque: worldOpaque(simulationWorld, registry, entities),
    isLightBlocking: worldLightBlocking(simulationWorld, registry, entities),
    isSoundBlocking: worldSoundBlocking(simulationWorld, registry, { entities }),
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
