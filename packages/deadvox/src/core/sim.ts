// The simulation core: clock, scheduler, events, compression and pause, with the
// systems registered on it. Pure, so scenario tests run it headless.

import { Body, type BodyImpact, type BodyRegion, type BodyState, type DamageKind, type Touch } from './body.ts';
import { type ClockSettings, calendarAt, simToGameHours } from './clock.ts';
import { Compression, type CompressionLimits, type CompressionOwner, longActionLimits } from './compression.ts';
import type { Vec3 } from './coords.ts';
import {
  type DamageExposure,
  type DamageExposureState,
  DamageExposures,
  type ExposureContact,
} from './damageExposure.ts';
import { EventQueue, type EventReader } from './events.ts';
import { LongActions } from './longAction.ts';
import { awakeRates, causeOf, type Needs, needsAllowRecovery, type RecoveryState, stepNeeds } from './needs.ts';
import type { AnalgesicLookup } from './pain.ts';
import { Rng } from './random.ts';
import { Scheduler, type SchedulerState } from './scheduler.ts';
import type { BodyTuningDef, CompressionCaps } from './schema.ts';
import { freezeSnapshot } from './snapshotData.ts';
import type { SoundId } from './soundEvents.ts';
import type { SoundEmission } from './soundPicker.ts';
import type { SimSeconds } from './time.ts';

/** Events systems emit. Sound choices and their hearing stimuli are committed before playback. */
export type SimEvent =
  | { kind: 'interrupt'; reason: string }
  | { kind: 'damage'; amount: number; cause: string }
  | { kind: 'death'; cause: string }
  | ({ kind: 'sound' } & SoundEmission)
  | { kind: 'noise'; event: SoundId; position: Vec3; id: number; radiusMetres: number; expiresAt: number };

export type Timed<E> = E & { readonly time: number };

/** A hit's effects; the body's bleeding tiers decide from its kind whether and how badly it bleeds. A touch chooses the worn slot it meets first. */
export type HitEffects = Omit<BodyImpact, 'bleeding'> & { touch?: Touch };

export interface SimulationState {
  seed: number;
  clock: ClockSettings;
  time: number;
  scheduler: SchedulerState;
  needs: Needs;
  body: BodyState;
  exposures: DamageExposureState;
  compression: { c: number; active: boolean; owner: CompressionOwner; interruption?: string };
  pendingInterrupt?: string;
  dead?: { cause: string; time: number };
}

export interface SimOptions {
  seed: number;
  bodyTuning: BodyTuningDef;
  /** The painkillers content defines, by item type; without it nothing can be taken. */
  analgesics?: AnalgesicLookup;
  /** The content cap of each compressing long action. */
  compressionCaps: CompressionCaps;
  clock: ClockSettings;
  onImpact?: (amount: number, region: BodyRegion, kind: DamageKind, touch?: Touch) => void;
  /** Whether what the hit meets first keeps this kind off the region; such a hit lands nowhere. */
  impervious?: (region: BodyRegion, kind: DamageKind, touch?: Touch) => boolean;
  protectionShare?: (region: BodyRegion, kind: DamageKind, touch?: Touch) => number;
}

/** Needs tick at 1 Hz; under compression their step grows to 30 s, 4 game minutes at 1:8. */
const NEEDS_RATE = 1;
const NEEDS_MAX_STEP = 30;

export class Simulation {
  readonly seed: number;
  readonly clock: ClockSettings;
  readonly scheduler = new Scheduler();
  readonly events = new EventQueue<Timed<SimEvent>>();
  readonly compression: Compression;
  readonly actions: LongActions;
  readonly needs: Needs;
  readonly body: Body;
  readonly exposures: DamageExposures;
  private readonly onImpact: SimOptions['onImpact'];
  private readonly impervious: NonNullable<SimOptions['impervious']>;
  private readonly protectionShare: NonNullable<SimOptions['protectionShare']>;
  /** Esc pauses everything; the inventory screen doesn't. */
  paused = false;
  /** Set when health reaches 0; from then on nothing advances. */
  dead: { cause: string; time: number } | undefined;
  /** Debug-only control is owned by the game; damage sources still run normally. */
  godMode = false;
  private readonly interrupts: EventReader<Timed<SimEvent>>;
  private pendingInterrupt: string | undefined;
  private readonly compressionCaps: CompressionCaps;

