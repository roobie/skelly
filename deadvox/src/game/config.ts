import { parseTimeOfDay, SPAWN_TIME } from '../core/clock.ts';
import { BLOCK_SIZE, chunksFor, makeScale, type Scale } from '../core/scale.ts';

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
  /**
   * What stands near spawn: the hamlet, milestone 1.0's test house (the benchmark's
   * scene), or the stress-test city.
   */
  site: SiteName;
  /** The city's tallest buildings, in storeys (`?storeys=N`). */
  storeys: number;
  /** Fixed occupancy override (`?density=0..1`); null selects the frozen seeded field. */
  density: number | null;
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
    actors: 'detailed',
  };
};

/** `?actors=boxes`; anything else (including absent) is 'detailed'. */
export const actorRendererFromUrl = (params: URLSearchParams): ActorRenderer =>
  params.get('actors') === 'boxes' ? 'boxes' : 'detailed';

export type SiteName = string;

// URL parsing precedes world construction. Discover authored ids from the same bundled pack.
const layoutFiles = import.meta.glob<{ layouts?: { id: string }[] }>('../content/base/*.json', {
  eager: true,
  import: 'default',
});
const authoredIds = new Set(
  Object.values(layoutFiles).flatMap((file) => (file.layouts ?? []).map((layout) => layout.id)),
);

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
 * With `?debug=1` the debug tools also read and write the look parameters (`?tone=`, `?exposure=`,
 * `?srgb=`, `?patterns=`), documented in src/debug/lookUrl.ts.
 */
export const configFromUrl = (params: URLSearchParams): GameConfig => {
  const radius = Number(params.get('radius') ?? DEFAULT_RADIUS_M);
  const config = makeConfig(
    Number(params.get('seed') ?? 1) | 0,
    radius >= MIN_RADIUS_M && radius <= MAX_RADIUS_M ? radius : DEFAULT_RADIUS_M,
  );
  config.start = parseTimeOfDay(params.get('time') ?? '') ?? SPAWN_TIME;
  config.debug = params.get('debug') === '1';
  config.actors = actorRendererFromUrl(params);
  Object.assign(config, siteFromUrl(params, 'hamlet'));
  return config;
};
