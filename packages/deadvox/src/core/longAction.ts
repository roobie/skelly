// Native resumable actions. Scheduler owns time; Inventory owns craft work trees.

import { BODY_REGIONS, type BodyRegion } from './body.ts';
import type { Registry } from './content.ts';
import { coreMessage } from './coreText.ts';
import type { WorkPlan } from './crafting.ts';
import { SCHEDULER_TIME_EPSILON } from './scheduler.ts';
import type { Simulation } from './sim.ts';
import { freezeSnapshot } from './snapshotData.ts';

export type RestKind = 'rest' | 'sleep';
/** Doable jobs run at 1× while bleeding refuses time compression, never while action itself is refused. */
const RUN_AT_1X_WHILE_COMPRESSION_REFUSED: ReadonlySet<string> = new Set(['treatment', 'craft', 'reading']);
export interface RestAction {
  kind: RestKind;
  furnitureUid: number;
  rate: number;
  startFatigue: number;
  /** The Sim time a sleep set with an alarm ends at; without one, sleep ends once rested. */
  wakeAt?: number;
  /** Saved Game-second progress before sleep begins; absent once the player is asleep. */
  sleepOnset?: { durationGameSeconds: number; elapsedGameSeconds: number } | undefined;
}
const WAIT_CANCELLING_MOVEMENTS = new Set([
  'movement.forward',
  'movement.back',
  'movement.left',
  'movement.right',
  'movement.jump',
]);
export type LongJob =
  | { jobType: 'wait'; stopped: boolean; last: number }
  | { jobType: RestKind; stopped: boolean; last: number; elapsed: number; rest: RestAction }
  | { jobType: 'craft'; stopped: boolean; last: number; workUid: number }
  | { jobType: 'reading'; stopped: boolean; last: number; bookUid: number; elapsed: number; duration: number }
  | {
      jobType: 'forceDoor';
      method: string;
      stopped: boolean;
      last: number;
      entityUid: number;
      toolUid: number;
      elapsed: number;
      duration: number;
      strikeInterval: number;
      nextStrike: number;
    }
  | {
      jobType: 'vehicleWork';
      kind: 'install' | 'remove';
      vehicleId: number;
      fittingId: string;
      itemUid: number;
      elapsed: number;
      duration: number;
      stopped: boolean;
      last: number;
    }
  | {
      jobType: 'treatment';
      stopped: boolean;
      last: number;
      region: BodyRegion;
      itemUid: number;
      /** The treatment item's type; its content treatment says what it does. */
      itemType: string;
      elapsed: number;
      duration: number;
    };
