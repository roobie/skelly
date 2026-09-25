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
}

/** The benchmark passes other block sizes; the game always uses BLOCK_SIZE. */
export const makeConfig = (seed: number, radiusM: number, blockSize = BLOCK_SIZE): GameConfig => {
  const scale = makeScale(blockSize);
  return { seed, scale, radiusM, radiusChunks: chunksFor(scale, radiusM) };
};

/** Reads `?seed=` and `?radius=` (metres), falling back to defaults. */
export const configFromUrl = (params: URLSearchParams): GameConfig => {
  const radius = Number(params.get('radius') ?? DEFAULT_RADIUS_M);
  return makeConfig(
    Number(params.get('seed') ?? 1) | 0,
    radius >= MIN_RADIUS_M && radius <= MAX_RADIUS_M ? radius : DEFAULT_RADIUS_M,
  );
};
