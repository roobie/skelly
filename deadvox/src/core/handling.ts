// The handling queue. Moving an item takes real seconds while the world keeps
// running; moves queue up and happen one at a time. A move takes effect when its
// time is up, and is checked again then: the world may have changed meanwhile.
// Other short actions (searching a cupboard, opening a door) queue the same way.

import { describeTarget, type Inventory, type Target } from './inventory.ts';
import { defOf, type Item } from './items.ts';

interface JobBase {
  readonly label: string;
  /** Seconds. */
  readonly duration: number;
  elapsed: number;
}

export interface MoveJob extends JobBase {
  readonly kind: 'move';
  readonly item: Item;
  readonly target: Target;
  readonly count: number;
}

export interface ActionJob extends JobBase {
  readonly kind: 'action';
  /** Happens when the time is up. Returns why it couldn't, or undefined. */
  readonly apply: () => string | undefined;
}

export type Job = MoveJob | ActionJob;

export interface TickResult {
  done: Job[];
  failed: { job: Job; reason: string }[];
}

export class HandlingQueue {
  readonly jobs: Job[] = [];
  private readonly inventory: Inventory;

  constructor(inventory: Inventory) {
    this.inventory = inventory;
  }

  /** Something is being handled: the player can't sprint and moves at half pace. */
  get busy(): boolean {
    return this.jobs.length > 0;
  }

  /** Seconds until the queue is empty. */
  get remaining(): number {
    return this.jobs.reduce((sum, job) => sum + job.duration - job.elapsed, 0);
  }

  /**
   * Queues a move if it could happen now. With `later`, a move that depends on
   * earlier jobs (a hand that is about to be freed) is queued anyway and checked
   * when its time is up.
   */
  enqueue(
    item: Item,
    target: Target,
    count = item.count,
    later = false,
  ): { ok: true; job: MoveJob } | { ok: false; reason: string } {
    const from = this.inventory.locate(item);
    const plan = this.inventory.plan(item, target, count);
    if (!(plan.ok || (later && from))) {
      return plan;
    }
    const duration = plan.ok ? plan.time : this.inventory.handlingTime(item, from!, target);
    const { name } = defOf(this.inventory.registry, item.type);
    const job: MoveJob = {
      kind: 'move',
      item,
      target,
      count,
      label: `${name}${count > 1 ? ` ×${count}` : ''} → ${describeTarget(this.inventory, target)}`,
      duration,
      elapsed: 0,
    };
    this.jobs.push(job);
    return { ok: true, job };
  }

  /** Queues an action that takes `duration` seconds and then happens. */
  enqueueAction(label: string, duration: number, apply: () => string | undefined): ActionJob {
    const job: ActionJob = { kind: 'action', label, duration, elapsed: 0, apply };
    this.jobs.push(job);
    return job;
  }

  cancel(): void {
    this.jobs.length = 0;
  }

  /** Spends `dt` seconds on the queue, finishing jobs in order. */
  tick(dt: number): TickResult {
    const result: TickResult = { done: [], failed: [] };
    let left = dt;
    while (this.jobs.length > 0) {
      const job = this.jobs[0]!;
      const need = job.duration - job.elapsed;
      if (left < need - 1e-9) {
        job.elapsed += left;
        break;
      }
      left -= need;
      job.elapsed = job.duration;
      this.jobs.shift();
      const reason = this.finish(job);
      if (reason === undefined) {
        result.done.push(job);
      } else {
        result.failed.push({ job, reason });
      }
    }
    return result;
  }

  private finish(job: Job): string | undefined {
    if (job.kind === 'action') {
      return job.apply();
    }
    const moved = this.inventory.move(job.item, job.target, job.count);
    return moved.ok ? undefined : moved.reason;
  }
}