export interface RestStartOptions {
  wakeAt?: number;
  sleepOnsetGameSeconds?: number;
}
const restActionRefusal = (registry: Pick<Registry, 'ui'>, job: LongJob | undefined): string | undefined => {
  if (!job || job.stopped) {
    return undefined;
  }
  switch (job.jobType) {
    case 'craft':
      return coreMessage(registry, 'busyCrafting');
    case 'reading':
      return coreMessage(registry, 'busyReading');
    case 'forceDoor':
      return coreMessage(registry, 'busyForcing');
    default:
      return undefined;
  }
};
const restStartTimingRefusal = (
  kind: RestKind,
  simTime: number,
  { wakeAt, sleepOnsetGameSeconds }: RestStartOptions,
): string | undefined => {
  if (wakeAt !== undefined && (kind !== 'sleep' || !(wakeAt > simTime))) {
    return 'Invalid wake time';
  }
  if (
    sleepOnsetGameSeconds !== undefined &&
    (kind !== 'sleep' || !Number.isFinite(sleepOnsetGameSeconds) || sleepOnsetGameSeconds <= 0)
  ) {
    return 'Invalid sleep onset time';
  }
  return undefined;
};
export interface ReadingActionHooks {
  owns: (bookUid: number) => boolean;
  validate: (bookUid: number) => string | undefined;
  duration: (bookUid: number) => number | undefined;
  finish: (bookUid: number) => void;
}
export interface DoorForcingHooks {
  validate: (entityUid: number, toolUid: number, method: string) => string | undefined;
  strike: (entityUid: number, toolUid: number, method: string, time: number) => void;
  finish: (entityUid: number, toolUid: number, method: string) => string | undefined;
}
export interface TreatmentActionHooks {
  validate: (region: BodyRegion, itemUid: number, itemType: string) => string | undefined;
  finish: (region: BodyRegion, itemUid: number, itemType: string) => string | true;
}
/** Vehicle work saves only stable owner references; the effect owner retains destination policy. */
export interface VehicleWorkHooks {
  validate: (kind: 'install' | 'remove', vehicleId: number, fittingId: string, itemUid: number) => string | undefined;
  finish: (kind: 'install' | 'remove', vehicleId: number, fittingId: string, itemUid: number) => string | undefined;
}
export interface LongActionState {
  job: LongJob | null;
  /** The hour of day (0–23) an alarm sleep wakes at; unset sleeps until rested. */
  wakeGameHour?: number;
}
/** Per-kind effects stay in the native craft owner, never in saved closures. */
export interface CraftRepair {
  targetUid: number;
  amount: number;
}
export interface CraftActionHooks {
  admit: (plan: WorkPlan) => string | undefined;
  begin: (plan: WorkPlan, repair?: CraftRepair) => number | undefined;
  owns: (uid: number) => boolean;
  validate: (uid: number) => string | undefined;
  advance: (uid: number, gameSeconds: number) => boolean;
  finish: (uid: number) => void;
  cancel: (uid: number) => void;
}
const validateRest = (job: Extract<LongJob, { jobType: RestKind }>): void => {
  const { rest, elapsed } = job;
  if (
    'workUid' in job ||
    !Number.isFinite(elapsed) ||
    elapsed < 0 ||
    !rest ||
    rest.kind !== job.jobType ||
    !Number.isFinite(rest.rate) ||
    !Number.isFinite(rest.startFatigue) ||
    rest.startFatigue < 0 ||
    (rest.wakeAt !== undefined && (rest.kind !== 'sleep' || !Number.isFinite(rest.wakeAt))) ||
    (rest.sleepOnset !== undefined &&
      (rest.kind !== 'sleep' ||
        !Number.isFinite(rest.sleepOnset.durationGameSeconds) ||
        rest.sleepOnset.durationGameSeconds <= 0 ||
        !Number.isFinite(rest.sleepOnset.elapsedGameSeconds) ||
        rest.sleepOnset.elapsedGameSeconds < 0 ||
        rest.sleepOnset.elapsedGameSeconds > rest.sleepOnset.durationGameSeconds)) ||
    !Number.isSafeInteger(rest.furnitureUid) ||
    rest.furnitureUid < 1
  ) {
    throw new Error('Invalid rest descriptor');
  }
};

const validateForcing = (job: Extract<LongJob, { jobType: 'forceDoor' }>): void => {
  if (
    typeof job.method !== 'string' ||
    job.method.length === 0 ||
    !Number.isSafeInteger(job.entityUid) ||
    job.entityUid < 1 ||
    !Number.isSafeInteger(job.toolUid) ||
    job.toolUid < 1 ||
    !Number.isFinite(job.elapsed) ||
    job.elapsed < 0 ||
    !Number.isFinite(job.duration) ||
    job.duration <= 0 ||
    job.elapsed > job.duration ||
    !Number.isFinite(job.strikeInterval) ||
    job.strikeInterval <= 0 ||
    !Number.isFinite(job.nextStrike) ||
    job.nextStrike <= job.elapsed ||
    job.nextStrike > job.elapsed + job.strikeInterval
  ) {
    throw new Error('Invalid forcing descriptor');
  }
};

const validateVehicleWork = (job: Extract<LongJob, { jobType: 'vehicleWork' }>): void => {
  if (
    (job.kind !== 'install' && job.kind !== 'remove') ||
    !Number.isSafeInteger(job.vehicleId) ||
    job.vehicleId < 1 ||
    !job.fittingId ||
    !Number.isSafeInteger(job.itemUid) ||
    job.itemUid < 1 ||
    !Number.isFinite(job.elapsed) ||
    job.elapsed < 0 ||
    !Number.isFinite(job.duration) ||
    job.duration <= 0 ||
    job.elapsed > job.duration
  ) {
    throw new Error('Invalid vehicle work descriptor');
  }
};

const validateTreatment = (job: Extract<LongJob, { jobType: 'treatment' }>): void => {
  if (
    !(BODY_REGIONS.includes(job.region) && Number.isSafeInteger(job.itemUid)) ||
    job.itemUid < 1 ||
    typeof job.itemType !== 'string' ||
    job.itemType.length === 0 ||
    !Number.isFinite(job.elapsed) ||
    job.elapsed < 0 ||
    !Number.isFinite(job.duration) ||
    job.duration <= 0 ||
    job.elapsed > job.duration
  ) {
    throw new Error('Invalid treatment descriptor');
  }
};

