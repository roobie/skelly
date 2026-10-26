import { parseTimeOfDay } from '../core/clock.ts';
import { type Registry, requireDayCycle } from '../core/content.ts';
import { CORE_CONTENT_IDS } from '../core/contentIds.ts';
import { CHUNK } from '../core/coords.ts';
import type { HandSide } from '../core/inventory.ts';
import { BLOCK_SIZE, chunksFor, makeScale, type Scale } from '../core/scale.ts';
import type { WeatheringDef } from '../core/schema.ts';
import { DEFAULT_WEATHERING_PROFILE_ID } from '../core/weather.ts';
import { resolveWeatheringUrl } from '../core/weatheringUrl.ts';
import type { StartupContent } from './bundledContent.ts';

export const DEFAULT_RADIUS_M = 96;
const MIN_RADIUS_M = 32;
const MAX_RADIUS_M = 256;

export interface GameConfig {
  content: StartupContent;
  seed: number;
  scale: Scale;
  /** View (mesh) radius in metres. */
  radiusM: number;
  /** The same radius in chunks, rounded up. */
  radiusChunks: number;
  /** Content-owned startup ring, capped by the view radius. */
  readyRadiusChunks: number;
  /** Content-owned streaming hysteresis in chunks, which may be fractional. */
  streamHysteresisChunks: number;
  /** Calendar seconds at the start (time of day on day 1). */
  start: number;
  /** Debug keys are on (`?debug=1`). */
  debug: boolean;
  /** Fresh debug games may override the start-card hand (`?handedness=left`). */
  debugHandedness?: HandSide;
  /** Debug-only walking-lune vertical/horizontal ratio (`?wobbleFlat=0..1`). */
  debugWobbleFlat?: number;
  /** Debug-only OU noise strength multiplier (`?wobbleNoiseScale=0..8`). */
  debugWobbleNoiseScale?: number;
  /** Debug-only fresh-session start in metres (`?at=x,z[,yawDegrees]`). */
  debugStart?: DebugStart;
  /**
   * A fresh start facing a showroom prop of this furniture type (`?focus=<furniture>`), so a look request lands
   * in front of the thing to look at. See `docs/test-house.md`, "Focus".
   */
  focus?: string;
  /**
   * The selected scenario, authored layout or debug world.
   */
  site: SiteName;
  authoredDecals: boolean;
  /** The city's tallest buildings, in storeys (`?storeys=N`). */
  storeys: number;
  /** Fixed occupancy override (`?density=0..1`); null selects the frozen seeded field. */
  density: number | null;
  /** Profile id selected for this site, with debug URL selection applied. */
  weatheringProfileId: string;
  /** Site's authored weathering profile id, which is the URL's default. */
  weatheringDefaultProfileId: string;
  /** Render-only weathering profile with optional debug URL edits applied. */
  weathering: WeatheringDef | undefined;
  /** Debug-only world-x boundary; only fragments east of it receive weathering. */
  weatheringSplit?: number;
  /** Zombies are drawn as full mobgen actors (src/render/mobActors.ts) by default; `?actors=boxes` draws
   * ZombieMeshes' six boxes instead. */
  actors: ActorRenderer;
}

export type ActorRenderer = 'boxes' | 'detailed';

const defaultStart = (content: StartupContent): number => requireDayCycle(content.registry).defaultStartGameTimeOfDay;

/** `?time=` wins, then the layout's own time; the weathering test site defaults to noon. */
const startTime = (
  content: StartupContent,
  site: string,
  layoutTime: number | undefined,
  requestedTime: string | null,
): number => {
  if (requestedTime !== null) {
    return parseTimeOfDay(requestedTime) ?? defaultStart(content);
  }
  if (layoutTime !== undefined) {
    return layoutTime;
  }
  return site === 'weatheringTest' ? requireDayCycle(content.registry).noonGameTimeOfDay : defaultStart(content);
};

