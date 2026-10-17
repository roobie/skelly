import type { Vec3 } from './coords.ts';
import type { BlockDef, SenseDef } from './schema.ts';
import type { SoundEventId } from './soundEvents.ts';

export type PlayerGait = 'still' | 'walking' | 'jogging' | 'sprinting';

export type FootstepTuning = SenseDef['footsteps'];

export const stepDistanceMetres = (tuning: FootstepTuning, gait: Exclude<PlayerGait, 'still'>): number =>
  tuning[`${gait}StepMetres`];

// Mechanism, not a tunable: the stride-phase origin that puts the first footfall of a standing start
// on the downbeat of the shared gait phase; moving it would desynchronise walking presentation from sound.
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
export const advanceFootsteps = (
  clock: FootstepClock,
  gait: PlayerGait,
  travelledMetres: number,
  tuning: FootstepTuning,
): FootstepAdvance => {
  if (gait === 'still' || !(travelledMetres > 0)) {
    return { clock: { ...clock, gait: 'still', distanceUntilStep: 0 }, steps: 0 };
  }
  const stepDistance = stepDistanceMetres(tuning, gait);
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

/** An actor's horizontal half extents in blocks; halfDepth defaults to a square footprint. */
export interface Footprint {
  halfWidth: number;
  halfDepth?: number;
}

/**
 * The blocks under an actor's footprint, nearest to its centre first. A chunk id the registry does not
 * cover is an engine invariant failure: authored validation cannot vouch for chunk data written by
 * another pack.
 */
const supportBlocks = (
  position: Vec3,
  footprint: Footprint,
  blockIdAt: (x: number, y: number, z: number) => number,
  blocks: readonly BlockDef[],
): BlockDef[] => {
  const y = Math.floor(position[1] + 0.01) - 1;
  const { halfWidth, halfDepth: footprintHalfDepth } = footprint;
  const halfDepth = footprintHalfDepth ?? halfWidth;
  const found: { block: BlockDef; distance: number; x: number; z: number }[] = [];
  for (let x = Math.floor(position[0] - halfWidth); x < Math.ceil(position[0] + halfWidth); x++) {
    for (let z = Math.floor(position[2] - halfDepth); z < Math.ceil(position[2] + halfDepth); z++) {
      const block = blocks[blockIdAt(x, y, z)];
      if (!block) {
        throw new Error(`chunk block under (${x}, ${y}, ${z}) is outside the content registry`);
      }
      const dx = x + 0.5 - position[0];
      const dz = z + 0.5 - position[2];
      found.push({ block, distance: dx * dx + dz * dz, x, z });
    }
  }
  // An actor on a ledge can straddle supports; nearest to the centre wins, ties by fixed cell order.
  found.sort((a, b) => a.distance - b.distance || a.x - b.x || a.z - b.z);
  return found.map(({ block }) => block);
};

/** Selects the authored player footstep event for the nearest supporting block, if it declares one. */
export const footstepEventAt = (
  position: Vec3,
  footprint: Footprint,
  blockIdAt: (x: number, y: number, z: number) => number,
  blocks: readonly BlockDef[],
): SoundEventId | undefined => {
  for (const block of supportBlocks(position, footprint, blockIdAt, blocks)) {
    const event = footstepEventForBlock(block);
    if (event !== undefined) {
      return event;
    }
  }
  return undefined;
};

/** Selects the authored shambler footstep event for the nearest supporting block, if it declares one. */
export const shamblerFootstepEventAt = (
  position: Vec3,
  footprint: Footprint,
  blockIdAt: (x: number, y: number, z: number) => number,
  blocks: readonly BlockDef[],
): SoundEventId | undefined => {
  for (const block of supportBlocks(position, footprint, blockIdAt, blocks)) {
    const event = shamblerFootstepEventForBlock(block);
    if (event !== undefined) {
      return event;
    }
  }
  return undefined;
};

export const isHardLanding = (fallHeightMetres: number, tuning: FootstepTuning): boolean =>
  fallHeightMetres >= tuning.hardLandingMetres;
