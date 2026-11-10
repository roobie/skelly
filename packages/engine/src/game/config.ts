import { claimed, claimedId } from '../core/capabilities.ts';
import { parseTimeOfDay } from '../core/clock.ts';
import { type Registry, requireDayCycle } from '../core/content.ts';
import { CHUNK } from '../core/coords.ts';
import { GENERATED_SITES } from '../core/generatedSites.ts';
import { BLOCK_SIZE, chunksFor, makeScale, type Scale } from '../core/scale.ts';
import type { WeatheringDef } from '../core/schema.ts';
import { resolveWeatheringUrl, type WeatheringTuning } from '../core/weatheringUrl.ts';
import type { VoicePitchOverrides } from './actorAudio.ts';
import type { StartupContent } from './bundledContent.ts';
import { sweepFromUrl } from './ragdollConfig.ts';
import { requireStart, startForSite } from './startSelection.ts';

export const DEFAULT_RADIUS_M = 96;
const MIN_RADIUS_M = 32;
const MAX_RADIUS_M = 256;

export interface GameConfig {
  content: StartupContent;
  startId: string;
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
  /** Content-owned camera far plane as a multiple of the fog's end. */
  fogFarPlaneScale: number;
  /** Calendar seconds at the start (time of day on day 1). */
  start: number;
  /** Debug keys are on (hash `debug`). */
  debug: boolean;
  ragdollSweep?: number;
  /** Debug-only walking-lune vertical/horizontal ratio (hash `wobbleFlat`, 0 to 1). */
  debugWobbleFlat?: number;
  /** Debug-only OU noise strength multiplier (hash `wobbleNoiseScale`, 0 to 8). */
  debugWobbleNoiseScale?: number;
  /** The voice-size probe's pitch multipliers, set only in a debug run of that site. */
  debugVoicePitch?: VoicePitchOverrides;
  /** Debug-only fresh-session start in metres (hash `at`, `[x,z]` or `[x,z,yawDegrees]`). */
  debugStart?: DebugStart;
  /**
   * A fresh start facing a showroom prop of this furniture type (hash `focus`), so a look request lands
   * in front of the thing to look at. See `packages/deadvox/docs/test-house.md`, "Focus".
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
  /** Zombies are drawn as full built figures (`packages/presentation/src/render/mobActors.ts`) by default; hash
   * `actors:boxes` draws ActorMeshes' six boxes instead. */
  actors: ActorRenderMode;
}

/**
 * The developer state a product reads from its page hash and passes in, so the engine never reads the page URL.
 * Every key is optional and an absent key keeps the default. Why this is hash state:
 * `docs/decisions/0006-url-mods-and-hash-state.md`, "Decision".
 */
export type DeveloperState = WeatheringTuning & {
  readonly debug?: boolean;
  readonly save?: boolean;
  readonly seed?: number;
  readonly radius?: number;
  readonly actors?: string;
  readonly decals?: boolean;
  readonly at?: readonly number[];
  readonly focus?: string;
  readonly weatheringSplit?: number;
  readonly wobbleFlat?: number;
  readonly wobbleNoiseScale?: number;
  readonly voicePitch?: number;
  readonly voicePitchLarge?: number;
  readonly ragdollSweep?: number;
};

export type ActorRenderMode = 'boxes' | 'detailed';

const defaultStart = (content: StartupContent): number => requireDayCycle(content.registry).defaultStartGameTimeOfDay;

/** The benchmark passes other block sizes; the game always uses BLOCK_SIZE. */
export const makeConfig = (
  seed: number,
  radiusM: number,
  content: StartupContent,
  blockSize = BLOCK_SIZE,
): GameConfig => {
  const selectedStart = requireStart(content, content.defaultStart);
  const scale = makeScale(blockSize);
  const profile = claimed(content.registry.weathering, 'defaultWeathering');
  const profileId = claimedId(content.registry.weathering, 'defaultWeathering');
  const graphics = claimed(content.registry.graphics, 'graphics');
  if (!graphics) {
    throw new Error('Missing core graphics tuning');
  }
  return {
    content,
    startId: selectedStart.id,
    seed,
    scale,
    radiusM,
    radiusChunks: chunksFor(scale, radiusM),
    readyRadiusChunks: chunksFor(scale, Math.min(radiusM, graphics.readyRadiusM)),
    streamHysteresisChunks: graphics.streamHysteresisM / (CHUNK * scale.blockSize),
    fogFarPlaneScale: graphics.fogFarPlaneScale,
    start: selectedStart.startTimeGameTimeOfDay ?? defaultStart(content),
    debug: false,
    site: selectedStart.site,
    authoredDecals: true,
    storeys: selectedStart.storeys ?? 1,
    density: selectedStart.density ?? null,
    weatheringProfileId: profileId,
    weatheringDefaultProfileId: profileId,
    weathering: profile ? { ...profile } : undefined,
    actors: 'detailed',
  };
};

