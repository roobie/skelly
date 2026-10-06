// Native resumable actions. Scheduler owns time; Inventory owns craft work trees.

import type { BodyRegion, BodyTreatment } from './body.ts';
import type { WorkPlan } from './crafting.ts';
import type { Simulation } from './sim.ts';
import { freezeSnapshot } from './snapshotData.ts';

export type RestKind = 'rest' | 'sleep';
const REST_LABEL: Readonly<Record<RestKind, string>> = { rest: 'Resting', sleep: 'Sleeping' };
export interface RestAction {
  kind: RestKind;
  furnitureUid: number;
  label: string;
  rate: number;
  startFatigue: number;
}
export type LongJob =
  | { jobType: RestKind; stopped: boolean; last: number; elapsed: number; rest: RestAction }
  | { jobType: 'craft'; stopped: boolean; last: number; workUid: number }
  | { jobType: 'reading'; stopped: boolean; last: number; bookUid: number; elapsed: number; duration: number }
  | {
      jobType: 'treatment';
      stopped: boolean;
      last: number;
      region: BodyRegion;
      itemUid: number;
      treatment: BodyTreatment;
      elapsed: number;
      duration: number;
    };
export interface ReadingActionHooks {
  owns: (bookUid: number) => boolean;
  validate: (bookUid: number) => string | undefined;
  duration: (bookUid: number) => number | undefined;
  finish: (bookUid: number) => void;
}
export interface TreatmentActionHooks {
  validate: (region: BodyRegion, itemUid: number, treatment: BodyTreatment) => string | undefined;
  finish: (region: BodyRegion, itemUid: number, treatment: BodyTreatment) => string | true;
}
export interface LongActionState {
  job: LongJob | null;
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
    rest.startFatigue > 100 ||
    !Number.isSafeInteger(rest.furnitureUid) ||
    rest.furnitureUid < 1 ||
    typeof rest.label !== 'string'
  ) {
    throw new Error('Invalid rest descriptor');
  }
};

