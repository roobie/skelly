// The simulation core: clock, scheduler, events, compression and pause, with the
// systems registered on it. Pure, so scenario tests run it headless.

import { Body, type BodyImpact, type BodyRegion, type BodyState } from './body.ts';
import { type ClockSettings, calendarAt, defaultClock, gameHours } from './clock.ts';
import { Compression, type CompressionLimits } from './compression.ts';
import type { Vec3 } from './coords.ts';
import { EventQueue, type EventReader } from './events.ts';
import { LongActions } from './longAction.ts';
import { causeOf, NEED_RATES, type Needs, SPAWN_NEEDS, stepNeeds } from './needs.ts';
import { Rng } from './random.ts';
import { Scheduler, type SchedulerState } from './scheduler.ts';
import type { BodyTuningDef } from './schema.ts';
import { freezeSnapshot } from './snapshotData.ts';
import type { SimSeconds } from './time.ts';
import type { SoundEventId } from './soundEvents.ts';
import type { SoundEmission } from './soundPicker.ts';

/** Events systems emit. Sound choices and their hearing stimuli are committed before playback. */
export type SimEvent =
  | { kind: 'interrupt'; reason: string }
  | { kind: 'damage'; amount: number; cause: string }
  | { kind: 'death'; cause: string }
  | ({ kind: 'sound' } & SoundEmission)
  | { kind: 'noise'; event: SoundEventId; position: Vec3; id: number; radiusMetres: number; expiresAt: number };

export type Timed<E> = E & { readonly time: number };

export interface SimulationState {
  seed: number;
  clock: ClockSettings;
  time: number;
  scheduler: SchedulerState;
  needs: Needs;
  body: BodyState;
  compression: { c: number; active: boolean; interruption?: string };
  pendingInterrupt?: string;
  dead?: { cause: string; time: number };
}

export interface SimOptions {
  seed: number;
  bodyTuning: BodyTuningDef;
  clock?: ClockSettings;
  /**
   * Why unowned compression isn't safe right now (a hostile is aware of the player,
   * or one is near). Long actions ignore proximity; emitted interrupt events still stop them.
   */
  unsafe?: () => string | undefined;
  /**
   * The fatigue rate a resting or sleeping long action wants right now, in percent
   * per game hour, or undefined for the normal rate. Asked once per needs tick.
   */
  restRate?: () => number | undefined;
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
  readonly actions: LongActions;
  readonly needs: Needs = { ...SPAWN_NEEDS };
  readonly body: Body;
  /** Esc pauses everything; the inventory screen doesn't. */
  paused = false;
  /** Set when health reaches 0; from then on nothing advances. */
  dead: { cause: string; time: number } | undefined;
  /** Debug-only control is owned by the game; damage sources still run normally. */
  godMode = false;
  /** Debug-only: compression ignores `unsafe` (a hostile nearby), as in the debug time skip. Interrupt events still stop it. */
  ignoreUnsafe = false;
  private readonly interrupts: EventReader<Timed<SimEvent>>;
  private pendingInterrupt: string | undefined;
  private readonly unsafe: () => string | undefined;
  private readonly restRate: () => number | undefined;

  constructor(options: SimOptions) {
    this.seed = options.seed;
    this.clock = options.clock ?? defaultClock;
    this.body = new Body(options.bodyTuning);
    this.unsafe = options.unsafe ?? (() => undefined);
    this.restRate = options.restRate ?? (() => undefined);
    this.interrupts = this.events.reader();
    this.scheduler.register({
      id: 'needs',
      rate: NEEDS_RATE,
      maxStep: NEEDS_MAX_STEP,
      tick: (dt) => {
        const rate = this.restRate();
        const rates = rate === undefined ? NEED_RATES : { ...NEED_RATES, fatigue: rate };
        for (const reason of stepNeeds(this.needs, this.body, gameHours(this.clock, dt), {
          damageImmune: this.godMode,
          rates,
        })) {
          this.emit({ kind: 'interrupt', reason });
        }
        if (this.body.health <= 0) {
          this.die(causeOf(this.needs) ?? 'your injuries');
        }
      },
    });
    // A due treatment resolves before this tick advances an early infection to antibiotic-only.
    this.actions = new LongActions(this);
    this.scheduler.register({
      id: 'body',
      rate: NEEDS_RATE,
      maxStep: NEEDS_MAX_STEP,
      tick: (dt) => {
        const cause = this.body.advance(dt, this.godMode, dt * this.clock.ratio);
        if (cause) {
          this.die(cause);
        }
      },
    });
  }

  /** Isolated plain-data continuation state; an unread interrupt is carried to the next frame. */
  snapshotState(): Readonly<SimulationState> {
    return freezeSnapshot({
      seed: this.seed,
      clock: { ratio: this.clock.ratio, start: this.clock.start },
      time: this.time,
      scheduler: this.scheduler.snapshotState() as SchedulerState,
      needs: { ...this.needs },
      body: this.body.snapshotState() as BodyState,
      compression: {
        c: this.compression.c,
        active: this.compression.active,
        ...(this.compression.interruption === undefined ? {} : { interruption: this.compression.interruption }),
      },
      ...(this.dead === undefined && this.pendingInterrupt !== undefined
        ? { pendingInterrupt: this.pendingInterrupt }
        : {}),
      ...(this.dead === undefined ? {} : { dead: { ...this.dead } }),
    });
  }

