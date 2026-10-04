// Native resumable actions. Scheduler owns time; Inventory owns craft work trees.
import type { CraftPlan } from './crafting.ts';
import type { Simulation } from './sim.ts';
import { freezeSnapshot } from './snapshotData.ts';

export type RestKind = 'rest' | 'sleep';
export const REST_LABEL: Readonly<Record<RestKind, string>> = { rest: 'Resting', sleep: 'Sleeping' };
export interface RestAction {
  kind: RestKind;
  label: string;
  rate: number;
  startFatigue: number;
}
export type LongJob =
  | { jobType: RestKind; stopped: boolean; last: number; elapsed: number; rest: RestAction }
  | { jobType: 'craft'; stopped: boolean; last: number; workUid: number };
export interface LongActionState {
  job: LongJob | null;
}
/** Per-kind effects stay in the native craft owner, never in saved closures. */
export interface CraftRepair {
  targetUid: number;
  amount: number;
}
export interface CraftActionHooks {
  admit: (plan: CraftPlan) => string | undefined;
  begin: (plan: CraftPlan, repair?: CraftRepair) => number | undefined;
  owns: (uid: number) => boolean;
  validate: (uid: number) => string | undefined;
  advance: (uid: number, gameSeconds: number) => boolean;
  finish: (uid: number) => void;
  cancel: (uid: number) => void;
}
export const validateLongJob = (job: LongJob | null, time: number): void => {
  if (job === null) {
    return;
  }
  if (!Number.isFinite(job.last) || job.last < 0 || job.last > time || typeof job.stopped !== 'boolean') {
    throw new Error('Invalid long action cursor');
  }
  if (job.jobType === 'craft') {
    if (!Number.isSafeInteger(job.workUid) || job.workUid < 1 || 'rest' in job || 'elapsed' in job) {
      throw new Error('Invalid craft descriptor');
    }
  } else if (job.jobType === 'rest' || job.jobType === 'sleep') {
    if (
      'workUid' in job ||
      !Number.isFinite(job.elapsed) ||
      job.elapsed < 0 ||
      !job.rest ||
      job.rest.kind !== job.jobType ||
      !Number.isFinite(job.rest.rate) ||
      !Number.isFinite(job.rest.startFatigue) ||
      job.rest.startFatigue < 0 ||
      job.rest.startFatigue > 100 ||
      typeof job.rest.label !== 'string'
    ) {
      throw new Error('Invalid rest descriptor');
    }
  } else {
    throw new Error('Unknown long action kind');
  }
};

export class LongActions {
  private current: LongJob | undefined;
  craft: CraftActionHooks | undefined;
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
    return job && job.jobType !== 'craft' && (!job.stopped || this.sim.compression.interruption !== undefined)
      ? job.rest
      : undefined;
  }
  get restRate(): number | undefined {
    return this.current && !this.current.stopped && this.sim.compression.active ? this.rest?.rate : undefined;
  }
  snapshotState(): Readonly<LongActionState> {
    return freezeSnapshot({ job: this.current ? structuredClone(this.current) : null });
  }
  restoreState(state: LongActionState): void {
    validateLongJob(state.job, this.sim.time);
    if (state.job?.jobType === 'craft' && !this.craft?.owns(state.job.workUid)) {
      throw new Error('Missing craft work item');
    }
    this.current = state.job === null ? undefined : structuredClone(state.job);
  }
  startRest(kind: RestKind, rate: number): string | undefined {
    if (this.sim.needs.fatigue <= 0) {
      return "You're not tired";
    }
    if (this.current?.jobType === 'craft' && !this.current.stopped) {
      return 'Stop crafting first';
    }
    const result = this.sim.compress();
    if (!result.ok) {
      return result.reason;
    }
    this.current = {
      jobType: kind,
      stopped: false,
      last: this.sim.time,
      elapsed: 0,
      rest: { kind, label: REST_LABEL[kind], rate, startFatigue: this.sim.needs.fatigue },
    };
    return undefined;
  }
  /** Admit and secure compression before any structural escrow effect. */
  beginCraft(plan: CraftPlan, repair?: CraftRepair): string | undefined {
    if (!this.craft) {
      return 'Missing craft action owner';
    }
    if (this.current?.jobType === 'craft' && !this.current.stopped) {
      return 'Another craft is active';
    }
    const reason = this.craft.admit(plan);
    if (reason) {
      return reason;
    }
    const result = this.sim.compress();
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
  startCraft(workUid: number): string | undefined {
    const reason = this.craft?.validate(workUid);
    if (!this.craft || reason) {
      return reason ?? 'Missing craft action owner';
    }
    if (this.current && this.current.jobType === 'craft' && !this.current.stopped && this.current.workUid !== workUid) {
      return 'Another craft is active';
    }
    const result = this.sim.compress();
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
    if (this.current.jobType === 'craft') {
      const reason = this.craft?.validate(this.current.workUid);
      if (!this.craft || reason) {
        return reason ?? 'Missing craft action owner';
      }
    }
    const result = this.sim.compress();
    if (!result.ok) {
      return result.reason;
    }
    this.current.stopped = false;
    this.current.last = this.sim.time;
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
    if (this.current && !this.sim.compression.active) {
      this.current.stopped = true;
    }
  }
  private advance(time: number): void {
    const job = this.current;
    if (!job || job.stopped || !this.sim.compression.active) {
      return;
    }
    if (job.jobType === 'craft') {
      const reason = this.craft?.validate(job.workUid);
      if (!this.craft || reason) {
        job.stopped = true;
        this.sim.compression.interrupt(reason ?? 'Missing craft action owner');
        return;
      }
    }
    const seconds = Math.max(0, time - job.last) * this.sim.clock.ratio;
    job.last = time;
    const finished = job.jobType === 'craft' ? this.craft!.advance(job.workUid, seconds) : this.sim.needs.fatigue <= 0;
    if (job.jobType !== 'craft') {
      job.elapsed += seconds;
    }
    if (!finished) {
      return;
    }
    this.current = undefined;
    this.sim.compression.stop();
    if (job.jobType === 'craft') {
      try {
        this.craft!.finish(job.workUid);
      } catch (error) {
        this.failedEffect(job, error);
      }
    } else {
      this.notice('You feel rested');
    }
  }
}
