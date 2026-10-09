/**
 * Periodic checkpoints come due by simulated time, so a paused game, whose simulation clock
 * stands still, never saves however long it stays open.
 */
export class CheckpointSchedule {
  private readonly interval: number;
  private nextAt: number;

  constructor(interval: number, time: number) {
    this.interval = interval;
    this.nextAt = this.after(time);
  }

  /** Moves the next checkpoint to the first interval after `time`. */
  rearm(time: number): void {
    this.nextAt = this.after(time);
  }

  /** True once when `time` reaches the next checkpoint; a frame that crosses several intervals yields one. */
  due(time: number): boolean {
    if (time < this.nextAt) {
      return false;
    }
    this.nextAt = this.after(time);
    return true;
  }

  private after(time: number): number {
    return (Math.floor(time / this.interval) + 1) * this.interval;
  }
}
