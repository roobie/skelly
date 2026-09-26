// The simulation core: clock, scheduler, events, compression and pause, with the
// systems registered on it. Pure, so scenario tests run it headless.

import { type ClockSettings, calendarAt, defaultClock, gameHours } from './clock.ts';
import { Compression } from './compression.ts';
import { EventQueue, type EventReader } from './events.ts';
import { causeOf, type Needs, SPAWN_NEEDS, stepNeeds } from './needs.ts';
import { Rng } from './random.ts';
import { Scheduler } from './scheduler.ts';

/** Events systems emit. Noise, damage and block changes join as their systems arrive. */
export type SimEvent = { kind: 'interrupt'; reason: string } | { kind: 'death'; cause: string };

export type Timed<E> = E & { readonly time: number };

export interface SimOptions {
  seed: number;
  clock?: ClockSettings;
  /**
   * Why compression isn't safe right now (a hostile is aware of the player, or
   * one is near), or undefined when it is. Asked before and after every step.
   */
  unsafe?: () => string | undefined;
}

/** Needs tick at 1 Hz; under compression their step grows to 30 s, 4 game minutes at 1:8. */
const NEEDS_RATE = 1;
const NEEDS_MAX_STEP = 30;

export class Simulation {
  readonly seed: number;
  readonly clock: ClockSettings;
  readonly scheduler = new Scheduler();
  readonly events = new EventQueue<Timed<SimEvent>>();
  readonly compression = new Compression();
  readonly needs: Needs = { ...SPAWN_NEEDS };
  /** Esc pauses everything; the inventory screen doesn't. */
  paused = false;
  /** Set when health reaches 0; from then on nothing advances. */
  dead: { cause: string; time: number } | undefined;
  private readonly interrupts: EventReader<Timed<SimEvent>>;
  private readonly unsafe: () => string | undefined;

  constructor(options: SimOptions) {
    this.seed = options.seed;
    this.clock = options.clock ?? defaultClock;
    this.unsafe = options.unsafe ?? (() => undefined);
    this.interrupts = this.events.reader();
    this.scheduler.register({
      id: 'needs',
      rate: NEEDS_RATE,
      maxStep: NEEDS_MAX_STEP,
      tick: (dt) => {
        for (const reason of stepNeeds(this.needs, gameHours(this.clock, dt))) {
          this.emit({ kind: 'interrupt', reason });
        }
        if (this.needs.health <= 0) {
          this.die(causeOf(this.needs) ?? 'your injuries');
        }
      },
    });
  }

  /** Simulation seconds since the start. */
  get time(): number {
    return this.scheduler.time;
  }

  /** Calendar seconds since midnight of day 1. */
  get calendar(): number {
    return calendarAt(this.clock, this.time);
  }

  /** The random stream for a system. */
  rng(systemId: string): Rng {
    return Rng.stream(this.seed, systemId);
  }

  emit(event: SimEvent): void {
    this.events.emit({ ...event, time: this.time });
  }

  /** Takes health (a fall, food poisoning, later a bite); at 0 you die of `cause`. */
  hurt(amount: number, cause: string): void {
    if (this.dead) {
      return;
    }
    this.needs.health = Math.max(0, this.needs.health - amount);
    if (this.needs.health <= 0) {
      this.die(cause);
    } else {
      this.emit({ kind: 'interrupt', reason: "You're hurt" });
    }
  }

  private die(cause: string): void {
    if (this.dead) {
      return;
    }
    this.dead = { cause, time: this.time };
    this.compression.stop();
    this.compression.snap();
    this.emit({ kind: 'death', cause });
  }

  /** Starts compression for a long action. Refused, with the reason, when it isn't safe. */
  compress(): { ok: true } | { ok: false; reason: string } {
    return this.compression.start(this.unsafe());
  }

  /**
   * Advances by one real frame of `realDt` seconds. With `until`, it stops at that
   * simulation time (the end of a long action). Returns the simulation seconds
   * advanced.
   */
  frame(realDt: number, until?: number): number {
    if (this.paused || this.dead) {
      return 0;
    }
    this.compression.update(realDt);
    // Events emitted between frames (input, debug keys) count too.
    this.checkInterruptions();
    const { c } = this.compression;
    const dt = until === undefined ? realDt * c : Math.min(realDt * c, Math.max(0, until - this.time));
    return this.scheduler.advance(dt, c, () => this.dead !== undefined || this.checkInterruptions());
  }

  /**
   * Drops compression to 1× when an interruption was emitted or it stopped being
   * safe. Returns true when it did, so the scheduler stops before the next step.
   */
  private checkInterruptions(): boolean {
    const emitted = this.interrupts
      .read()
      .find((e): e is Timed<Extract<SimEvent, { kind: 'interrupt' }>> => e.kind === 'interrupt');
    const { compression } = this;
    if (!(compression.active || compression.c > 1)) {
      return false;
    }
    const reason = emitted?.reason ?? this.unsafe();
    if (reason === undefined) {
      return false;
    }
    if (compression.active) {
      compression.interrupt(reason);
    } else {
      compression.snap();
    }
    return true;
  }
}
