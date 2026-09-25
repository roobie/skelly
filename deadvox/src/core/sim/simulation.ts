// One simulation: its clock, scheduled systems and time compression. Pure, so the
// equivalence tests (a compressed hour against an uncompressed one) run in Node.

import { Clock } from './clock.ts';
import { Compression } from './compression.ts';
import { Scheduler } from './scheduler.ts';

export class Simulation {
  readonly clock: Clock;
  readonly scheduler = new Scheduler();
  readonly compression = new Compression();
  /** Nothing advances while paused (Esc). The inventory screen doesn't pause. */
  paused = false;

  constructor(clock = new Clock()) {
    this.clock = clock;
  }

  /** Advances by one frame of real time; returns the simulation seconds that passed. */
  frame(realDt: number): number {
    if (this.paused) {
      return 0;
    }
    this.compression.update(realDt);
    const dt = realDt * this.compression.factor;
    this.scheduler.advance(dt);
    this.clock.advance(dt);
    return dt;
  }
}
