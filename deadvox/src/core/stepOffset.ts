import type { Vec3 } from './coords.ts';

export interface StepOffsetSample {
  readonly position: Vec3;
  readonly grounded: boolean;
}

export interface StepOffsetState {
  readonly previous?: StepOffsetSample;
  readonly offset: number;
}

interface StepOffsetUpdate {
  readonly position: Vec3;
  readonly grounded: boolean;
  readonly dt: number;
  readonly stepHeightMetres: number;
  readonly reset?: boolean;
}

const TELEPORT_METRES = 1;
const STEP_SNAP_FRACTION = 0.8;
const STEP_EASE_SECONDS = 0.25;
const EPSILON = 1e-4;

/** Fixed-step pure transition shared by the shambler simulation and render-only player/box helpers. */
export const updateStepOffset = (state: StepOffsetState, update: StepOffsetUpdate): StepOffsetState => {
  const { position, grounded, dt, stepHeightMetres, reset = false } = update;
  const { offset: initialOffset, previous } = state;
  let offset = initialOffset;
  if (reset) {
    return { offset: 0, previous: { position: [...position], grounded } };
  }

  if (previous) {
    const horizontal = Math.hypot(position[0] - previous.position[0], position[2] - previous.position[2]);
    const vertical = position[1] - previous.position[1];
    if (horizontal > TELEPORT_METRES || Math.abs(vertical) > stepHeightMetres + EPSILON) {
      offset = 0;
    } else if (!(grounded && previous.grounded)) {
      offset = 0;
    } else if (Math.abs(vertical) >= stepHeightMetres * STEP_SNAP_FRACTION) {
      offset = Math.max(-stepHeightMetres, Math.min(stepHeightMetres, offset - vertical));
    }
  }

  if (dt > 0 && offset !== 0) {
    const change = (stepHeightMetres / STEP_EASE_SECONDS) * dt;
    offset = Math.abs(offset) <= change + EPSILON ? 0 : offset - Math.sign(offset) * change;
  }
  return { offset, previous: { position: [...position], grounded } };
};
