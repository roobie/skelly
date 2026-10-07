import type { Vec3 } from './coords.ts';
import type { SoundEventId } from './soundEvents.ts';

export type PlayerGait = 'still' | 'walking' | 'jogging' | 'sprinting';

export const STEP_DISTANCE_METRES: Readonly<Record<Exclude<PlayerGait, 'still'>, number>> = {
  walking: 0.75,
  jogging: 1.2,
  sprinting: 1.6,
};

export const HARD_LANDING_METRES = 2.5;

const INITIAL_STRIDE_PHASE = 0.75;

export interface FootstepClock {
  gait: PlayerGait;
  distanceUntilStep: number;
  /** Fraction of a two-step stride, shared by walking presentation and readied-firearm wobble. */
  stridePhase: number;
  /** Monotonic footfall index seeds deterministic, step-eased aim jitter. */
  stepIndex: number;
}

export const initialFootstepClock = (): FootstepClock => ({
  gait: 'still',
  distanceUntilStep: 0,
  stridePhase: INITIAL_STRIDE_PHASE,
  stepIndex: 0,
});

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
  ['tree_trunk', 'footstep_wood'],
  ['tree_branch', 'footstep_wood'],
  ['leaves', 'footstep_leaves'],
  ['hedge', 'footstep_leaves'],
  ['leaf_litter', 'footstep_leaves'],
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
    return { clock: { ...initialFootstepClock(), stepIndex: clock.stepIndex }, steps: 0 };
  }
  const stepDistance = STEP_DISTANCE_METRES[gait];
  const remaining = clock.gait === gait ? clock.distanceUntilStep : stepDistance;
  const stridePhase =
    (clock.gait === gait ? clock.stridePhase : INITIAL_STRIDE_PHASE) + travelledMetres / (2 * stepDistance);
  const normalizedStridePhase = stridePhase - Math.floor(stridePhase);
  if (travelledMetres < remaining) {
    return {
      clock: {
        gait,
        distanceUntilStep: remaining - travelledMetres,
        stridePhase: normalizedStridePhase,
        stepIndex: clock.stepIndex,
      },
      steps: 0,
    };
  }
  const afterFirst = travelledMetres - remaining;
  const steps = 1 + Math.floor(afterFirst / stepDistance);
  const distanceUntilStep = stepDistance - (afterFirst % stepDistance);
  return {
    clock: { gait, distanceUntilStep, stridePhase: normalizedStridePhase, stepIndex: clock.stepIndex + steps },
    steps,
  };
};

export interface ShamblerFootstepClock {
  distanceUntilStep: number;
  nextLongStep: boolean;
}

/** Alternating short/long strides make the shamblers' ground cadence uneven, without a wall-clock timer. */
export const initialShamblerFootstepClock = (stepLengthMetres: number): ShamblerFootstepClock => ({
  distanceUntilStep: stepLengthMetres * 0.72,
  nextLongStep: true,
});

export const advanceShamblerFootsteps = (
  clock: ShamblerFootstepClock,
  travelledMetres: number,
  stepLengthMetres: number,
): { clock: ShamblerFootstepClock; steps: number } => {
  if (!(travelledMetres > 0)) {
    return { clock, steps: 0 };
  }
  let { distanceUntilStep: remaining, nextLongStep } = clock;
  let distance = travelledMetres;
  let steps = 0;
  while (distance >= remaining) {
    distance -= remaining;
    steps += 1;
    remaining = stepLengthMetres * (nextLongStep ? 1.28 : 0.72);
    nextLongStep = !nextLongStep;
  }
  return { clock: { distanceUntilStep: remaining - distance, nextLongStep }, steps };
};

const SHAMBLER_SURFACE_EVENTS = new Map<string, SoundEventId>([
  ['grass', 'shambler_step_grass'],
  ['dirt', 'shambler_step_mud'],
  ['sand', 'shambler_step_sand'],
  ['asphalt', 'shambler_step_stone'],
  ['stone', 'shambler_step_stone'],
  ['concrete', 'shambler_step_stone'],
  ['brick', 'shambler_step_stone'],
  ['plaster', 'shambler_step_stone'],
  ['tiles', 'shambler_step_stone'],
  ['roof', 'shambler_step_stone'],
  ['window_frame', 'shambler_step_stone'],
  ['planks', 'shambler_step_wood'],
  ['tree_trunk', 'shambler_step_wood'],
  ['tree_branch', 'shambler_step_wood'],
  ['leaves', 'shambler_step_leaves'],
  ['hedge', 'shambler_step_leaves'],
  ['leaf_litter', 'shambler_step_leaves'],
  ['fabric', 'shambler_step_leaves'],
  ['carpet', 'shambler_step_leaves'],
]);

/** Surface-to-event pairing mirrors player footsteps; unknown surfaces use the hard-ground sound. */
export const shamblerFootstepEventForBlock = (blockId: string): SoundEventId =>
  SHAMBLER_SURFACE_EVENTS.get(blockId) ?? 'shambler_step_stone';

/** Selects the surface cell immediately below a grounded actor's feet. */
export const shamblerFootstepEventAt = (
  position: Vec3,
  blockIdAt: (x: number, y: number, z: number) => string,
): SoundEventId => {
  const x = Math.floor(position[0]);
  const y = Math.floor(position[1] + 0.01) - 1;
  const z = Math.floor(position[2]);
  return shamblerFootstepEventForBlock(blockIdAt(x, y, z));
};

export const isHardLanding = (fallHeightMetres: number): boolean => fallHeightMetres >= HARD_LANDING_METRES;