/** `boxes`; anything else (including absent) is 'detailed'. */
export const actorRendererFromUrl = (actors: string | null | undefined): ActorRenderMode =>
  actors === 'boxes' ? 'boxes' : 'detailed';

export type SiteName = string;

export interface DebugStart {
  x: number;
  z: number;
  yawDegrees?: number;
}

/** A debug-only number inside its bounds; anything else keeps the default. */
const debugNumber = (hash: DeveloperState, value: number | undefined, min: number, max: number): number | undefined =>
  hash.debug === true && value !== undefined && Number.isFinite(value) && value >= min && value <= max
    ? value
    : undefined;

const debugWeatheringSplit = (hash: DeveloperState, site: SiteName): number | undefined => {
  if (hash.debug !== true) {
    return undefined;
  }
  const split = debugNumber(hash, hash.weatheringSplit, -256, 256);
  if (split === undefined && hash.weatheringSplit !== undefined) {
    // biome-ignore lint/suspicious/noConsole: a malformed debug hash needs a visible fallback warning.
    console.warn(
      `Ignoring invalid weatheringSplit value "${hash.weatheringSplit}"; expected a number from -256 to 256 metres.`,
    );
  }
  return split ?? (site === 'weatheringTest' && hash.weatheringSplit === undefined ? 0 : undefined);
};

const debugStartOf = ({ debug, at }: DeveloperState): DebugStart | undefined => {
  if (debug !== true || at === undefined) {
    return undefined;
  }
  if (at.length !== 2 && at.length !== 3) {
    // biome-ignore lint/suspicious/noConsole: a malformed debug hash needs a visible fallback warning.
    console.warn(`Ignoring invalid debug start position [${at.join(',')}]; expected at:[x,z] or [x,z,yaw].`);
    return undefined;
  }
  const [x, z, yawDegrees] = at;
  return { x: x!, z: z!, ...(yawDegrees === undefined ? {} : { yawDegrees }) };
};

const MAX_STOREYS = 20;

/** A debug run is ephemeral, so it neither saves nor loads unless hash `save` also asks for it. */
export const savingEnabledFromUrl = (hash: DeveloperState): boolean => hash.debug !== true || hash.save === true;

/** Authored scene names require admitted rows; only generated-site selectors bypass that lookup. */
export const siteFromUrl = (
  params: URLSearchParams,
  fallback: SiteName,
  registry: Pick<Registry, 'layouts' | 'scenarios'>,
  debug = false,
): Pick<GameConfig, 'site' | 'storeys' | 'density'> => {
  const densityText = params.get('density');
  const density = densityText === null || densityText.trim() === '' ? null : Number(densityText);
  const storeys = Number(params.get('storeys') ?? 1);
  const requested = params.get('site');
  return {
    site:
      (requested !== null && GENERATED_SITES.has(requested) && (debug || requested !== 'weatheringTest')) ||
      (requested !== null && (registry.layouts.has(requested) || registry.scenarios.has(requested)))
        ? requested
        : fallback,
    storeys: Number.isInteger(storeys) && storeys >= 1 && storeys <= MAX_STOREYS ? storeys : 1,
    density: density !== null && Number.isFinite(density) && density >= 0 && density <= 1 ? density : null,
  };
};

