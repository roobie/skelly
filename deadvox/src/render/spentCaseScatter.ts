// Deterministic, presentation-only case scatter for a spent-case pile.

import type { Vec3 } from '../core/coords.ts';
import { Rng } from '../core/random.ts';

export const SPENT_CASE_ITEM_PREFIX = 'spent_case_';
export const SPENT_CASE_SCATTER_CAP = 48;

export interface SpentCaseInstance {
  readonly position: Vec3;
  readonly rotation: Vec3;
}

/** Stable from world seed, pile anchor and count; after the cap, the layout stays unchanged. */
export const spentCaseScatter = (
  worldSeed: number,
  pilePos: Vec3,
  count: number,
  blockSize: number,
): SpentCaseInstance[] => {
  const shown = Math.min(Math.max(0, Math.floor(count)), SPENT_CASE_SCATTER_CAP);
  if (shown === 0) {
    return [];
  }
  const rng = Rng.stream(worldSeed, `spent-case-pile:${pilePos.join(',')}`);
  const phase = rng.range(0, 2 * Math.PI);
  const spread = blockSize * (0.12 + 0.3 * Math.sqrt((shown - 1) / (SPENT_CASE_SCATTER_CAP - 1)));
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const [x, y, z] = pilePos;
  return Array.from({ length: shown }, (_, index) => {
    const radius = spread * Math.sqrt((index + 0.5) / shown);
    const angle = phase + index * goldenAngle;
    return {
      position: [
        (x + 0.5) * blockSize + Math.cos(angle) * radius,
        y * blockSize + 0.006,
        (z + 0.5) * blockSize + Math.sin(angle) * radius,
      ],
      rotation: [rng.range(0, Math.PI), rng.range(0, 2 * Math.PI), rng.range(0, Math.PI)],
    };
  });
};
