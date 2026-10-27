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
  forwardSounded?: boolean;
  phase?: 'open' | 'close';
  preserveRound?: boolean;
}

interface FirearmRaiseState {
  elapsed: number;
  /** Duration sampled when this raise began; saved so progression resumes under the same handling. */
  duration: number;
}

interface FirearmLanding {
  at: number;
  position: Vec3;
  type: string;
  seed: number;
}

type CylinderChamber = { state: 'empty' | 'case' } | { state: 'round'; roundType: string };

export interface CylinderState {
  chambers: CylinderChamber[];
  aligned: number;
  open: boolean;
  cocked: boolean;
}

export interface FirearmState {
  chamber?: 'empty' | 'round' | 'case';
  cylinder?: CylinderState;
  /** The chambered cartridge's item type, present exactly when the chamber holds a round. */
  roundType?: string | undefined;
  /** Integral magazine cartridges in feed order; detachable magazines own their own cartridges. */
  tube?: string[];
  /** Top-up must not spend magazine capacity on the chamber's extracted round. */
  retainedRoundType?: string | undefined;
  actionOpen?: boolean;
  /** An empty pull dropped the hammer; it stays silent until the action is worked again. */
  hammerDown?: boolean | undefined;
  /** Ejected items awaiting their simulation-clock landings. */
  landings?: FirearmLanding[] | undefined;
  pendingCase?: PendingCase | undefined;
  cycle?: FirearmCycleState | undefined;
  readying?: FirearmRaiseState | undefined;
  /** Simulation time of the last committed shot or pull; it gates revolver recovery and names a follow-up shot. */
  lastShotAt?: number | undefined;
}

/** No live state is advanced or cancelled by a snapshot. */
export const snapshotFirearm = (state: FirearmState): FirearmState => {
  const {
    chamber,
    cylinder,
    roundType,
    retainedRoundType,
    tube,
    actionOpen,
    hammerDown,
    landings,
    pendingCase,
    cycle,
    readying,
    lastShotAt,
  } = state;
  return {
    ...(chamber === undefined ? {} : { chamber }),
    ...(cylinder === undefined ? {} : { cylinder: structuredClone(cylinder) }),
    ...(roundType === undefined ? {} : { roundType }),
    ...(tube === undefined ? {} : { tube: [...tube] }),
    ...(retainedRoundType === undefined ? {} : { retainedRoundType }),
    ...(actionOpen === undefined ? {} : { actionOpen }),
    ...(hammerDown === undefined ? {} : { hammerDown }),
    ...(landings === undefined ? {} : { landings: structuredClone(landings) }),
    ...(pendingCase === undefined ? {} : { pendingCase: structuredClone(pendingCase) }),
    ...(cycle === undefined || cycle.mode === 'hand' ? {} : { cycle: structuredClone(cycle) }),
    ...(readying === undefined ? {} : { readying: { ...readying } }),
    ...(lastShotAt === undefined ? {} : { lastShotAt }),
  };
};

const assertFirearmExtras = ({ tube, landings }: FirearmState): void => {
  if (tube && (!Array.isArray(tube) || tube.length > 64 || tube.some((type) => typeof type !== 'string'))) {
    throw new Error('Invalid firearm tube');
  }
  if (
    landings &&
    (!Array.isArray(landings) ||
      landings.length > 64 ||
      landings.some(
        (landing) =>
          !Number.isFinite(landing.at) ||
          landing.at < 0 ||
          !Number.isSafeInteger(landing.seed) ||
          landing.seed < 0 ||
          landing.seed > 0xff_ff_ff_ff ||
          !landing.type ||
          landing.position.length !== 3 ||
          landing.position.some((value) => !Number.isFinite(value)),
      ))
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
      (cycle.forwardSounded !== undefined && typeof cycle.forwardSounded !== 'boolean') ||
      (cycle.phase !== undefined && (cycle.mode !== 'hand' || !['open', 'close'].includes(cycle.phase))) ||
      (cycle.preserveRound !== undefined && (typeof cycle.preserveRound !== 'boolean' || cycle.phase !== 'open')))
  ) {
    throw new Error('Invalid firearm cycle');
  }
};

const assertCylinderState = (state: FirearmState): void => {
  const cylinder = state.cylinder!;
  if (
    state.chamber !== undefined ||
    state.roundType !== undefined ||
    state.tube !== undefined ||
    state.retainedRoundType !== undefined ||
    state.pendingCase !== undefined ||
    state.cycle !== undefined
  ) {
    throw new Error('Cylinder has competing ammunition owners');
  }
  if (
    !Array.isArray(cylinder.chambers) ||
    cylinder.chambers.length === 0 ||
    cylinder.chambers.length > 64 ||
    !Number.isInteger(cylinder.aligned) ||
    cylinder.aligned < 0 ||
    cylinder.aligned >= cylinder.chambers.length ||
    typeof cylinder.open !== 'boolean' ||
    typeof cylinder.cocked !== 'boolean' ||
    (cylinder.open && cylinder.cocked)
  ) {
    throw new Error('Invalid firearm cylinder');
  }
  for (const chamber of cylinder.chambers) {
    if (!(chamber && ['empty', 'case', 'round'].includes(chamber.state))) {
      throw new Error('Invalid cylinder chamber');
    }
    if (
      chamber.state === 'round' ? typeof chamber.roundType !== 'string' || !chamber.roundType : 'roundType' in chamber
    ) {
      throw new Error('Invalid cylinder cartridge');
    }
  }
};

const assertOpenActionState = (state: FirearmState): void => {
  if (
    state.retainedRoundType !== undefined &&
    (typeof state.retainedRoundType !== 'string' || !state.retainedRoundType || !state.actionOpen)
  ) {
    throw new Error('A retained round needs an open bolt');
  }
  if (state.actionOpen !== undefined && typeof state.actionOpen !== 'boolean') {
    throw new Error('Invalid firearm action-open state');
  }
  if (state.hammerDown !== undefined && typeof state.hammerDown !== 'boolean') {
    throw new Error('Invalid firearm hammer state');
  }
  if (state.actionOpen && state.chamber !== 'empty') {
    throw new Error('An open action needs an empty chamber');
  }
};

/** Coupled chamber/cycle constraints shared by direct inventory restore and save decoding. */
export const assertFirearmState = (state: FirearmState): void => {
  const { cylinder } = state;
  if (cylinder) {
    assertCylinderState(state);
  } else if (!['empty', 'round', 'case'].includes(state.chamber!)) {
    throw new Error('Invalid firearm chamber');
  }
  if ((state.chamber === 'case') !== (state.pendingCase !== undefined)) {
    throw new Error('Fired chamber needs exactly one pending case');
  }
  if ((state.roundType !== undefined) !== (state.chamber === 'round')) {
    throw new Error('A loaded chamber needs exactly one cartridge type');
  }
  assertOpenActionState(state);
  assertFirearmExtras(state);
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
  if (state.lastShotAt !== undefined && !(Number.isFinite(state.lastShotAt) && state.lastShotAt >= 0)) {
    throw new Error('Invalid firearm last shot time');
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