/** The benchmark passes other block sizes; the game always uses BLOCK_SIZE. */
export const makeConfig = (
  seed: number,
  radiusM: number,
  content: StartupContent,
  blockSize = BLOCK_SIZE,
): GameConfig => {
  const scale = makeScale(blockSize);
  const profile = content.registry.weathering.get(DEFAULT_WEATHERING_PROFILE_ID);
  const graphics = content.registry.graphics.get(CORE_CONTENT_IDS.coreGraphics);
  if (!graphics) {
    throw new Error('Missing core graphics tuning');
  }
  return {
    content,
    seed,
    scale,
    radiusM,
    radiusChunks: chunksFor(scale, radiusM),
    readyRadiusChunks: chunksFor(scale, Math.min(radiusM, graphics.readyRadiusM)),
    streamHysteresisChunks: graphics.streamHysteresisM / (CHUNK * scale.blockSize),
    start: defaultStart(content),
    debug: false,
    site: 'gauntlet',
    authoredDecals: true,
    storeys: 1,
    density: null,
    weatheringProfileId: DEFAULT_WEATHERING_PROFILE_ID,
    weatheringDefaultProfileId: DEFAULT_WEATHERING_PROFILE_ID,
    weathering: profile ? { ...profile } : undefined,
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

const debugWobbleFlatFromUrl = (params: URLSearchParams): number | undefined => {
  if (params.get('debug') !== '1') {
    return undefined;
  }
  const raw = params.get('wobbleFlat');
  if (raw === null || raw.trim() === '') {
    return undefined;
  }
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : undefined;
};

const debugWobbleNoiseScaleFromUrl = (params: URLSearchParams): number | undefined => {
  if (params.get('debug') !== '1') {
    return undefined;
  }
  const raw = params.get('wobbleNoiseScale');
  if (raw === null || raw.trim() === '') {
    return undefined;
  }
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 && value <= 8 ? value : undefined;
};

const debugWeatheringSplitFromUrl = (params: URLSearchParams, debug: boolean, site: SiteName): number | undefined => {
  if (!debug) {
    return undefined;
  }
  const raw = params.get('weatheringSplit');
  const value = raw === null || raw.trim() === '' ? Number.NaN : Number(raw);
  if (Number.isFinite(value) && value >= -256 && value <= 256) {
    return value;
  }
  if (raw !== null && raw.trim() !== '') {
    // biome-ignore lint/suspicious/noConsole: a malformed debug URL needs a visible fallback warning.
    console.warn(`Ignoring invalid weatheringSplit value "${raw}"; expected a number from -256 to 256 metres.`);
  }
  return site === 'weatheringTest' && raw === null ? 0 : undefined;
};

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

const MAX_STOREYS = 20;

/**
 * `?site=city` and `?storeys=N` build the stress-test city; `?site=testHouse` selects the test house;
 * `?site=weatheringTest` selects the debug-only comparison; `fallback` is the site otherwise.
 */
export const siteFromUrl = (
  params: URLSearchParams,
  fallback: SiteName,
  registry: Pick<Registry, 'layouts' | 'scenarios'>,
): Pick<GameConfig, 'site' | 'storeys' | 'density'> => {
  const densityText = params.get('density');
  const density = densityText === null || densityText.trim() === '' ? null : Number(densityText);
  const storeys = Number(params.get('storeys') ?? 1);
  const requested = params.get('site');
  const debug = params.get('debug') === '1';
  return {
    site:
      requested === 'city' ||
      requested === 'testHouse' ||
      requested === 'forest' ||
      (debug && requested === 'weatheringTest') ||
      (requested !== null && (registry.layouts.has(requested) || registry.scenarios.has(requested)))
        ? requested
        : fallback,
    storeys: Number.isInteger(storeys) && storeys >= 1 && storeys <= MAX_STOREYS ? storeys : 1,
    density: density !== null && Number.isFinite(density) && density >= 0 && density <= 1 ? density : null,
  };
};

export const applyWeatheringConfig = (
  config: GameConfig,
  params: URLSearchParams,
  registry: Pick<Registry, 'layouts' | 'weathering'> = config.content.registry,
): void => {
  config.weatheringDefaultProfileId =
    registry.layouts.get(config.site)?.weatheringProfile ?? DEFAULT_WEATHERING_PROFILE_ID;
  const weathering = resolveWeatheringUrl(params, registry.weathering, config.weatheringDefaultProfileId, config.debug);
  config.weatheringProfileId = weathering?.profileId ?? config.weatheringDefaultProfileId;
  config.weathering = weathering?.settings;
};

/**
 * Reads `?seed=`, `?radius=` (metres), `?time=HH:MM`, `?debug=1` and the site, falling back to defaults.
 * A site uses its authored weathering profile or the default; debug URLs can select a profile and tune its values, or set `?weatheringSplit=<x metres>` to limit it to world x at or east of the split. The debug tools also read and write look parameters, documented in src/debug/lookUrl.ts.
 */
export const configFromUrl = (params: URLSearchParams, content: StartupContent): GameConfig => {
  const radius = Number(params.get('radius') ?? DEFAULT_RADIUS_M);
  const config = makeConfig(
    Number(params.get('seed') ?? 1) | 0,
    radius >= MIN_RADIUS_M && radius <= MAX_RADIUS_M ? radius : DEFAULT_RADIUS_M,
    content,
  );
  Object.assign(config, siteFromUrl(params, 'gauntlet', content.registry));
  config.authoredDecals = params.get('decals') !== '0';
  const layoutTime = content.registry.layouts.get(config.site)?.startTimeGameTimeOfDay;
  const requestedTime = params.get('time');
  config.start = startTime(content, config.site, layoutTime, requestedTime);
  config.debug = params.get('debug') === '1';
  applyWeatheringConfig(config, params);
  const weatheringSplit = debugWeatheringSplitFromUrl(params, config.debug, config.site);
  if (weatheringSplit !== undefined) {
    config.weatheringSplit = weatheringSplit;
  }
  const debugStart = debugStartFromUrl(params);
  if (debugStart) {
    config.debugStart = debugStart;
  }
  const focus = params.get('focus')?.trim();
  if (focus) {
    config.focus = focus;
  }
  if (config.debug && params.get('handedness') === 'left') {
    config.debugHandedness = 'left';
  }
  const debugWobbleFlat = debugWobbleFlatFromUrl(params);
  if (debugWobbleFlat !== undefined) {
    config.debugWobbleFlat = debugWobbleFlat;
  }
  const debugWobbleNoiseScale = debugWobbleNoiseScaleFromUrl(params);
  if (debugWobbleNoiseScale !== undefined) {
    config.debugWobbleNoiseScale = debugWobbleNoiseScale;
  }
  config.actors = actorRendererFromUrl(params);
  return config;
};
