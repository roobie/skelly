import { chunksFor, makeScale, type Scale } from '../core/scale.ts';

/** Block sizes the game accepts, in metres. */
export const BLOCK_SIZES: readonly number[] = [1, 0.5];
export const DEFAULT_BLOCK_SIZE = 0.5;
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

export const makeConfig = (seed: number, blockSize: number, radiusM: number): GameConfig => {
  const scale = makeScale(blockSize);
  return { seed, scale, radiusM, radiusChunks: chunksFor(scale, radiusM) };
};

/** Reads `?seed=`, `?block=` (metres) and `?radius=` (metres), falling back to defaults. */
export const configFromUrl = (params: URLSearchParams): GameConfig => {
  const block = Number(params.get('block') ?? DEFAULT_BLOCK_SIZE);
  const radius = Number(params.get('radius') ?? DEFAULT_RADIUS_M);
  return makeConfig(
    Number(params.get('seed') ?? 1) | 0,
    BLOCK_SIZES.includes(block) ? block : DEFAULT_BLOCK_SIZE,
    radius >= MIN_RADIUS_M && radius <= MAX_RADIUS_M ? radius : DEFAULT_RADIUS_M,
  );
};
