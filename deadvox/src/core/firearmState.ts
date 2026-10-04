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
  ejected: boolean;
  /** Debug AR/AKs feed a virtual round at the end; real ammunition is not invented. */
  readonly feedRound: boolean;
}

export interface FirearmState {
  chamber: 'empty' | 'round' | 'case';
  /** A real loaded cartridge's item type, when present (debug rifles use virtual rounds). */
  roundType?: string;
  pendingCase?: PendingCase | undefined;
  cycle?: FirearmCycleState | undefined;
}

/** No live state is advanced or cancelled by a snapshot. */
export const snapshotFirearm = (state: FirearmState): FirearmState => {
  const { chamber, roundType, pendingCase, cycle } = state;
  return {
    chamber,
    ...(roundType === undefined ? {} : { roundType }),
    ...(pendingCase === undefined ? {} : { pendingCase: structuredClone(pendingCase) }),
    ...(cycle === undefined || cycle.mode === 'hand' ? {} : { cycle: structuredClone(cycle) }),
  };
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
  const { cycle } = state;
  if (
    cycle &&
    (!((cycle.mode === 'fire' || cycle.mode === 'hand') && Number.isFinite(cycle.startedAt)) ||
      cycle.startedAt < 0 ||
      !Number.isFinite(cycle.elapsed) ||
      cycle.elapsed < 0 ||
      typeof cycle.ejected !== 'boolean' ||
      typeof cycle.feedRound !== 'boolean')
  ) {
    throw new Error('Invalid firearm cycle');
  }
  if (cycle?.ejected && state.chamber === 'case') {
    throw new Error('Ejected case remains in the chamber');
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
