import { parseTimeOfDay, SPAWN_TIME } from '../core/clock.ts';
import type { HandSide } from '../core/inventory.ts';
import { BLOCK_SIZE, chunksFor, makeScale, type Scale } from '../core/scale.ts';
import { clampWeathering } from '../core/weather.ts';
import { BUNDLED_CONTENT } from './bundledContent.ts';

/** View distances offered on the start card, in metres. 96 m is the default. */
export const VIEW_DISTANCES: readonly number[] = [64, 96, 128];
export const DEFAULT_RADIUS_M = 96;
const MIN_RADIUS_M = 32;
const MAX_RADIUS_M = 256;

export interface GameConfig {
  seed: number;
  scale: Scale;
  /** View (mesh) radius in metres. */
  radiusM: number;
  /** The same radius in chunks, rounded up. */
  radiusChunks: number;
  /** Calendar seconds at the start (time of day on day 1). */
  start: number;
  /** Debug keys are on (`?debug=1`). */
  debug: boolean;
  /** Fresh debug games may override the start-card hand (`?handedness=left`). */
  debugHandedness?: HandSide;
  /** Debug-only fresh-session start in metres (`?at=x,z[,yawDegrees]`). */
  debugStart?: DebugStart;
  /**
   * What stands near spawn: the hamlet, milestone 1.0's test house (the benchmark's
   * scene), or the stress-test city.
   */
  site: SiteName;
  /** The city's tallest buildings, in storeys (`?storeys=N`). */
  storeys: number;
  /** Fixed occupancy override (`?density=0..1`); null selects the frozen seeded field. */
  density: number | null;
  /** Render-only weathering strength, from the base content or the debug URL override. */
  weathering: number;
  /** Zombies are drawn as full mobgen actors (src/render/mobActors.ts) by default; `?actors=boxes` draws
   * ZombieMeshes' six boxes instead. */
  actors: ActorRenderer;
}

export type ActorRenderer = 'boxes' | 'detailed';

/** The benchmark passes other block sizes; the game always uses BLOCK_SIZE. */
export const makeConfig = (seed: number, radiusM: number, blockSize = BLOCK_SIZE): GameConfig => {
  const scale = makeScale(blockSize);
  return {
    seed,
    scale,
    radiusM,
    radiusChunks: chunksFor(scale, radiusM),
    start: SPAWN_TIME,
    debug: false,
    site: 'hamlet',
    storeys: 1,
    density: null,
    weathering: baseWeatheringStrength,
    actors: 'detailed',
  };
};

/** `?actors=boxes`; anything else (including absent) is 'detailed'. */
export const actorRendererFromUrl = (params: URLSearchParams): ActorRenderer =>
  params.get('actors') === 'boxes' ? 'boxes' : 'detailed';

export type SiteName = string;

export interface DebugStart {
  x: number;
  z: number;
  yawDegrees?: number;
}

const debugStartFromUrl = (params: URLSearchParams): DebugStart | undefined => {
  if (params.get('debug') !== '1') {
    return undefined;
  }
  const raw = params.get('at');
  if (raw === null) {
    return undefined;
  }
  const fields = raw.split(',');
  const values = fields.map((field) => (field.trim() === '' ? Number.NaN : Number(field)));
  if ((values.length !== 2 && values.length !== 3) || values.some((value) => !Number.isFinite(value))) {
    // biome-ignore lint/suspicious/noConsole: a malformed debug URL needs a visible fallback warning.
    console.warn(`Ignoring invalid debug start position "${raw}"; expected at=x,z[,yaw] in metres/degrees.`);
    return undefined;
  }
  const [x, z, yawDegrees] = values;
  return { x: x!, z: z!, ...(yawDegrees === undefined ? {} : { yawDegrees }) };
};

// URL parsing precedes world construction; only admitted files may contribute authored ids.
const authoredIds = new Set(BUNDLED_CONTENT.registry.layouts.keys());
// A rejected or absent optional tuning file leaves startup usable with weathering disabled.
const baseWeatheringStrength = BUNDLED_CONTENT.registry.weathering.get('world')?.strength ?? 0;

const MAX_STOREYS = 20;

/**
 * `?site=city` and `?storeys=N` build the stress-test city; `?site=testHouse` selects the test house;
 * `fallback` is the site otherwise.
 */
export const siteFromUrl = (
  params: URLSearchParams,
  fallback: SiteName,
): Pick<GameConfig, 'site' | 'storeys' | 'density'> => {
  const densityText = params.get('density');
  const density = densityText === null || densityText.trim() === '' ? null : Number(densityText);
  const storeys = Number(params.get('storeys') ?? 1);
  const requested = params.get('site');
  return {
    site:
      requested === 'city' ||
      requested === 'testHouse' ||
      requested === 'forest' ||
      requested === 'hamlet' ||
      (requested !== null && authoredIds.has(requested))
        ? requested
        : fallback,
    storeys: Number.isInteger(storeys) && storeys >= 1 && storeys <= MAX_STOREYS ? storeys : 1,
    density: density !== null && Number.isFinite(density) && density >= 0 && density <= 1 ? density : null,
  };
};

/**
 * Reads `?seed=`, `?radius=` (metres), `?time=HH:MM`, `?debug=1` and the site, falling back to defaults.
 * With `?debug=1`, `?weathering=0..1` overrides the core-content value for comparison, and the debug tools also read and write the look parameters (`?tone=`, `?exposure=`,
 * `?srgb=`, `?patterns=`), documented in src/debug/lookUrl.ts.
 */
export const configFromUrl = (params: URLSearchParams): GameConfig => {
  const radius = Number(params.get('radius') ?? DEFAULT_RADIUS_M);
  const config = makeConfig(
    Number(params.get('seed') ?? 1) | 0,
    radius >= MIN_RADIUS_M && radius <= MAX_RADIUS_M ? radius : DEFAULT_RADIUS_M,
  );
  Object.assign(config, siteFromUrl(params, 'hamlet'));
  const layoutTime = BUNDLED_CONTENT.registry.layouts.get(config.site)?.startTimeGameTimeOfDay;
  const requestedTime = params.get('time');
  config.start = requestedTime === null ? (layoutTime ?? SPAWN_TIME) : (parseTimeOfDay(requestedTime) ?? SPAWN_TIME);
  config.debug = params.get('debug') === '1';
  const weatheringText = params.get('weathering');
  const weathering = weatheringText === null || weatheringText.trim() === '' ? Number.NaN : Number(weatheringText);
  if (config.debug && Number.isFinite(weathering)) {
    config.weathering = clampWeathering(weathering);
  }
  const debugStart = debugStartFromUrl(params);
  if (debugStart) {
    config.debugStart = debugStart;
  }
  if (config.debug && params.get('handedness') === 'left') {
    config.debugHandedness = 'left';
  }
  config.actors = actorRendererFromUrl(params);
  return config;
};
