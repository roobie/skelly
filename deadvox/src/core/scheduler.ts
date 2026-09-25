// The fixed-step scheduler. Systems declare a tick rate in simulation seconds. Under
// compression a slow system takes bigger steps instead of more ticks, up to its
// maxStep, so the cost per frame stays bounded (DESIGN.md, "Simulation architecture";
// CHALLENGES.md, "Compressed time"). Ticks from all systems run in time order.

export interface SystemSpec {
  readonly id: string;
  /** Ticks per simulation second at 1×. */
  readonly rate: number;
  /**
   * The longest step, in simulation seconds, the system accepts when compression
   * grows its step. Defaults to 1 / rate: the step never grows (physics).
   */
  readonly maxStep?: number;
  /** One step of `dt` simulation seconds, ending at simulation time `time`. */
  readonly tick: (dt: number, time: number) => void;
}

interface Entry {
  readonly spec: SystemSpec;
  readonly step: number;
  readonly maxStep: number;
  /** Simulation time this system has been stepped up to. */
  done: number;
  ticks: number;
}

/** Float slack when comparing accumulated step times. */
const EPS = 1e-9;

export class Scheduler {
  /** Simulation seconds reached. */
  time = 0;
  private readonly entries: Entry[] = [];

  register(spec: SystemSpec): void {
    if (this.entries.some((e) => e.spec.id === spec.id)) {
      throw new Error(`System ${spec.id} is already registered`);
    }
    const step = 1 / spec.rate;
    this.entries.push({ spec, step, maxStep: Math.max(step, spec.maxStep ?? step), done: this.time, ticks: 0 });
  }

  /** The step a system takes at compression c. */
  stepOf(id: string, c: number): number {
    const entry = this.entries.find((e) => e.spec.id === id);
    if (!entry) {
      throw new Error(`No system ${id}`);
    }
    return this.stepFor(entry, c);
  }

  /** Ticks each system has run, by id. */
  tickCounts(): Map<string, number> {
    return new Map(this.entries.map((e) => [e.spec.id, e.ticks]));
  }

  /**
   * Advances by `dt` simulation seconds at compression `c`. After every tick,
   * `halt` is asked whether to stop; if it says yes, the rest of `dt` is dropped.
   * Returns the simulation seconds actually advanced.
   */
  advance(dt: number, c = 1, halt?: () => boolean): number {
    const start = this.time;
    const target = this.time + dt;
    for (;;) {
      const entry = this.nextDue(target, c);
      if (!entry) {
        break;
      }
      const step = this.stepFor(entry, c);
      entry.done += step;
      entry.ticks += 1;
      this.time = Math.max(this.time, entry.done);
      entry.spec.tick(step, entry.done);
      if (halt?.()) {
        return this.time - start;
      }
    }
    this.time = target;
    return dt;
  }

  private stepFor(entry: Entry, c: number): number {
    return Math.min(entry.maxStep, entry.step * Math.max(1, c));
  }

  /** The system whose next tick ends first, if it ends by `target`; ties go to the first registered. */
  private nextDue(target: number, c: number): Entry | undefined {
    let best: Entry | undefined;
    let bestEnd = target + EPS;
    for (const entry of this.entries) {
      const end = entry.done + this.stepFor(entry, c);
      if (end <= bestEnd - (best ? EPS : 0)) {
        best = entry;
        bestEnd = end;
      }
    }
    return best;
  }
}
