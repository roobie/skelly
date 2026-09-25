// The handling queue. Moving an item takes real seconds while the world keeps
// running; moves queue up and happen one at a time. A move takes effect when its
// time is up, and is checked again then: the world may have changed meanwhile.

import { describeTarget, type Inventory, type Target } from './inventory.ts';
import { defOf, type Item } from './items.ts';

export interface Job {
  readonly item: Item;
  readonly target: Target;
  readonly count: number;
  readonly label: string;
  /** Seconds. */
  readonly duration: number;
  elapsed: number;
}

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
  ): { ok: true; job: Job } | { ok: false; reason: string } {
    const from = this.inventory.locate(item);
    const plan = this.inventory.plan(item, target, count);
    if (!(plan.ok || (later && from))) {
      return plan;
    }
    const duration = plan.ok ? plan.time : this.inventory.handlingTime(item, from!, target);
    const { name } = defOf(this.inventory.registry, item.type);
    const job: Job = {
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
      const moved = this.inventory.move(job.item, job.target, job.count);
      if (moved.ok) {
        result.done.push(job);
      } else {
        result.failed.push({ job, reason: moved.reason });
      }
    }
    return result;
  }
}