  constructor(options: SimOptions) {
    this.seed = options.seed;
    this.clock = options.clock;
    this.body = new Body(options.bodyTuning, undefined, undefined, options.analgesics);
    this.onImpact = options.onImpact;
    this.impervious = options.impervious ?? (() => false);
    this.protectionShare = options.protectionShare ?? (() => 0);
    this.exposures = new DamageExposures(options.bodyTuning, (id) => this.rng(`exposure:${id}`).next());
    this.scheduler.register({
      id: 'damage-exposure',
      enabled: () => this.exposures.active,
      rate: 60,
      maxStep: NEEDS_MAX_STEP,
      tick: (_dt, time) => this.advanceExposuresTo(time),
    });
    this.needs = this.body.spawnNeeds;
    this.compressionCaps = options.compressionCaps;
    // A start without its own limits (debug compression, a restored skip) passes time like a wait.
    this.compression = new Compression(longActionLimits(options.compressionCaps.wait));
    this.interrupts = this.events.reader();
    this.scheduler.register({
      id: 'needs',
      rate: NEEDS_RATE,
      maxStep: NEEDS_MAX_STEP,
      tick: (dt) => {
        const { restRate } = this.actions;
        const awake = awakeRates(this.body);
        for (const reason of stepNeeds(this.needs, this.body, simToGameHours(this.clock, dt), {
          damageImmune: this.godMode,
          rates: restRate === undefined ? awake : { ...awake, fatigue: restRate },
          recoveryFactor: this.recoveryFactor,
          state: this.recoveryState,
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
        const cause = this.body.advance(dt, this.godMode, dt * this.clock.ratio, {
          recovering: needsAllowRecovery(this.needs, this.body, this.recoveryState),
          recoveryFactor: this.recoveryFactor,
        });
        if (cause) {
          this.die(cause);
        }
      },
    });
  }

  /** Sleep multiplies health, regional and blood recovery. */
  private get recoveryFactor(): number {
    return this.actions.asleep ? this.body.sleepRecoveryFactor : 1;
  }

  /** Picks the body's fatigue ceiling for the recovery gate. */
  private get recoveryState(): RecoveryState {
    return this.actions.asleep ? 'asleep' : 'awake';
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
      exposures: this.exposures.snapshotState() as DamageExposureState,
      compression: {
        c: this.compression.c,
        active: this.compression.active,
        owner: this.compression.owner,
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
    const staminaDelay = state.needs.staminaRegenDelayRemainingSimSeconds;
    if (
      !Number.isFinite(staminaDelay) ||
      staminaDelay < 0 ||
      staminaDelay > this.body.tuning.staminaRegenDelaySimSeconds ||
      (state.needs.stamina > 0 && staminaDelay !== 0)
    ) {
      throw new Error('Invalid stamina recovery delay');
    }
    Object.assign(this.needs, state.needs);
    this.body.restoreState(state.body);
    // Exposures must precede scheduler restore: enabled predicates determine its saved phase.
    this.exposures.restoreState(state.exposures);
    if (this.exposures.simTimestamp > state.time) {
      throw new Error('Exposure cursor exceeds simulation time');
    }
    this.compression.c = state.compression.c;
    this.compression.active = state.compression.active;
    this.compression.interruption = state.compression.interruption;
    this.compression.owner = state.compression.owner;
    if (state.compression.active) {
      // Limits aren't saved: active compression resumes with the defaults until a restored long action sets its own.
      this.compression.start(undefined, state.compression.owner);
    }
    this.dead = state.dead === undefined ? undefined : { ...state.dead };
    this.pendingInterrupt = undefined;
    this.scheduler.restoreState(state.scheduler);
    if (state.pendingInterrupt !== undefined) {
      this.emit({ kind: 'interrupt', reason: state.pendingInterrupt });
    }
    this.paused = true;
    this.godMode = false;
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
    this.exposures.seek(time);
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

  /** A hit of a damage kind may open a bleeding wound (`Body.bleedingTierForHit`). */
  hit(amount: number, cause: string, region: BodyRegion = 'torso', effects: HitEffects = {}): void {
    this.advanceExposuresTo(this.time);
    if (effects.kind !== undefined && this.impervious(region, effects.kind, effects.touch)) {
      return;
    }
    this.takeDamage(cause, () => {
      const exposure =
        effects.kind === undefined
          ? undefined
          : this.exposures.hit(amount, cause, region, { kind: effects.kind, touch: effects.touch });
      return this.impact(amount, region, effects, exposure);
    });
  }

  expose(contact: ExposureContact): void {
    if (this.dead || this.godMode) {
      return;
    }
    this.advanceExposuresTo(this.time);
    if (this.impervious(contact.region, contact.kind, contact.touch)) {
      this.exposures.leave(contact.id);
    } else {
      this.exposures.contact(contact);
    }
    this.checkInterruptions();
  }

  leaveExposure(source: string): void {
    this.advanceExposuresTo(this.time);
    this.exposures.leave(source);
  }

  endExposure(kind: DamageKind): void {
    this.advanceExposuresTo(this.time);
    this.exposures.end(kind);
  }

  private advanceExposuresTo(time: number): void {
    this.exposures.advance(
      Math.max(0, time - this.exposures.simTimestamp),
      (amount, cause, exposure, touch) => {
        this.takeDamage(
          cause,
          () => this.impact(amount, exposure.region, { kind: exposure.kind, ...(touch && { touch }) }, exposure),
          false,
        );
      },
      this.exposureBlocked,
    );
  }

  private readonly exposureBlocked = (exposure: DamageExposure, touch: Touch | undefined): boolean =>
    this.impervious(exposure.region, exposure.kind, touch);

  private get exposureRefusal(): string | undefined {
    return this.exposures.refusal(this.exposureBlocked);
  }

  get actionRefusal(): string | undefined {
    return this.exposureRefusal ?? this.body.actionRefusal;
  }

  private openedBleedingTier(
    amount: number,
    region: BodyRegion,
    kind: DamageKind,
    exposure?: DamageExposure,
  ): number | undefined {
    let bleeding = this.body.bleedingTierForHit(
      amount,
      region,
      kind,
      exposure?.roll ?? this.rng(`body-bleeding:${region}:${this.time}:${amount}`).next(),
    );
    if (exposure && bleeding !== undefined) {
      if (exposure.openedTier !== undefined && bleeding <= exposure.openedTier) {
        bleeding = undefined;
      } else {
        exposure.openedTier = bleeding;
      }
    }
    return bleeding;
  }

  private impact(
    fullAmount: number,
    region: BodyRegion,
    { touch, ...effects }: HitEffects,
    exposure?: DamageExposure,
  ): number {
    if (effects.kind !== undefined && this.impervious(region, effects.kind, touch)) {
      return 0;
    }
    const transmitted = effects.kind === undefined ? 1 : 1 - this.protectionShare(region, effects.kind, touch);
    const amount = fullAmount * transmitted;
    const bleeding =
      effects.kind === undefined
        ? undefined
        : this.openedBleedingTier((exposure?.damage ?? fullAmount) * transmitted, region, effects.kind, exposure);
    const woundAlreadyExists = this.body.wounds[region] !== null;
    const infectionAtRisk =
      effects.infectionAtRisk ??
      exposure?.infectionAtRisk ??
      (bleeding !== undefined &&
        (woundAlreadyExists ||
          (exposure?.infectionRoll ?? this.rng(`body-infection:${region}:${this.time}:${amount}`).next()) <
            this.body.tuning.infectionChance));
    if (exposure && bleeding !== undefined) {
      exposure.infectionAtRisk = infectionAtRisk;
    }
    if (effects.kind !== undefined) {
      this.onImpact?.(fullAmount, region, effects.kind, touch);
    }
    return this.body.impact(amount, region, {
      ...effects,
      infectionAtRisk,
      ...(bleeding === undefined ? {} : { bleeding }),
    });
  }

  land(speedMetresPerSimSecond: number): void {
    const { safeSpeedMetresPerSimSecond, damagePerSquaredSpeed, damageSpread, regions, kind, cause } =
      this.body.tuning.landing;
    if (speedMetresPerSimSecond <= safeSpeedMetresPerSimSecond) {
      return;
    }
    const roll = this.rng(`body-landing:${this.time}:${speedMetresPerSimSecond}`).next();
    const spread = damageSpread.min + roll * (damageSpread.max - damageSpread.min);
    const damage = (speedMetresPerSimSecond ** 2 - safeSpeedMetresPerSimSecond ** 2) * damagePerSquaredSpeed * spread;
    const totalWeight = regions.reduce((sum, { weight }) => sum + weight, 0);
    this.takeDamage(cause, () =>
      regions.reduce(
        (applied, { region, weight }) => applied + this.impact((damage * weight) / totalWeight, region, { kind }),
        0,
      ),
    );
  }

  private takeDamage(cause: string, apply: () => number, interrupt = true): void {
    if (this.dead || this.godMode) {
      return;
    }
    const applied = apply();
    if (applied > 0) {
      this.emit({ kind: 'damage', amount: applied, cause });
    }
    if (this.body.health <= 0) {
      this.die(cause);
    } else if (interrupt) {
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

  /**
   * Starts debug compression, such as the skip. Neither shamblers nearby nor bleeding refuse it: only an
   * emitted interruption, such as a hit, stops it (`DESIGN.md`, "Long actions").
   */
  compress(limits?: CompressionLimits): { ok: true } | { ok: false; reason: string } {
    if (this.actions.job?.jobType === 'forceDoor' && !this.actions.job.stopped) {
      return { ok: false, reason: 'Stop forcing the door first' };
    }
    return this.compression.start(undefined, 'debug', limits);
  }

  /**
   * Compresses a player long action up to its content cap. Bleeding refuses it, and stops it once it bleeds
   * too fast; emitted interruptions still stop it.
   */
  compressLongAction(jobType: keyof CompressionCaps): { ok: true } | { ok: false; reason: string } {
    const refusal = this.exposureRefusal;
    if (refusal) {
      return { ok: false, reason: refusal };
    }
    return this.compression.start(
      this.body.compressionRefusal,
      'long-action',
      longActionLimits(this.compressionCaps[jobType]),
    );
  }

  /** Processes events emitted between frames before the outer driver sizes this frame. */
  beginFrame(): void {
    this.checkInterruptions();
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

  /** Advances one replay step in Real time, scaled by the recorded compression. */
  frameReplay(realSeconds: number): number {
    if (this.paused || this.dead) {
      return 0;
    }
    if (!Number.isFinite(realSeconds) || realSeconds < 0) {
      throw new Error('Invalid replay step');
    }
    this.checkInterruptions();
    const { c } = this.compression;
    const dt = Math.min(realSeconds * c, this.compression.limits.maxSimPerFrame);
    const hadAction = this.actions.job !== undefined;
    const advanced = this.scheduler.advance(
      dt,
      c,
      () => this.dead !== undefined || this.checkInterruptions() || (hadAction && this.actions.job === undefined),
    );
    this.actions.syncInterruption();
    return advanced;
  }

  private interruptExposure(): boolean {
    const action = this.actions.job;
    const reason = this.exposureRefusal;
    if (!action || action.stopped || reason === undefined) {
      return false;
    }
    this.actions.interruptExposure(reason);
    if (this.compression.active) {
      this.compression.interrupt(reason);
    } else {
      this.compression.snap();
    }
    return true;
  }

  /** Drops compression to 1× on an emitted interrupt. Returns true so the scheduler stops before the next step. */
  private checkInterruptions(): boolean {
    const events = this.interrupts.read();
    this.pendingInterrupt = undefined;
    const emitted = events.find((e): e is Timed<Extract<SimEvent, { kind: 'interrupt' }>> => e.kind === 'interrupt');
    const { compression } = this;
    const action = this.actions.job;
    if (this.interruptExposure()) {
      return true;
    }
    if (!(compression.active || compression.c > 1)) {
      if (action && emitted && this.actions.runsUncompressed(action.jobType)) {
        this.actions.interruptUncompressed(emitted.reason);
        return true;
      }
      return false;
    }
    const bleedingRefusal =
      compression.active && compression.owner === 'long-action' ? this.body.compressionRefusal : undefined;
    const reason = emitted?.reason ?? bleedingRefusal;
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
