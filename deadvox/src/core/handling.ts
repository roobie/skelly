// Handling jobs are tagged data, not callbacks or object references. Their handlers
// live in the freshly-created runtime; a 1.9 snapshot omits pending jobs without
// mutating the running queue.

import { canonicalJson } from './canonicalJson.ts';
import { describeTarget, type Inventory, type Location, type Target, type TargetState } from './inventory.ts';
import { defOf, type Item } from './items.ts';

export type JobValue = null | boolean | number | string | JobValue[] | { [key: string]: JobValue };
export interface JobParams {
  [key: string]: JobValue;
}

const isJobValue = (value: unknown, seen = new Set<object>()): value is JobValue => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return true;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (typeof value !== 'object') {
    return false;
  }
  if (seen.has(value)) {
    return false;
  }
  seen.add(value);
  const valid = Array.isArray(value)
    ? value.every((item) => isJobValue(item, seen))
    : Object.getPrototypeOf(value) === Object.prototype && Object.values(value).every((item) => isJobValue(item, seen));
  seen.delete(value);
  return valid;
};

interface JobBase {
  readonly label: string;
  /** Seconds. */
  duration: number;
  elapsed: number;
}

export interface MoveJob extends JobBase {
  readonly kind: 'move';
  readonly itemUid: number;
  readonly target: TargetState;
  readonly count: number;
}

export interface ActionJob extends JobBase {
  readonly kind: 'action';
  readonly jobType: string;
  readonly params: JobParams;
}

export type Job = MoveJob | ActionJob;

/** A snapshot intentionally cancels all pending jobs in its copy only. */
export interface HandlingQueueState {
  jobs: [];
}

export interface CompletedMove {
  readonly job: MoveJob;
  readonly source?: ReturnType<Inventory['locate']>;
  readonly sourceCount?: number;
}

export interface TickResult {
  done: Job[];
  failed: { job: Job; reason: string }[];
  completedMoves: CompletedMove[];
}

export interface MoveStart {
  readonly item: Item;
  readonly from: Location;
  readonly target: Target;
}

export class HandlingQueue {
  readonly jobs: Job[] = [];
  private readonly inventory: Inventory;
  private readonly onMoveStart: ((move: MoveStart) => void) | undefined;
  private readonly onMoveComplete: ((move: MoveStart) => void) | undefined;
  private readonly handlers = new Map<string, (params: JobParams) => string | undefined>();
  private announced: MoveJob | undefined;

  constructor(
    inventory: Inventory,
    onMoveStart?: (move: MoveStart) => void,
    onMoveComplete?: (move: MoveStart) => void,
  ) {
    this.inventory = inventory;
    this.onMoveStart = onMoveStart;
    this.onMoveComplete = onMoveComplete;
  }

  /** Something is being handled: the player can't sprint and moves at half pace. */
  get busy(): boolean {
    return this.jobs.length > 0;
  }

  /** Seconds until the queue is empty. */
  get remaining(): number {
    return this.jobs.reduce((sum, job) => sum + job.duration - job.elapsed, 0);
  }

  /** Save-copy projection: no live jobs are advanced, canceled, or mutated. */
  snapshotCancelled(): Readonly<HandlingQueueState> {
    return Object.freeze({ jobs: Object.freeze([]) as [] });
  }

  registerAction(jobType: string, handler: (params: JobParams) => string | undefined): void {
    if (!jobType || this.handlers.has(jobType)) {
      throw new Error(`Action ${jobType} is already registered`);
    }
    this.handlers.set(jobType, handler);
  }

  /**
   * Queues a move if it could happen now. With `later`, a move that depends on
   * earlier jobs (a hand that is about to be freed) is queued anyway and checked
   * when it reaches the head, before spending time.
   */
  enqueue(
    item: Item,
    target: Target,
    count = item.count,
    later = false,
  ): { ok: true; job: MoveJob } | { ok: false; reason: string } {
    const state = this.inventory.targetState(target);
    if (
      this.jobs.some(
        (pending) =>
          pending.kind === 'move' &&
          pending.itemUid === item.uid &&
          pending.count === count &&
          canonicalJson(pending.target) === canonicalJson(state),
      )
    ) {
      return { ok: false, reason: 'Already queued' };
    }
    const from = this.inventory.locate(item);
    const plan = this.inventory.plan(item, target, count);
    if (!(plan.ok || (later && from))) {
      return plan;
    }
    const duration = plan.ok ? plan.time : this.inventory.handlingTime(item, from!, target);
    const { name } = defOf(this.inventory.registry, item.type);
    const job: MoveJob = {
      kind: 'move',
      itemUid: item.uid,
      target: state,
      count,
      label: `${name}${count > 1 ? ` ×${count}` : ''} → ${describeTarget(this.inventory, target)}`,
      duration,
      elapsed: 0,
    };
    this.jobs.push(job);
    if (this.jobs.length === 1) {
      this.announceMoveStart(job);
    }
    return { ok: true, job };
  }