const validateTreatment = (job: Extract<LongJob, { jobType: 'treatment' }>): void => {
  if (
    !(
      ['head', 'torso', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'].includes(job.region) &&
      Number.isSafeInteger(job.itemUid)
    ) ||
    job.itemUid < 1 ||
    !['bandage', 'rag', 'antiseptic', 'antibiotics'].includes(job.treatment) ||
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
  if (!Number.isFinite(job.last) || job.last < 0 || job.last > time || typeof job.stopped !== 'boolean') {
    throw new Error('Invalid long action cursor');
  }
  switch (job.jobType) {
    case 'craft':
      if (!Number.isSafeInteger(job.workUid) || job.workUid < 1 || 'rest' in job || 'elapsed' in job) {
        throw new Error('Invalid craft descriptor');
      }
      return;
    case 'reading':
      validateReading(job);
      return;
    case 'treatment':
      validateTreatment(job);
      return;
    case 'rest':
    case 'sleep':
      validateRest(job);
      return;
    default:
      throw new Error('Unknown long action kind');
  }
};

export class LongActions {
  private current: LongJob | undefined;
  craft: CraftActionHooks | undefined;
  reading: ReadingActionHooks | undefined;
  treatment: TreatmentActionHooks | undefined;
  notice: (text: string) => void = () => undefined;
  private readonly sim: Simulation;
  constructor(sim: Simulation) {
    this.sim = sim;
    sim.scheduler.register({ id: 'long-action', rate: 1, maxStep: 30, tick: (_dt, time) => this.advance(time) });
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
    return this.current && !this.current.stopped && this.sim.compression.active ? this.rest?.rate : undefined;
  }
  snapshotState(): Readonly<LongActionState> {
    const staleStoppedReading =
      this.current?.jobType === 'reading' &&
      this.current.stopped &&
      this.reading !== undefined &&
      !this.reading.owns(this.current.bookUid);
    if (staleStoppedReading) {
      return freezeSnapshot({ job: null });
    }
    return freezeSnapshot({ job: this.current ? structuredClone(this.current) : null });
  }
  restoreState(state: LongActionState): void {
    validateLongJob(state.job, this.sim.time);
    if (state.job?.jobType === 'craft' && !this.craft?.owns(state.job.workUid)) {
      throw new Error('Missing craft work item');
    }
    if (state.job?.jobType === 'reading' && !this.reading?.owns(state.job.bookUid)) {
      throw new Error('Missing reading book');
    }
    if (state.job?.jobType === 'treatment') {
      const reason = this.treatment?.validate(state.job.region, state.job.itemUid, state.job.treatment);
      if (!this.treatment || reason) {
        throw new Error(reason ?? 'Missing treatment owner');
      }
    }
    this.current = state.job === null ? undefined : structuredClone(state.job);
  }
  startRest(kind: RestKind, rate: number, furnitureUid: number): string | undefined {
    if (this.sim.needs.fatigue <= 0) {
      return "You're not tired";
    }
    if (this.current?.jobType === 'craft' && !this.current.stopped) {
      return 'Stop crafting first';
    }
    if (this.current?.jobType === 'reading' && !this.current.stopped) {
      return 'Stop reading first';
    }
    const result = this.sim.compressLongAction();
    if (!result.ok) {
      return result.reason;
    }
    this.current = {
      jobType: kind,
      stopped: false,
      last: this.sim.time,
      elapsed: 0,
      rest: { kind, furnitureUid, label: REST_LABEL[kind], rate, startFatigue: this.sim.needs.fatigue },
    };
    return undefined;
  }
  /** Admit and secure compression before any structural escrow effect. */
  beginCraft(plan: WorkPlan, repair?: CraftRepair): string | undefined {
    if (!this.craft) {
      return 'Missing craft action owner';
    }
    if (this.current?.jobType === 'craft' && !this.current.stopped) {
      return 'Another craft is active';
    }
    if (repair && plan.kind !== 'craft') {
      return 'A disassembly cannot repair an item';
    }
    if (this.current?.jobType === 'reading' && !this.current.stopped) {
      return 'Stop reading first';
    }
    const reason = this.craft.admit(plan);
    if (reason) {
      return reason;
    }
    const result = this.sim.compressLongAction();
    if (!result.ok) {
      return result.reason;
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
      return 'The materials or hands changed';
    }
    this.current = { jobType: 'craft', stopped: false, last: this.sim.time, workUid: uid };
    return undefined;
  }
  /** Release a legal unreferenced/stopped work item through its native effect owner. */
  cancelCraft(workUid: number): string | undefined {
    if (!this.craft?.owns(workUid)) {
      return 'The work item is missing';
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
  beginTreatment(region: BodyRegion, itemUid: number, treatment: BodyTreatment, duration: number): string | undefined {
    if (!this.treatment) {
      return 'Missing treatment owner';
    }
    const reason = this.treatment.validate(region, itemUid, treatment);
    if (reason) {
      return reason;
    }
    if (this.current && !this.current.stopped) {
      return 'Stop the current action first';
    }
    if (!Number.isFinite(duration) || duration <= 0) {
      return 'Invalid treatment time';
    }
    const result = this.sim.compressLongAction();
    if (!result.ok) {
      return result.reason;
    }
    const elapsed =
      this.current?.jobType === 'treatment' &&
      this.current.region === region &&
      this.current.itemUid === itemUid &&
      this.current.treatment === treatment
        ? this.current.elapsed
        : 0;
    this.current = {
      jobType: 'treatment',
      stopped: false,
      last: this.sim.time,
      region,
      itemUid,
      treatment,
      elapsed,
      duration,
    };
    return undefined;
  }
  beginReading(bookUid: number): string | undefined {
    if (!this.reading) {
      return 'Missing reading action owner';
    }
    if (this.current && !this.current.stopped) {
      return 'Stop the current action first';
    }
    const reason = this.reading.validate(bookUid);
    if (reason) {
      return reason;
    }
    const duration = this.reading.duration(bookUid);
    if (duration === undefined || !Number.isFinite(duration) || duration <= 0) {
      return 'Invalid reading time';
    }
    const result = this.sim.compressLongAction();
    if (!result.ok) {
      return result.reason;
    }
    const elapsed = this.current?.jobType === 'reading' && this.current.bookUid === bookUid ? this.current.elapsed : 0;
    this.current = { jobType: 'reading', stopped: false, last: this.sim.time, bookUid, elapsed, duration };
    return undefined;
  }
  startCraft(workUid: number): string | undefined {
    const reason = this.craft?.validate(workUid);
    if (!this.craft || reason) {
      return reason ?? 'Missing craft action owner';
    }
    if (this.current?.jobType === 'reading' && !this.current.stopped) {
      return 'Stop reading first';
    }
    if (this.current?.jobType === 'treatment' && !this.current.stopped) {
      return 'Stop treatment first';
    }
    if (this.current && this.current.jobType === 'craft' && !this.current.stopped && this.current.workUid !== workUid) {
      return 'Another craft is active';
    }
    const result = this.sim.compressLongAction();
    if (!result.ok) {
      return result.reason;
    }
    this.current = { jobType: 'craft', stopped: false, last: this.sim.time, workUid };
    return undefined;
  }
  resume(): string | undefined {
    if (!this.current) {
      return undefined;
    }
    if (this.discardMissingStoppedReading()) {
      return undefined;
    }
    const reason = this.validateCurrent();
    if (reason) {
      return reason;
    }
    const result = this.sim.compressLongAction();
    if (!result.ok) {
      return result.reason;
    }
    this.current.stopped = false;
    this.current.last = this.sim.time;
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
  private validateCurrent(): string | undefined {
    const job = this.current!;
    if (job.jobType === 'craft') {
      return this.craft?.validate(job.workUid) ?? (this.craft ? undefined : 'Missing craft action owner');
    }
    if (job.jobType === 'reading') {
      return this.reading?.validate(job.bookUid) ?? (this.reading ? undefined : 'Missing reading action owner');
    }
    if (job.jobType === 'treatment') {
      return (
        this.treatment?.validate(job.region, job.itemUid, job.treatment) ??
        (this.treatment ? undefined : 'Missing treatment owner')
      );
    }
    return undefined;
  }
  /** No payload is discarded. A second Stop cannot spend more time. */
  stop(): void {
    this.advance(this.sim.time);
    if (this.current) {
      this.current.stopped = true;
    }
    this.sim.compression.stop();
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
  private failedEffect(job: LongJob, error: unknown): void {
    // Native effects preflight before structural transfer; a refusal retains the owned work.
    this.current = job;
    job.stopped = true;
    this.sim.compression.interrupt(error instanceof Error ? error.message : 'Action effect refused');
  }
  syncInterruption(): void {
    const job = this.current;
    if (!job || this.sim.compression.active) {
      return;
    }
    const reason = this.sim.compression.interruption;
    if (job.jobType === 'sleep' && reason !== undefined) {
      this.current = undefined;
      this.sim.compression.stop();
      this.notice(`You wake up: ${reason}`);
      return;
    }
    job.stopped = true;
  }
  private validateOwner(job: LongJob): string | undefined {
    if (job.jobType === 'craft') {
      return this.craft?.validate(job.workUid) ?? (this.craft ? undefined : 'Missing craft action owner');
    }
    if (job.jobType === 'reading') {
      return this.reading?.validate(job.bookUid) ?? (this.reading ? undefined : 'Missing reading action owner');
    }
    if (job.jobType === 'treatment') {
      return (
        this.treatment?.validate(job.region, job.itemUid, job.treatment) ??
        (this.treatment ? undefined : 'Missing treatment action owner')
      );
    }
    return undefined;
  }
  private advanceJob(job: LongJob, seconds: number): boolean {
    if (job.jobType === 'craft') {
      return this.craft!.advance(job.workUid, seconds);
    }
    if (job.jobType === 'reading' || job.jobType === 'treatment') {
      job.elapsed = Math.min(job.duration, job.elapsed + seconds);
      return job.elapsed === job.duration;
    }
    job.elapsed += seconds;
    return this.sim.needs.fatigue <= 0;
  }
  private finishJob(job: LongJob): void {
    try {
      if (job.jobType === 'craft') {
        this.craft!.finish(job.workUid);
      } else if (job.jobType === 'reading') {
        this.reading!.finish(job.bookUid);
      } else if (job.jobType === 'treatment') {
        const reason = this.treatment!.finish(job.region, job.itemUid, job.treatment);
        if (reason !== true) {
          this.failedEffect(job, new Error(reason));
        }
      } else {
        this.notice('You feel rested');
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
    if (job.stopped || !this.sim.compression.active) {
      return;
    }
    const reason = this.validateOwner(job);
    if (reason) {
      job.stopped = true;
      this.sim.compression.interrupt(reason);
      return;
    }
    const seconds = Math.max(0, time - job.last) * this.sim.clock.ratio;
    job.last = time;
    if (!this.advanceJob(job, seconds)) {
      return;
    }
    this.current = undefined;
    this.sim.compression.stop();
    this.finishJob(job);
  }
}