const validateReading = (job: Extract<LongJob, { jobType: 'reading' }>): void => {
  if (
    !Number.isSafeInteger(job.bookUid) ||
    job.bookUid < 1 ||
    !Number.isFinite(job.elapsed) ||
    job.elapsed < 0 ||
    !Number.isFinite(job.duration) ||
    job.duration <= 0 ||
    job.elapsed > job.duration ||
    'rest' in job
  ) {
    throw new Error('Invalid reading descriptor');
  }
};

export const validateLongJob = (job: LongJob | null, time: number): void => {
  if (job === null) {
    return;
  }
  // A due scheduler tick may run within its float slack just beyond the frame target.
  if (
    !Number.isFinite(job.last) ||
    job.last < 0 ||
    job.last > time + SCHEDULER_TIME_EPSILON ||
    typeof job.stopped !== 'boolean'
  ) {
    throw new Error('Invalid long action cursor');
  }
  switch (job.jobType) {
    case 'craft':
      if (!Number.isSafeInteger(job.workUid) || job.workUid < 1 || 'rest' in job || 'elapsed' in job) {
        throw new Error('Invalid craft descriptor');
      }
      return;
    case 'wait':
      if ('rest' in job || 'elapsed' in job) {
        throw new Error('Invalid wait descriptor');
      }
      return;
    case 'reading':
      validateReading(job);
      return;
    case 'forceDoor':
      validateForcing(job);
      return;
    case 'treatment':
      validateTreatment(job);
      return;
    case 'vehicleWork':
      validateVehicleWork(job);
      return;
    case 'rest':
    case 'sleep':
      validateRest(job);
      return;
    default:
      throw new Error('Unknown long action kind');
  }
};

const validateWakeGameHour = (wakeGameHour: number | undefined): void => {
  if (wakeGameHour !== undefined && !(Number.isSafeInteger(wakeGameHour) && wakeGameHour >= 0 && wakeGameHour < 24)) {
    throw new Error('Invalid wake hour');
  }
};

