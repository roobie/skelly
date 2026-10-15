import type { Vec3 } from './coords.ts';
import type { BlockDef } from './schema.ts';
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

/** The authored player footstep event for a block; a block without a contract (air) is silent. */
export const footstepEventForBlock = (block: BlockDef): SoundEventId | undefined => block.footsteps?.player;

export interface FootstepAdvance {
  clock: FootstepClock;
  steps: number;
}

const distanceToNextFootfall = (stridePhase: number, stepDistance: number): number => {
  const phaseDistance = (0.25 - stridePhase + 1) % 0.5;
  return (phaseDistance === 0 ? 0.5 : phaseDistance) * 2 * stepDistance;
};

/** Emits footfalls from travelled distance; stationary and airborne ticks freeze the shared gait phase. */
export const advanceFootsteps = (clock: FootstepClock, gait: PlayerGait, travelledMetres: number): FootstepAdvance => {
  if (gait === 'still' || !(travelledMetres > 0)) {
    return { clock: { ...clock, gait: 'still', distanceUntilStep: 0 }, steps: 0 };
  }
  const stepDistance = STEP_DISTANCE_METRES[gait];
  const remaining =
    clock.gait === gait ? clock.distanceUntilStep : distanceToNextFootfall(clock.stridePhase, stepDistance);
  const stridePhase = clock.stridePhase + travelledMetres / (2 * stepDistance);
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

/** The authored shambler footstep event for a block; a block without a contract (air) is silent. */
export const shamblerFootstepEventForBlock = (block: BlockDef): SoundEventId | undefined => block.footsteps?.shambler;

/**
 * Samples the block cell immediately below a grounded actor's feet. A chunk id the registry does not cover
 * is an engine invariant failure: authored validation cannot vouch for chunk data written by another pack.
 */
const blockUnderfoot = (
  position: Vec3,
  blockIdAt: (x: number, y: number, z: number) => number,
  blocks: readonly BlockDef[],
): BlockDef => {
  const x = Math.floor(position[0]);
  const y = Math.floor(position[1] + 0.01) - 1;
  const z = Math.floor(position[2]);
  const block = blocks[blockIdAt(x, y, z)];
  if (!block) {
    throw new Error(`chunk block under (${x}, ${y}, ${z}) is outside the content registry`);
  }
  return block;
};

/** Selects the authored player footstep event for the block underfoot, if the block declares one. */
export const footstepEventAt = (
  position: Vec3,
  blockIdAt: (x: number, y: number, z: number) => number,
  blocks: readonly BlockDef[],
): SoundEventId | undefined => footstepEventForBlock(blockUnderfoot(position, blockIdAt, blocks));

/** Selects the authored shambler footstep event for the block underfoot, if the block declares one. */
export const shamblerFootstepEventAt = (
  position: Vec3,
  blockIdAt: (x: number, y: number, z: number) => number,
  blocks: readonly BlockDef[],
): SoundEventId | undefined => shamblerFootstepEventForBlock(blockUnderfoot(position, blockIdAt, blocks));

export const isHardLanding = (fallHeightMetres: number): boolean => fallHeightMetres >= HARD_LANDING_METRES;
