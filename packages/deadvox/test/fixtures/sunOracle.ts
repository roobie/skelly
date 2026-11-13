import type { DayCycle } from '@skelly/engine/internal/core/dayPhase.ts';
import { sunDirection } from '@skelly/engine/internal/core/sky.ts';
import { raycast, type SolidAt } from '@skelly/engine/world';

/** An uncached daylight sky-exposure test: the oracle `SunExposureCache` is checked against. */
export const sunExposedAt = ({
  position,
  gameHours,
  skyTop,
  isOpaque,
  cycle,
}: {
  position: readonly [number, number, number];
  gameHours: number;
  skyTop: number;
  isOpaque: SolidAt;
  cycle: DayCycle;
}): boolean => {
  if (sunDirection(gameHours, cycle)[1] <= 0) {
    return false;
  }
  const distance = skyTop - position[1];
  if (distance <= 0) {
    return false;
  }
  const origin: [number, number, number] = [position[0], position[1] + 1e-4, position[2]];
  return raycast(origin, [0, 1, 0], distance, isOpaque) === undefined;
};