  /** Queues a tagged action; its handler is runtime wiring, never part of the job data. */
  enqueueAction(jobType: string, label: string, duration: number, params: JobParams = {}): ActionJob {
    if (!this.handlers.has(jobType)) {
      throw new Error(`No handler registered for action ${jobType}`);
    }
    if (!isJobValue(params)) {
      throw new Error(`Action ${jobType} parameters must be plain serializable data`);
    }
    const job: ActionJob = { kind: 'action', jobType, params: structuredClone(params), label, duration, elapsed: 0 };
    this.jobs.push(job);
    return job;
  }

  cancel(): void {
    this.jobs.length = 0;
    this.announced = undefined;
  }

  /** Withdraws one owned job without discarding unrelated queued handling. */
  cancelJob(job: Job): void {
    const index = this.jobs.indexOf(job);
    if (index >= 0) {
      this.jobs.splice(index, 1);
      if (this.announced === job) {
        this.announced = undefined;
      }
    }
  }

  /** Spends `dt` seconds on the queue, finishing jobs in order. */
  tick(dt: number): TickResult {
    const result: TickResult = { done: [], failed: [], completedMoves: [] };
    let left = dt;
    while (this.jobs.length > 0) {
      const job = this.jobs[0]!;
      if (job.kind === 'move' && job.elapsed === 0) {
        const reason = this.prepareMove(job);
        if (reason !== undefined) {
          this.jobs.shift();
          this.announced = undefined;
          result.failed.push({ job, reason });
          continue;
        }
      }
      const need = job.duration - job.elapsed;
      if (left < need - 1e-9) {
        job.elapsed += left;
        break;
      }
      left -= need;
      job.elapsed = job.duration;
      this.jobs.shift();
      this.announced = undefined;
      this.execute(job, result);
    }
    return result;
  }

  /** Validate the new head against the live owner, before consuming any time. */
  private prepareMove(job: MoveJob): string | undefined {
    const item = this.inventory.itemByUid(job.itemUid);
    const target = this.inventory.resolveTarget(job.target);
    if (!(item && target)) {
      return "It isn't there any more";
    }
    const plan = this.inventory.plan(item, target, job.count);
    if (!plan.ok) {
      return plan.reason;
    }
    const from = this.inventory.locate(item)!;
    const current = this.inventory.targetState(from.kind === 'pile' ? { kind: 'pile', pos: from.pile.pos } : from);
    // An automatic grid target means this container/pile; an explicit spot still permits rearranging it.
    if ('at' in job.target && job.target.at && 'placed' in from && current.kind !== 'hand' && current.kind !== 'worn') {
      current.at = { x: from.placed.x, y: from.placed.y, rotated: from.placed.rotated };
    }
    if (job.count === item.count && canonicalJson(current) === canonicalJson(job.target)) {
      return "It's already there";
    }
    job.duration = plan.time;
    if (this.announced !== job) {
      this.announceMoveStart(job);
    }
    return undefined;
  }

  private announceMoveStart(job: MoveJob): void {
    const item = this.inventory.itemByUid(job.itemUid);
    const from = item ? this.inventory.locate(item) : undefined;
    const target = this.inventory.resolveTarget(job.target);
    if (item && from && target) {
      this.announced = job;
      this.onMoveStart?.({ item, from, target });
    }
  }

  private execute(job: Job, result: TickResult): void {
    const item = job.kind === 'move' ? this.inventory.itemByUid(job.itemUid) : undefined;
    const source = item ? this.inventory.locate(item) : undefined;
    const sourceCount = item?.count;
    const reason = this.finish(job);
    if (reason !== undefined) {
      result.failed.push({ job, reason });
      return;
    }
    result.done.push(job);
    if (job.kind === 'move') {
      result.completedMoves.push({
        job,
        ...(source ? { source } : {}),
        ...(sourceCount === undefined ? {} : { sourceCount }),
      });
    }
  }

  private finish(job: Job): string | undefined {
    if (job.kind === 'action') {
      const handler = this.handlers.get(job.jobType);
      return handler ? handler(job.params) : `Unknown action ${job.jobType}`;
    }
    const item = this.inventory.itemByUid(job.itemUid);
    const target = this.inventory.resolveTarget(job.target);
    if (!(item && target)) {
      return "It isn't there any more";
    }
    const from = this.inventory.locate(item);
    const moved = this.inventory.move(item, target, job.count);
    if (moved.ok && from) {
      this.onMoveComplete?.({ item, from, target });
    }
    return moved.ok ? undefined : moved.reason;
  }
}