export class LongActions {
  private current: LongJob | undefined;
  craft: CraftActionHooks | undefined;
  reading: ReadingActionHooks | undefined;
  forcing: DoorForcingHooks | undefined;
  treatment: TreatmentActionHooks | undefined;
  vehicleWork: VehicleWorkHooks | undefined;
  notice: (text: string) => void = () => undefined;
  /**
   * The hour of day (0–23) the player set to wake at, or undefined to sleep until rested. It is
   * saved, so Continue and a replay starting after it was set keep it.
   */
  wakeGameHour: number | undefined;
  private readonly sim: Simulation;
  constructor(sim: Simulation) {
    this.sim = sim;
    sim.scheduler.register({ id: 'long-action', rate: 1, maxStep: 30, tick: (_dt, time) => this.advance(time) });
  }
  private bodyActionRefusal(): string | undefined {
    return this.sim.actionRefusal;
  }
  /**
   * Prying runs at 1×, and so do treatment, crafting and reading while the body refuses compression: a
   * bleeding player must still be able to treat the wound or make something to treat it (`DESIGN.md`, "Bleeding").
   */
  runsUncompressed(jobType: LongJob['jobType']): boolean {
    return (
      jobType === 'forceDoor' ||
      (RUN_AT_1X_WHILE_COMPRESSION_REFUSED.has(jobType) && this.sim.body.compressionRefusal !== undefined)
    );
  }
  /** Drops to 1× for an uncompressed job, or asks for compression; returns why compression was refused. */
  private startTiming(jobType: LongJob['jobType']): string | undefined {
    if (jobType === 'forceDoor' || this.runsUncompressed(jobType)) {
      this.sim.compression.stop();
      this.sim.compression.snap();
      return undefined;
    }
    const result = this.sim.compressLongAction(jobType === 'vehicleWork' ? 'craft' : jobType);
    return result.ok ? undefined : result.reason;
  }
  get job(): Readonly<LongJob> | undefined {
    return this.current;
  }
  get rest(): RestAction | undefined {
    const job = this.current;
    return job &&
      (job.jobType === 'rest' || job.jobType === 'sleep') &&
      (!job.stopped || this.sim.compression.interruption !== undefined)
      ? job.rest
      : undefined;
  }
  get restRate(): number | undefined {
    const { rest } = this;
    return this.current && !this.current.stopped && this.sim.compression.active && !rest?.sleepOnset
      ? rest?.rate
      : undefined;
  }
  /** Asleep: sleep onset has finished and recovery runs at the body's sleep factor. */
  get asleep(): boolean {
    return this.restRate !== undefined && this.rest?.kind === 'sleep';
  }
  snapshotState(): Readonly<LongActionState> {
    const staleStoppedReading =
      this.current?.jobType === 'reading' &&
      this.current.stopped &&
      this.reading !== undefined &&
      !this.reading.owns(this.current.bookUid);
    const job = this.current && !staleStoppedReading ? structuredClone(this.current) : null;
    const { wakeGameHour } = this;
    return freezeSnapshot({ job, ...(wakeGameHour === undefined ? {} : { wakeGameHour }) });
  }
  restoreState(state: LongActionState): void {
    validateLongJob(state.job, this.sim.time);
    const { wakeGameHour } = state;
    validateWakeGameHour(wakeGameHour);
    if (state.job?.jobType === 'craft' && !this.craft?.owns(state.job.workUid)) {
      throw new Error('Missing craft work item');
    }
    if (state.job?.jobType === 'reading' && !this.reading?.owns(state.job.bookUid)) {
      throw new Error('Missing reading book');
    }
    if (state.job?.jobType === 'forceDoor') {
      const reason = this.forcing?.validate(state.job.entityUid, state.job.toolUid, state.job.method);
      if (!this.forcing || reason) {
        throw new Error(reason ?? 'Missing forcing action owner');
      }
    }
    if (state.job?.jobType === 'vehicleWork') {
      const reason = this.vehicleWork?.validate(
        state.job.kind,
        state.job.vehicleId,
        state.job.fittingId,
        state.job.itemUid,
      );
      if (!this.vehicleWork || reason) {
        throw new Error(reason ?? 'Missing vehicle work owner');
      }
    }
    if (state.job?.jobType === 'treatment') {
      const reason = this.treatment?.validate(state.job.region, state.job.itemUid, state.job.itemType);
      if (!this.treatment || reason) {
        throw new Error(reason ?? 'Missing treatment owner');
      }
    }
    this.current = state.job === null ? undefined : structuredClone(state.job);
    this.wakeGameHour = wakeGameHour;
    this.restoreCompressionCap();
  }
  /** A restored running action compresses up to its own cap, not the default. */
  private restoreCompressionCap(): void {
    const job = this.current;
    if (job && !job.stopped && job.jobType !== 'forceDoor' && this.sim.compression.active) {
      this.sim.compressLongAction(job.jobType === 'vehicleWork' ? 'craft' : job.jobType);
    }
  }
  startWait(): string | undefined {
    const actionRefusal = this.bodyActionRefusal();
    if (actionRefusal) {
      return actionRefusal;
    }
    if (this.current && !this.current.stopped) {
      return coreMessage(this.sim.registry, 'busy');
    }
    const result = this.sim.compressLongAction('wait');
    if (!result.ok) {
      return result.reason;
    }
    this.current = { jobType: 'wait', stopped: false, last: this.sim.time };
    return undefined;
  }
  /** `wakeAt` is Sim time; `sleepOnsetGameSeconds` is a saved Game-time delay before sleep. */
  startRest(kind: RestKind, rate: number, furnitureUid: number, options: RestStartOptions = {}): string | undefined {
    const { wakeAt, sleepOnsetGameSeconds } = options;
    const actionRefusal = this.bodyActionRefusal() ?? restStartTimingRefusal(kind, this.sim.time, options);
    if (actionRefusal) {
      return actionRefusal;
    }
    if (wakeAt === undefined && this.sim.needs.fatigue <= 0) {
      return coreMessage(this.sim.registry, 'notTired');
    }
    const currentActionRefusal = restActionRefusal(this.sim.registry, this.current);
    if (currentActionRefusal) {
      return currentActionRefusal;
    }
    const result = this.sim.compressLongAction(kind);
    if (!result.ok) {
      return result.reason;
    }
    this.current = {
      jobType: kind,
      stopped: false,
      last: this.sim.time,
      elapsed: 0,
      rest: {
        kind,
        furnitureUid,
        rate,
        startFatigue: this.sim.needs.fatigue,
        ...(wakeAt === undefined ? {} : { wakeAt }),
        ...(sleepOnsetGameSeconds === undefined
          ? {}
          : {
              sleepOnset: { durationGameSeconds: sleepOnsetGameSeconds, elapsedGameSeconds: 0 },
            }),
      },
    };
    return undefined;
  }
  /** Admit and secure compression before any structural escrow effect. */
  beginCraft(plan: WorkPlan, repair?: CraftRepair): string | undefined {
    const actionRefusal = this.bodyActionRefusal();
    if (actionRefusal) {
      return actionRefusal;
    }
    if (!this.craft) {
      return 'Missing craft action owner';
    }
    if (this.current?.jobType === 'craft' && !this.current.stopped) {
      return coreMessage(this.sim.registry, 'otherCraft');
    }
    if (repair && plan.kind !== 'craft') {
      return 'A disassembly cannot repair an item';
    }
    if (this.current?.jobType === 'reading' && !this.current.stopped) {
      return coreMessage(this.sim.registry, 'busyReading');
    }
    if (this.current?.jobType === 'forceDoor' && !this.current.stopped) {
      return coreMessage(this.sim.registry, 'busyForcing');
    }
    const reason = this.craft.admit(plan);
    if (reason) {
      return reason;
    }
    const refusal = this.startTiming('craft');
    if (refusal) {
      return refusal;
    }
    let uid: number | undefined;
    try {
      uid = this.craft.begin(plan, repair);
    } catch (error) {
      this.stop();
      throw error;
    }
    if (uid === undefined) {
      this.stop();
      return coreMessage(this.sim.registry, 'materialsChanged');
    }
    this.current = { jobType: 'craft', stopped: false, last: this.sim.time, workUid: uid };
    return undefined;
  }
  /** Release a legal unreferenced/stopped work item through its native effect owner. */
  cancelCraft(workUid: number): string | undefined {
    if (!this.craft?.owns(workUid)) {
      return coreMessage(this.sim.registry, 'gone');
    }
    if (this.current?.jobType === 'craft' && this.current.workUid === workUid) {
      this.cancel();
      return this.craft.owns(workUid) ? this.sim.compression.interruption : undefined;
    }
    try {
      this.craft.cancel(workUid);
    } catch (error) {
      return error instanceof Error ? error.message : 'Cannot return the inputs';
    }
    return undefined;
  }
  beginForcing(
    entityUid: number,
    toolUid: number,
    {
      method,
      durationSimSeconds: duration,
      strikeIntervalSimSeconds: strikeInterval,
    }: { method: string; durationSimSeconds: number; strikeIntervalSimSeconds: number },
  ): string | undefined {
    const actionRefusal = this.bodyActionRefusal();
    if (actionRefusal) {
      return actionRefusal;
    }
    if (!this.forcing) {
      return 'Missing forcing action owner';
    }
    if (this.current && !this.current.stopped) {
      return coreMessage(this.sim.registry, 'busy');
    }
    const reason = this.forcing.validate(entityUid, toolUid, method);
    if (reason) {
      return reason;
    }
    if (
      !(method && Number.isFinite(duration)) ||
      duration <= 0 ||
      !Number.isFinite(strikeInterval) ||
      strikeInterval <= 0
    ) {
      return 'Invalid forcing time';
    }
    const previous =
      this.current?.jobType === 'forceDoor' &&
      this.current.entityUid === entityUid &&
      this.current.toolUid === toolUid &&
      this.current.method === method
        ? this.current
        : undefined;
    this.sim.compression.stop();
    this.sim.compression.snap();
    this.current = {
      jobType: 'forceDoor',
      method,
      stopped: false,
      last: this.sim.time,
      entityUid,
      toolUid,
      elapsed: previous?.elapsed ?? 0,
      duration,
      strikeInterval,
      nextStrike: previous?.nextStrike ?? strikeInterval,
    };
    return undefined;
  }
  beginVehicleWork(
    kind: 'install' | 'remove',
    vehicleId: number,
    fittingId: string,
    itemUid: number,
    duration: number,
  ): string | undefined {
    const actionRefusal = this.bodyActionRefusal();
    if (actionRefusal) return actionRefusal;
    if (!this.vehicleWork) return 'Missing vehicle work owner';
    if (this.current && !this.current.stopped) return coreMessage(this.sim.registry, 'busy');
    const reason = this.vehicleWork.validate(kind, vehicleId, fittingId, itemUid);
    if (reason) return reason;
    if (!Number.isFinite(duration) || duration <= 0) return 'Invalid vehicle work time';
    const refusal = this.startTiming('vehicleWork');
    if (refusal) return refusal;
    const elapsed =
      this.current?.jobType === 'vehicleWork' &&
      this.current.kind === kind &&
      this.current.vehicleId === vehicleId &&
      this.current.fittingId === fittingId &&
      this.current.itemUid === itemUid
        ? this.current.elapsed
        : 0;
    this.current = {
      jobType: 'vehicleWork',
      kind,
      vehicleId,
      fittingId,
      itemUid,
      elapsed,
      duration,
      stopped: false,
      last: this.sim.time,
    };
    return undefined;
  }
  beginTreatment(region: BodyRegion, itemUid: number, itemType: string, duration: number): string | undefined {
    const actionRefusal = this.bodyActionRefusal();
    if (actionRefusal) {
      return actionRefusal;
    }
    if (!this.treatment) {
      return 'Missing treatment owner';
    }
    const reason = this.treatment.validate(region, itemUid, itemType);
    if (reason) {
      return reason;
    }
    if (this.current && !this.current.stopped) {
      return coreMessage(this.sim.registry, 'busy');
    }
    if (!Number.isFinite(duration) || duration <= 0) {
      return 'Invalid treatment time';
    }
    const refusal = this.startTiming('treatment');
    if (refusal) {
      return refusal;
    }
    const elapsed =
      this.current?.jobType === 'treatment' &&
      this.current.region === region &&
      this.current.itemUid === itemUid &&
      this.current.itemType === itemType
        ? this.current.elapsed
        : 0;
    this.current = {
      jobType: 'treatment',
      stopped: false,
      last: this.sim.time,
      region,
      itemUid,
      itemType,
      elapsed,
      duration,
    };
    return undefined;
  }
  beginReading(bookUid: number): string | undefined {
    const actionRefusal = this.bodyActionRefusal();
    if (actionRefusal) {
      return actionRefusal;
    }
    if (!this.reading) {
      return 'Missing reading action owner';
    }
    if (this.current && !this.current.stopped) {
      return coreMessage(this.sim.registry, 'busy');
    }
    const reason = this.reading.validate(bookUid);
    if (reason) {
      return reason;
    }
    const duration = this.reading.duration(bookUid);
    if (duration === undefined || !Number.isFinite(duration) || duration <= 0) {
      return 'Invalid reading time';
    }
    const refusal = this.startTiming('reading');
    if (refusal) {
      return refusal;
    }
    const elapsed = this.current?.jobType === 'reading' && this.current.bookUid === bookUid ? this.current.elapsed : 0;
    this.current = { jobType: 'reading', stopped: false, last: this.sim.time, bookUid, elapsed, duration };
    return undefined;
  }
  startCraft(workUid: number): string | undefined {
    const actionRefusal = this.bodyActionRefusal();
    if (actionRefusal) {
      return actionRefusal;
    }
    const reason = this.craft?.validate(workUid);
    if (!this.craft || reason) {
      return reason ?? 'Missing craft action owner';
    }
    if (this.current?.jobType === 'reading' && !this.current.stopped) {
      return coreMessage(this.sim.registry, 'busyReading');
    }
    if (this.current?.jobType === 'treatment' && !this.current.stopped) {
      return coreMessage(this.sim.registry, 'busyTreating');
    }
    if (this.current?.jobType === 'forceDoor' && !this.current.stopped) {
      return coreMessage(this.sim.registry, 'busyForcing');
    }
    if (this.current && this.current.jobType === 'craft' && !this.current.stopped && this.current.workUid !== workUid) {
      return coreMessage(this.sim.registry, 'otherCraft');
    }
    const refusal = this.startTiming('craft');
    if (refusal) {
      return refusal;
    }
    this.current = { jobType: 'craft', stopped: false, last: this.sim.time, workUid };
    return undefined;
  }
  resume(): string | undefined {
    const job = this.current;
    if (!job) {
      return undefined;
    }
    const actionRefusal = this.bodyActionRefusal();
    if (actionRefusal) {
      return actionRefusal;
    }
    if (this.discardMissingStoppedReading()) {
      return undefined;
    }
    const reason = this.validateOwner(job);
    if (reason) {
      return reason;
    }
    const refusal = this.startTiming(job.jobType);
    if (refusal) {
      return refusal;
    }
    job.stopped = false;
    job.last = this.sim.time;
    return undefined;
  }
  private discardMissingStoppedReading(): boolean {
    const job = this.current;
    if (job?.jobType !== 'reading' || !job.stopped || !this.reading || this.reading.owns(job.bookUid)) {
      return false;
    }
    this.current = undefined;
    this.sim.compression.stop();
    return true;
  }
  cancelWaitForMovement(action: string): boolean {
    if (this.current?.jobType !== 'wait' || !WAIT_CANCELLING_MOVEMENTS.has(action)) {
      return false;
    }
    this.stop();
    return true;
  }
  /** No payload is discarded. A second Stop cannot spend more time. */
  stop(): void {
    this.advance(this.sim.time);
    if (this.current?.jobType === 'wait') {
      this.current = undefined;
    } else if (this.current) {
      this.current.stopped = true;
    }
    this.sim.compression.stop();
  }
  interruptExposure(reason: string): void {
    const job = this.current;
    if (job && !job.stopped) {
      this.stopOrInterrupt(job, reason);
    }
  }
  interruptUncompressed(reason: string): void {
    const job = this.current;
    if (!job || job.stopped || !this.runsUncompressed(job.jobType)) {
      return;
    }
    this.advance(this.sim.time);
    if (this.current === job && !job.stopped) {
      this.stopUncompressed(job, reason);
    }
  }
  cancel(): void {
    const job = this.current;
    this.current = undefined; // Clear before the effect: reentry cannot return inputs twice.
    this.sim.compression.stop();
    if (job?.jobType === 'craft') {
      try {
        this.craft?.cancel(job.workUid);
      } catch (error) {
        this.failedEffect(job, error);
      }
    }
  }
  /** Cancels the job that names a piece of furniture: a door it forces, or what it rests on. */
  cancelNaming(entityUid: number): void {
    const job = this.current;
    const names =
      job?.jobType === 'forceDoor'
        ? job.entityUid === entityUid
        : (job?.jobType === 'rest' || job?.jobType === 'sleep') && job.rest.furnitureUid === entityUid;
    if (names) {
      this.cancel();
    }
  }
  private failedEffect(job: LongJob, error: unknown): void {
    // Native effects preflight before structural transfer; a refusal retains the owned work.
    this.current = job;
    const reason = error instanceof Error ? error.message : 'Action effect refused';
    this.stopOrInterrupt(job, reason);
  }
  /** An uncompressed job has no prompt to wait on, so its stop reason is a notice. */
  private stopUncompressed(job: LongJob, reason: string): void {
    job.stopped = true;
    this.sim.compression.stop();
    this.sim.compression.snap();
    this.notice(reason);
  }
  private stopOrInterrupt(job: LongJob, reason: string): void {
    if (this.runsUncompressed(job.jobType)) {
      this.stopUncompressed(job, reason);
    } else {
      job.stopped = true;
      this.sim.compression.interrupt(reason);
    }
  }
  syncInterruption(): void {
    const job = this.current;
    if (!job || this.sim.compression.active) {
      return;
    }
    const reason = this.sim.compression.interruption;
    if (job.jobType === 'forceDoor' || this.runsUncompressed(job.jobType)) {
      if (reason !== undefined) {
        this.stopUncompressed(job, reason);
      }
      return;
    }
    if (job.jobType === 'sleep' && reason !== undefined) {
      const wasFallingAsleep = job.rest.sleepOnset !== undefined;
      this.current = undefined;
      this.sim.compression.stop();
      this.notice(coreMessage(this.sim.registry, wasFallingAsleep ? 'cantFallAsleep' : 'wokenBy', { reason }));
      return;
    }
    // A job bleeding held at 1× compresses again once the body allows it, rather than stopping.
    if (
      reason === undefined &&
      !job.stopped &&
      RUN_AT_1X_WHILE_COMPRESSION_REFUSED.has(job.jobType) &&
      this.sim.compressLongAction(job.jobType === 'vehicleWork' ? 'craft' : job.jobType).ok
    ) {
      return;
    }
    job.stopped = true;
  }
  private validateOwner(job: LongJob): string | undefined {
    switch (job.jobType) {
      case 'craft':
        return this.craft ? this.craft.validate(job.workUid) : 'Missing craft action owner';
      case 'reading':
        return this.reading ? this.reading.validate(job.bookUid) : 'Missing reading action owner';
      case 'forceDoor':
        return this.forcing
          ? this.forcing.validate(job.entityUid, job.toolUid, job.method)
          : 'Missing forcing action owner';
      case 'treatment':
        return this.treatment
          ? this.treatment.validate(job.region, job.itemUid, job.itemType)
          : 'Missing treatment action owner';
      case 'vehicleWork':
        return this.vehicleWork
          ? this.vehicleWork.validate(job.kind, job.vehicleId, job.fittingId, job.itemUid)
          : 'Missing vehicle work owner';
      default:
        return undefined;
    }
  }
  private advanceJob(job: LongJob, seconds: number, fromTime: number): boolean {
    if (job.jobType === 'forceDoor') {
      const previous = job.elapsed;
      job.elapsed = Math.min(job.duration, previous + seconds);
      while (job.nextStrike <= job.elapsed) {
        const time = fromTime + (job.nextStrike - previous);
        this.forcing!.strike(job.entityUid, job.toolUid, job.method, time);
        job.nextStrike += job.strikeInterval;
      }
      return job.elapsed === job.duration;
    }
    if (job.jobType === 'craft') {
      return this.craft!.advance(job.workUid, seconds);
    }
    if (job.jobType === 'reading' || job.jobType === 'treatment' || job.jobType === 'vehicleWork') {
      job.elapsed = Math.min(job.duration, job.elapsed + seconds);
      return job.elapsed === job.duration;
    }
    if (job.jobType === 'wait') {
      return false;
    }
    if (job.jobType === 'sleep' && job.rest.wakeAt !== undefined && job.last >= job.rest.wakeAt) {
      return true;
    }
    if (job.rest.sleepOnset !== undefined) {
      job.rest.sleepOnset.elapsedGameSeconds = Math.min(
        job.rest.sleepOnset.durationGameSeconds,
        job.rest.sleepOnset.elapsedGameSeconds + seconds,
      );
      if (job.rest.sleepOnset.elapsedGameSeconds >= job.rest.sleepOnset.durationGameSeconds) {
        const { sleepOnset: _sleepOnset, ...rest } = job.rest;
        job.rest = rest;
      }
      return false;
    }
    job.elapsed += seconds;
    // An alarm wakes you at its time, with fatigue held at its floor of 0 once rested.
    return job.rest.wakeAt === undefined ? this.sim.needs.fatigue <= 0 : job.last >= job.rest.wakeAt;
  }
  private finishJob(job: LongJob): void {
    try {
      if (job.jobType === 'craft') {
        this.craft!.finish(job.workUid);
      } else if (job.jobType === 'reading') {
        this.reading!.finish(job.bookUid);
      } else if (job.jobType === 'forceDoor') {
        const reason = this.forcing!.finish(job.entityUid, job.toolUid, job.method);
        if (reason) {
          throw new Error(reason);
        }
      } else if (job.jobType === 'vehicleWork') {
        const reason = this.vehicleWork!.finish(job.kind, job.vehicleId, job.fittingId, job.itemUid);
        if (reason) {
          throw new Error(reason);
        }
      } else if (job.jobType === 'treatment') {
        const reason = this.treatment!.finish(job.region, job.itemUid, job.itemType);
        if (reason !== true) {
          this.failedEffect(job, new Error(reason));
        }
      } else if (job.jobType !== 'wait') {
        this.notice(coreMessage(this.sim.registry, 'rested'));
      }
    } catch (error) {
      this.failedEffect(job, error);
    }
  }
  private advance(time: number): void {
    const job = this.current;
    if (!job) {
      return;
    }
    if (job.jobType === 'reading' && job.stopped && this.reading && !this.reading.owns(job.bookUid)) {
      this.current = undefined;
      this.sim.compression.stop();
      return;
    }
    const uncompressed = this.runsUncompressed(job.jobType);
    if (uncompressed && this.sim.compression.active) {
      this.sim.compression.stop();
      this.sim.compression.snap();
    }
    if (job.stopped || !(uncompressed || this.sim.compression.active)) {
      return;
    }
    const { actionRefusal } = this.sim.body;
    if (actionRefusal) {
      this.stopOrInterrupt(job, actionRefusal);
      return;
    }
    const reason = this.validateOwner(job);
    if (reason) {
      this.stopOrInterrupt(job, reason);
      return;
    }
    const fromTime = job.last;
    const simSecondsElapsed = Math.max(0, time - fromTime);
    const elapsed =
      job.jobType === 'forceDoor' || job.jobType === 'treatment' || job.jobType === 'vehicleWork'
        ? simSecondsElapsed
        : simSecondsElapsed * this.sim.clock.ratio;
    job.last = time;
    if (!this.advanceJob(job, elapsed, fromTime)) {
      return;
    }
    this.current = undefined;
    this.sim.compression.stop();
    this.finishJob(job);
  }
}
