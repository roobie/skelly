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
  /** What stands near spawn: the hamlet, or milestone 1.0's test house (the benchmark's scene). */
  site: 'hamlet' | 'testHouse';
}

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
  };
};

/** Reads `?seed=`, `?radius=` (metres), `?time=HH:MM` and `?debug=1`, falling back to defaults. */
export const configFromUrl = (params: URLSearchParams): GameConfig => {
  const radius = Number(params.get('radius') ?? DEFAULT_RADIUS_M);
  const config = makeConfig(
    Number(params.get('seed') ?? 1) | 0,
    radius >= MIN_RADIUS_M && radius <= MAX_RADIUS_M ? radius : DEFAULT_RADIUS_M,
  );
  config.start = parseTimeOfDay(params.get('time') ?? '') ?? SPAWN_TIME;
  config.debug = params.get('debug') === '1';
  return config;
};