  /** Restores onto a freshly constructed runtime after registering its systems. */
  restoreState(state: SimulationState): void {
    if (state.seed !== this.seed || state.clock.ratio !== this.clock.ratio || state.clock.start !== this.clock.start) {
      throw new Error('Simulation identity does not match snapshot');
    }
    if (!Number.isFinite(state.compression.c) || state.compression.c < 1) {
      throw new Error('Invalid compression state');
    }
    if (state.pendingInterrupt !== undefined && (typeof state.pendingInterrupt !== 'string' || state.dead)) {
      throw new Error('Invalid pending interruption state');
    }
    Object.assign(this.needs, state.needs);
    this.body.restoreState(state.body);
    this.compression.c = state.compression.c;
    this.compression.active = state.compression.active;
    this.compression.interruption = state.compression.interruption;
    this.dead = state.dead === undefined ? undefined : { ...state.dead };
    this.pendingInterrupt = undefined;
    this.scheduler.restoreState(state.scheduler);
    if (state.pendingInterrupt !== undefined) {
      this.emit({ kind: 'interrupt', reason: state.pendingInterrupt });
    }
    this.paused = true;
    this.godMode = false;
    this.ignoreUnsafe = false;
  }

  /** Simulation seconds since the start. */
  get time(): number {
    return this.scheduler.time;
  }

  /** Calendar seconds since midnight of day 1. */
  get calendar(): number {
    return calendarAt(this.clock, this.time);
  }

  /** Explicit debug-panel time travel; skipped time is not simulated. */
  setDebugCalendarTime(calendarSeconds: number): void {
    const time = (calendarSeconds - this.clock.start) / this.clock.ratio;
    if (!Number.isFinite(time) || time < this.time) {
      throw new Error(`Invalid debug calendar time ${calendarSeconds}`);
    }
    this.scheduler.seek(time);
    this.pendingInterrupt = undefined;
    this.compression.stop();
    this.compression.snap();
  }

  /** The random stream for a system. */
  rng(systemId: string): Rng {
    return Rng.stream(this.seed, systemId);
  }

  emit(event: SimEvent): void {
    if (event.kind === 'interrupt' && this.pendingInterrupt === undefined) {
      this.pendingInterrupt = event.reason;
    }
    this.events.emit({ ...event, time: this.time });
  }

  /** Takes health (a fall, food poisoning, later a bite); at 0 you die of `cause`. */
  hurt(amount: number, cause: string): void {
    this.takeDamage(cause, () => this.body.damageHealth(amount));
  }

  hit(amount: number, cause: string, region: BodyRegion = 'torso', effects: BodyImpact = {}): void {
    const woundAlreadyExists = this.body.wounds[region] !== null;
    const infectionAtRisk =
      effects.infectionAtRisk ??
      (Boolean(effects.bleeding) &&
        (woundAlreadyExists ||
          this.rng(`body-infection:${region}:${this.time}:${amount}`).next() < this.body.tuning.infectionChance));
    this.takeDamage(cause, () => this.body.impact(amount, region, { ...effects, infectionAtRisk }));
  }

  private takeDamage(cause: string, apply: () => number): void {
    if (this.dead || this.godMode) {
      return;
    }
    const applied = apply();
    if (applied > 0) {
      this.emit({ kind: 'damage', amount: applied, cause });
    }
    if (this.body.health <= 0) {
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
    this.pendingInterrupt = undefined;
    this.compression.stop();
    this.compression.snap();
    this.emit({ kind: 'death', cause });
  }

  /** Starts unowned compression, such as the debug skip, only while it is safe. */
  compress(limits?: CompressionLimits): { ok: true } | { ok: false; reason: string } {
    if (this.actions.job?.jobType === 'pry' && !this.actions.job.stopped) {
      return { ok: false, reason: 'Stop prying first' };
    }
    return this.compression.start(this.unsafeReason(), limits);
  }

  /** Long actions use normal fast-forward near threats; emitted interruptions still stop them. */
  compressLongAction(): { ok: true } | { ok: false; reason: string } {
    return this.compression.start(undefined);
  }

  private unsafeReason(): string | undefined {
    return this.ignoreUnsafe ? undefined : this.unsafe();
  }

  /** Advances by an already-planned Sim-time step. Real-time conversion belongs to the outer frame driver. */
  frame(simDt: SimSeconds, until?: number): number {
    if (this.paused || this.dead) {
      return 0;
    }
    // Events emitted between frames (input, debug keys) count too.
    this.checkInterruptions();
    const { c } = this.compression;
    const wanted = Math.min(simDt, this.compression.limits.maxSimPerFrame ?? Number.POSITIVE_INFINITY);
    const dt = until === undefined ? wanted : Math.min(wanted, Math.max(0, until - this.time));
    const hadAction = this.actions.job !== undefined;
    const advanced = this.scheduler.advance(
      dt,
      c,
      () => this.dead !== undefined || this.checkInterruptions() || (hadAction && this.actions.job === undefined),
    );
    this.actions.syncInterruption();
    return advanced;
  }

  /**
   * Drops compression to 1× on an emitted interrupt, or when unowned active
   * compression stops being safe. Returns true so the scheduler stops before the next step.
   */
  private checkInterruptions(): boolean {
    const events = this.interrupts.read();
    this.pendingInterrupt = undefined;
    const emitted = events.find((e): e is Timed<Extract<SimEvent, { kind: 'interrupt' }>> => e.kind === 'interrupt');
    const { compression } = this;
    const action = this.actions.job;
    if (!(compression.active || compression.c > 1)) {
      if (action?.jobType === 'pry' && emitted) {
        compression.interrupt(emitted.reason);
        return true;
      }
      return false;
    }
    const reason =
      emitted?.reason ?? (compression.active && !(action && !action.stopped) ? this.unsafeReason() : undefined);
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
