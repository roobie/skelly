// A chamber and its moving action are item-owned simulation facts, not queued jobs.
// Automatic motion survives saves; manual handling's motion is cancelled in the save copy.
import type { Vec3 } from './coords.ts';

export interface PendingCase {
  readonly origin: Vec3;
  readonly direction: Vec3;
  readonly feet: Vec3;
  readonly seed: number;
}

export interface FirearmCycleState {
  readonly mode: 'fire' | 'hand';
  readonly startedAt: number;
  elapsed: number;
  /** Effective scheduled duration, including skill effects; stable across animation and recovery. */
  duration?: number;
  ejected: boolean;
  /** Debug AR/AKs feed a virtual round at the end; real ammunition is not invented. */
  readonly feedRound: boolean;
  forwardSounded?: boolean;
}

interface FirearmRaiseState {
  elapsed: number;
  /** Duration sampled when this raise began; saved so progression resumes under the same handling. */
  duration: number;
}

export interface FirearmState {
  chamber: 'empty' | 'round' | 'case';
  /** A real loaded cartridge's item type, when present (debug rifles use virtual rounds). */
  roundType?: string | undefined;
  /** Cartridge item types in feed order; absent for debug virtual-round firearms. */
  tube?: string[];
  /** Simulation-clock hull landing cue, committed separately from the already ejected case. */
  landing?: { at: number; position: Vec3 } | undefined;
  pendingCase?: PendingCase | undefined;
  cycle?: FirearmCycleState | undefined;
  readying?: FirearmRaiseState | undefined;
}

/** No live state is advanced or cancelled by a snapshot. */
export const snapshotFirearm = (state: FirearmState): FirearmState => {
  const { chamber, roundType, tube, landing, pendingCase, cycle, readying } = state;
  return {
    chamber,
    ...(roundType === undefined ? {} : { roundType }),
    ...(tube === undefined ? {} : { tube: [...tube] }),
    ...(landing === undefined ? {} : { landing: structuredClone(landing) }),
    ...(pendingCase === undefined ? {} : { pendingCase: structuredClone(pendingCase) }),
    ...(cycle === undefined || cycle.mode === 'hand' ? {} : { cycle: structuredClone(cycle) }),
    ...(readying === undefined ? {} : { readying: { ...readying } }),
  };
};

const assertPumpExtras = ({ tube, landing }: FirearmState): void => {
  if (tube && (!Array.isArray(tube) || tube.length > 64 || tube.some((type) => typeof type !== 'string'))) {
    throw new Error('Invalid firearm tube');
  }
  if (
    landing &&
    (!Number.isFinite(landing.at) ||
      landing.at < 0 ||
      landing.position.length !== 3 ||
      landing.position.some((value) => !Number.isFinite(value)))
  ) {
    throw new Error('Invalid firearm landing');
  }
};

const assertCycleState = (cycle: FirearmCycleState | undefined): void => {
  if (
    cycle &&
    (!((cycle.mode === 'fire' || cycle.mode === 'hand') && Number.isFinite(cycle.startedAt)) ||
      cycle.startedAt < 0 ||
      !Number.isFinite(cycle.elapsed) ||
      cycle.elapsed < 0 ||
      (cycle.duration !== undefined && (!Number.isFinite(cycle.duration) || cycle.duration <= 0)) ||
      typeof cycle.ejected !== 'boolean' ||
      typeof cycle.feedRound !== 'boolean' ||
      (cycle.forwardSounded !== undefined && typeof cycle.forwardSounded !== 'boolean'))
  ) {
    throw new Error('Invalid firearm cycle');
  }
};

/** Coupled chamber/cycle constraints shared by direct inventory restore and save decoding. */
export const assertFirearmState = (state: FirearmState): void => {
  if (!['empty', 'round', 'case'].includes(state.chamber)) {
    throw new Error('Invalid firearm chamber');
  }
  if ((state.chamber === 'case') !== (state.pendingCase !== undefined)) {
    throw new Error('Fired chamber needs exactly one pending case');
  }
  if (state.roundType !== undefined && state.chamber !== 'round') {
    throw new Error('Loaded cartridge type needs a loaded chamber');
  }
  assertPumpExtras(state);
  const { cycle } = state;
  assertCycleState(cycle);
  if (cycle?.ejected && state.chamber === 'case') {
    throw new Error('Ejected case remains in the chamber');
  }
  const { readying } = state;
  if (
    readying &&
    (!Number.isFinite(readying.elapsed) ||
      readying.elapsed < 0 ||
      !Number.isFinite(readying.duration) ||
      readying.duration <= 0 ||
      readying.elapsed > readying.duration)
  ) {
    throw new Error('Invalid firearm ready progress');
  }
  const pending = state.pendingCase;
  if (
    pending &&
    (!Number.isSafeInteger(pending.seed) ||
      pending.seed < 0 ||
      pending.seed > 0xff_ff_ff_ff ||
      [pending.origin, pending.direction, pending.feet].some(
        (vector) => vector.length !== 3 || vector.some((value) => !Number.isFinite(value)),
      ) ||
      Math.abs(Math.hypot(...pending.direction) - 1) > 1e-6)
  ) {
    throw new Error('Invalid pending firearm case');
  }
};
