import type { SoundEventId } from './soundEvents.ts';

export type PlayerGait = 'still' | 'walking' | 'jogging' | 'sprinting';

export const STEP_DISTANCE_METRES: Readonly<Record<Exclude<PlayerGait, 'still'>, number>> = {
  walking: 0.75,
  jogging: 1.2,
  sprinting: 1.6,
};

export const HARD_LANDING_METRES = 2.5;

export interface FootstepClock {
  gait: PlayerGait;
  distanceUntilStep: number;
}

export const initialFootstepClock = (): FootstepClock => ({ gait: 'still', distanceUntilStep: 0 });

const SURFACE_EVENTS = new Map<string, SoundEventId>([
  ['grass', 'footstep_grass'],
  ['dirt', 'footstep_mud'],
  ['sand', 'footstep_sand'],
  ['asphalt', 'footstep_stone'],
  ['stone', 'footstep_stone'],
  ['concrete', 'footstep_stone'],
  ['brick', 'footstep_stone'],
  ['plaster', 'footstep_stone'],
  ['tiles', 'footstep_stone'],
  ['roof', 'footstep_stone'],
  ['window_frame', 'footstep_stone'],
  ['planks', 'footstep_wood'],
  ['fabric', 'footstep_leaves'],
  ['carpet', 'footstep_leaves'],
]);

/** Unmapped modded surfaces use the closest hard-ground set until they get explicit surface metadata. */
export const footstepEventForBlock = (blockId: string): SoundEventId => SURFACE_EVENTS.get(blockId) ?? 'footstep_stone';

export interface FootstepAdvance {
  clock: FootstepClock;
  steps: number;
}

/** Emits one footfall per gait distance actually travelled; airborne and stationary movement resets cadence. */
export const advanceFootsteps = (clock: FootstepClock, gait: PlayerGait, travelledMetres: number): FootstepAdvance => {
  if (gait === 'still' || !(travelledMetres > 0)) {
    return { clock: initialFootstepClock(), steps: 0 };
  }
  const stepDistance = STEP_DISTANCE_METRES[gait];
  const remaining = clock.gait === gait ? clock.distanceUntilStep : stepDistance;
  if (travelledMetres < remaining) {
    return { clock: { gait, distanceUntilStep: remaining - travelledMetres }, steps: 0 };
  }
  const afterFirst = travelledMetres - remaining;
  const steps = 1 + Math.floor(afterFirst / stepDistance);
  const distanceUntilStep = stepDistance - (afterFirst % stepDistance);
  return { clock: { gait, distanceUntilStep }, steps };
};

export const isHardLanding = (fallHeightMetres: number): boolean => fallHeightMetres >= HARD_LANDING_METRES;