/** The query still names the weathering profile; the hash carries the debug tuning. */
export const applyWeatheringConfig = (
  config: GameConfig,
  query: URLSearchParams,
  hash: WeatheringTuning,
  registry: Pick<Registry, 'layouts' | 'weathering'> = config.content.registry,
): void => {
  config.weatheringDefaultProfileId =
    registry.layouts.get(config.site)?.weatheringProfile ?? claimedId(registry.weathering, 'defaultWeathering');
  const weathering = resolveWeatheringUrl(
    { profile: query.get('weatheringProfile'), tuning: hash },
    registry.weathering,
    config.weatheringDefaultProfileId,
    config.debug,
  );
  config.weatheringProfileId = weathering?.profileId ?? config.weatheringDefaultProfileId;
  config.weathering = weathering?.settings;
};

const applyStartConfig = (config: GameConfig, params: URLSearchParams, hash: DeveloperState): void => {
  const { content } = config;
  const requestedStart = params.get('start');
  const selected = requireStart(content, requestedStart ?? content.defaultStart, config.debug);
  const siteSelection = siteFromUrl(params, selected.site, content.registry, config.debug);
  const start =
    requestedStart === null && params.has('site') ? startForSite(content, siteSelection.site, config.debug) : selected;
  if (requestedStart !== null && params.has('site') && params.get('site') !== start.site) {
    throw new Error(`Start "${start.id}" requires site "${start.site}"`);
  }
  config.startId = start.id;
  config.site = siteSelection.site;
  config.seed = hash.seed === undefined ? (start.seed ?? crypto.getRandomValues(new Int32Array(1))[0]!) : hash.seed | 0;
  config.storeys = params.has('storeys') ? siteSelection.storeys : (start.storeys ?? 1);
  config.density = params.has('density') ? siteSelection.density : (start.density ?? null);
  const requestedTime = params.get('time');
  config.start =
    requestedTime === null
      ? (start.startTimeGameTimeOfDay ?? defaultStart(content))
      : (parseTimeOfDay(requestedTime) ?? defaultStart(content));
};

/**
 * Reads the start, site and time the query still names, then the developer state the product read from its hash,
 * falling back to defaults. A site uses its authored weathering profile or the default; a debug hash can tune its
 * values, or set `weatheringSplit` to limit it to world x at or east of the split. The debug tools also read and
 * write look state, documented in `packages/deadvox/src/debug/lookUrl.ts`.
 * The product supplies where its ragdoll sweep places the viewer.
 */
export const configFromUrl = (
  query: URLSearchParams,
  hash: DeveloperState,
  content: StartupContent,
  ragdollSweepViewer: DebugStart,
): GameConfig => {
  const radius = hash.radius ?? DEFAULT_RADIUS_M;
  const config = makeConfig(
    (hash.seed ?? 0) | 0,
    radius >= MIN_RADIUS_M && radius <= MAX_RADIUS_M ? radius : DEFAULT_RADIUS_M,
    content,
  );
  config.debug = hash.debug === true;
  applyStartConfig(config, query, hash);
  config.authoredDecals = hash.decals !== false;
  Object.assign(config, sweepFromUrl(query, hash.ragdollSweep, config, ragdollSweepViewer));
  applyWeatheringConfig(config, query, hash);
  const weatheringSplit = debugWeatheringSplit(hash, config.site);
  if (weatheringSplit !== undefined) {
    config.weatheringSplit = weatheringSplit;
  }
  const debugStart = debugStartOf(hash);
  if (debugStart) {
    config.debugStart = debugStart;
  }
  const focus = hash.focus?.trim();
  if (focus) {
    config.focus = focus;
  }
  const debugWobbleFlat = debugNumber(hash, hash.wobbleFlat, 0, 1);
  if (debugWobbleFlat !== undefined) {
    config.debugWobbleFlat = debugWobbleFlat;
  }
  const debugWobbleNoiseScale = debugNumber(hash, hash.wobbleNoiseScale, 0, 8);
  if (debugWobbleNoiseScale !== undefined) {
    config.debugWobbleNoiseScale = debugWobbleNoiseScale;
  }
  if (config.debug && config.site === 'voice_size') {
    config.debugVoicePitch = { voicePitch: hash.voicePitch, voicePitchLarge: hash.voicePitchLarge };
  }
  config.actors = actorRendererFromUrl(hash.actors);
  return config;
};
