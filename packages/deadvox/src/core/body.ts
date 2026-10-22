import { SECONDS_PER_HOUR } from './clock.ts';
import { type ModifiedEffect, type Modifier, type ModifierActor, modified } from './modifiers.ts';
import {
  type CriticalRule,
  clamp,
  type Needs,
  type NourishmentScale,
  type RecoveryState,
  type StaminaRules,
} from './needs.ts';
import {
  type AnalgesicLookup,
  ageDoses,
  analgesia,
  doseLasts,
  drugVignette,
  fadeAcute,
  type PainReading,
  type PainState,
  painEffects,
  painTier,
} from './pain.ts';
import type { BodyTuningDef, TreatmentDef } from './schema.ts';
import { freezeSnapshot } from './snapshotData.ts';

export const BODY_REGIONS = ['head', 'torso', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'] as const;
export type BodyRegion = (typeof BODY_REGIONS)[number];
const BODY_REGION_WORD_BOUNDARY = /([A-Z])/g;
const BODY_REGION_INITIAL = /^[a-z]/;
export const bodyRegionLabel = (region: BodyRegion): string =>
  region.replace(BODY_REGION_WORD_BOUNDARY, ' $1').replace(BODY_REGION_INITIAL, (first) => first.toUpperCase());
/** The kinds a melee weapon or swing can deal; acid is no weapon class. */
export const MELEE_DAMAGE_KINDS = ['blunt', 'cut', 'pierce'] as const;
export type MeleeDamageKind = (typeof MELEE_DAMAGE_KINDS)[number];
/** What a hit does to flesh; weapons, enemy attacks, bleeding and shock all read it. */
export const DAMAGE_KINDS = [...MELEE_DAMAGE_KINDS, 'acid'] as const;
export type DamageKind = (typeof DAMAGE_KINDS)[number];
/** Contacts that meet a content-chosen wear slot before the region's outermost one. */
export const TOUCHES = ['ground', 'hand'] as const;
export type Touch = (typeof TOUCHES)[number];
const INFECTION_STAGES = ['none', 'early', 'advanced', 'resolved'] as const;
type InfectionStage = (typeof INFECTION_STAGES)[number];
type BleedingTierDef = BodyTuningDef['bleeding']['tiers'][number];
const BAND_EPSILON = 1e-9;

interface BodyWound {
  /**
   * Bleeding severity: 0 has stopped, and the content tier at index i covers (i, i + 1] (`DESIGN.md`, "Bleeding").
   */
  bleeding: number;
  infection: InfectionStage;
  infectionGameSeconds: number;
  infectionAtRisk: boolean;
}

export type BodyWounds = Record<BodyRegion, BodyWound | null>;
export type BodyRegionDamage = Record<BodyRegion, number>;

export interface BodyState {
  health: number;
  blood: number;
  shock: number;
  knockoutElapsed: number;
  regionDamage: BodyRegionDamage;
  wounds: BodyWounds;
  pain: PainState;
}

export interface BodyConsequences {
  sightImpaired: boolean;
  aimSway: number;
  swingSlowdown: number;
  movementSpeed: number;
}

export interface BodyImpact {
  /** Shock follows the kind's `shockPerDamage` unless `shockDamage` overrides it. */
  kind?: DamageKind;
  /** The index of the bleeding tier the hit opens. */
  bleeding?: number;
  shockDamage?: number;
  infectionAtRisk?: boolean;
}

/** What a body step may recover: whether the needs allow it, and sleep's factor on blood recovery. */
interface BodyRecovery {
  recovering?: boolean;
  recoveryFactor?: number;
}

const BODY_START: Readonly<BodyState> = Object.freeze({
  health: 100,
  blood: 100,
  shock: 100,
  knockoutElapsed: 0,
  regionDamage: Object.freeze({ head: 0, torso: 0, leftArm: 0, rightArm: 0, leftLeg: 0, rightLeg: 0 }),
  wounds: Object.freeze({ head: null, torso: null, leftArm: null, rightArm: null, leftLeg: null, rightLeg: null }),
  pain: Object.freeze({ acute: 0, doses: [] }),
});

const validVitals = (value: number): boolean => Number.isFinite(value) && value >= 0 && value <= 100;
const validWound = (value: unknown, tierCount: number): value is BodyWound | null =>
  value === null ||
  (typeof value === 'object' &&
    value !== null &&
    Number.isFinite((value as BodyWound).bleeding) &&
    (value as BodyWound).bleeding >= 0 &&
    (value as BodyWound).bleeding <= tierCount &&
    INFECTION_STAGES.includes((value as BodyWound).infection) &&
    Number.isFinite((value as BodyWound).infectionGameSeconds) &&
    (value as BodyWound).infectionGameSeconds >= 0 &&
    typeof (value as BodyWound).infectionAtRisk === 'boolean');

/** The index of the tier a bleeding severity falls in, or undefined once it has stopped. */
const bleedingTierIndex = (severity: number): number | undefined =>
  severity > 0 ? Math.ceil(severity) - 1 : undefined;

export class Body implements ModifierActor {
  private readonly state: BodyState;
  readonly tuning: BodyTuningDef;
  /** The modifiers on the body's bleeding and treatment numbers (`modifiers.ts`). */
  readonly modifiers: readonly Modifier[];
  /** Where a dose's curve comes from: the item's `analgesic`, read when the dose is weighed. */
  private readonly analgesics: AnalgesicLookup;

  constructor(
    tuning: BodyTuningDef,
    state: BodyState = BODY_START as BodyState,
    modifiers: readonly Modifier[] = [],
    analgesics: AnalgesicLookup = () => undefined,
  ) {
    this.tuning = tuning;
    this.modifiers = modifiers;
    this.analgesics = analgesics;
    this.state = structuredClone(state);
    this.validate();
  }

  private modified(effect: ModifiedEffect, base: number): number {
    return modified(effect, base, this);
  }

  get health(): number {
    return this.state.health;
  }

  get blood(): number {
    return this.state.blood;
  }

  get shock(): number {
    return this.state.shock;
  }

  get unconscious(): boolean {
    return this.state.shock <= 0 && this.state.knockoutElapsed < this.tuning.knockoutSimSeconds;
  }

  get actionRefusal(): string | undefined {
    return this.unconscious ? 'You are unconscious' : undefined;
  }

  /** Bleeding at or above content's loss rate refuses time compression (`DESIGN.md`, "Bleeding"). */
  get compressionRefusal(): string | undefined {
    const loss = this.bloodLossPerSimSecond;
    const { blockCompressionAtLossPerSimSecond: threshold, refusal } = this.tuning.bleeding;
    return loss > 0 && loss >= this.modified('bleeding.blockCompressionAtLossPerSimSecond', threshold)
      ? refusal
      : undefined;
  }

  /** Blood all bleeding wounds lose per Sim second together. */
  private get bloodLossPerSimSecond(): number {
    return BODY_REGIONS.reduce((sum, region) => sum + this.lossRate(this.state.wounds[region]?.bleeding ?? 0), 0);
  }

  /** The index of the worst tier any wound bleeds at, or undefined when none bleeds. */
  get worstBleedingTier(): number | undefined {
    return bleedingTierIndex(Math.max(...BODY_REGIONS.map((region) => this.state.wounds[region]?.bleeding ?? 0)));
  }

  /** The content tier a region's wound bleeds at, or undefined when it doesn't bleed. */
  bleedingTier(region: BodyRegion): BleedingTierDef | undefined {
    const index = bleedingTierIndex(this.state.wounds[region]?.bleeding ?? 0);
    return index === undefined ? undefined : this.tuning.bleeding.tiers[index];
  }

  get regionDamage(): Readonly<BodyRegionDamage> {
    return this.state.regionDamage;
  }

  get wounds(): Readonly<BodyWounds> {
    return this.state.wounds;
  }

  get consequences(): BodyConsequences {
    const { regionDamage } = this.state;
    return {
      sightImpaired: regionDamage.head > 0,
      aimSway: 1 + regionDamage.torso * this.tuning.aimSwayPerDamage,
      swingSlowdown: 1 + Math.max(regionDamage.leftArm, regionDamage.rightArm) * this.tuning.swingSlowdownPerDamage,
      movementSpeed: Math.max(
        this.tuning.minimumMovementSpeed,
        1 - Math.max(regionDamage.leftLeg, regionDamage.rightLeg) * this.tuning.movementSlowdownPerDamage,
      ),
    };
  }

  /**
   * Felt pain and what it does (`DESIGN.md`, "Pain"): acute plus background, less analgesia. It touches nothing in
   * `consequences`, so painkillers ease pain's own effects and leave the injury's.
   */
  get pain(): PainReading {
    const { pain } = this.tuning;
    const { acute, doses } = this.state.pain;
    const injuries = this.backgroundPain;
    const relief = analgesia(doses, this.analgesics);
    const felt = Math.max(0, acute + injuries - relief);
    const ratio = felt / Math.max(Number.MIN_VALUE, this.modified('body.painKnockoutAt', pain.knockoutAt));
    return {
      felt,
      acute,
      injuries,
      relief,
      ratio,
      tier: painTier(ratio, pain.tiers),
      effects: painEffects(ratio, pain),
    };
  }

  /** The drug vignette from active doses, 0 to 1; it touches neither pain nor its effects. */
  get drugVignette(): number {
    return drugVignette(this.state.pain.doses, this.analgesics);
  }

  /** Pain the injuries themselves keep up: region damage, bleeding and infection. It is derived, never stored. */
  private get backgroundPain(): number {
    const { pain } = this.tuning;
    let total = 0;
    for (const region of BODY_REGIONS) {
      const wound = this.state.wounds[region];
      total += this.state.regionDamage[region] * pain.perRegionDamage * pain.regionWeight[region];
      total += this.bleedingTier(region)?.pain ?? 0;
      if (wound?.infection === 'early' || wound?.infection === 'advanced') {
        total += pain.infection[wound.infection];
      }
    }
    return total;
  }

  /** Whether felt pain reaches the content threshold that empties shock. */
  private painKnocksOut(): boolean {
    return this.pain.felt >= this.modified('body.painKnockoutAt', this.tuning.pain.knockoutAt);
  }

  /** Starts one dose of a painkiller; its relief follows the item's curve (`pain.ts`, `doseRelief`). */
  takeAnalgesic(item: string): void {
    const def = this.analgesics(item);
    if (!def) {
      throw new Error(`${item} is not a painkiller`);
    }
    // Content may make every phase zero; such a dose relieves nothing and is never kept, since a kept dose must have time left.
    if (doseLasts(def) > 0) {
      this.state.pain.doses.push({ item, elapsedGameSeconds: 0 });
    }
  }

  // Needs and sleep read their content rates here, once each, so the body's modifier point can wrap them.
  // Content rates load per Game second; the needs step works in Game hours.

  /** The needs and stamina a new character starts with. */
  get spawnNeeds(): Needs {
    return { ...this.tuning.needs.spawn, staminaRegenDelayRemainingSimSeconds: 0 };
  }

  /** Calories and hydration lost per Game hour. */
  get needDrainPerGameHour(): Readonly<{ calories: number; hydration: number }> {
    const { calories, hydration } = this.tuning.needs.drainPerGameHour;
    return { calories: calories * SECONDS_PER_HOUR, hydration: hydration * SECONDS_PER_HOUR };
  }

  /** Health lost per Game hour while calories, or hydration, sit at 0. */
  get healthLossPerGameHour(): Readonly<{ starving: number; dehydrated: number }> {
    const { starving, dehydrated } = this.tuning.needs.healthLossPerGameHour;
    return { starving: starving * SECONDS_PER_HOUR, dehydrated: dehydrated * SECONDS_PER_HOUR };
  }

  get criticalNeeds(): readonly CriticalRule[] {
    return this.tuning.needs.critical;
  }

  get badlyHurt(): Readonly<{ below: number; message: string }> {
    return this.tuning.needs.badlyHurt;
  }

  get staminaRules(): StaminaRules {
    return { ...this.tuning.needs.stamina, critical: this.tuning.needs.critical };
  }

  get nourishmentScale(): NourishmentScale {
    return this.tuning.needs.full;
  }

  /** Sleep debt accrued per Game hour awake. */
  get fatigueRisePerGameHour(): number {
    return this.tuning.fatigueRisePerGameHour * SECONDS_PER_HOUR;
  }

  /** Health, and each region's damage, recovered per Game hour while the needs are met. */
  get healthRecoveryPerGameHour(): number {
    return this.tuning.healthRecoveryPerGameHour * SECONDS_PER_HOUR;
  }

  /** What sleep multiplies health, regional and blood recovery by. */
  get sleepRecoveryFactor(): number {
    return this.tuning.sleepRecoveryFactor;
  }

  /** The lowest calories and hydration at which health and regions still recover. */
  get healthRecoveryNeedsFloor(): Readonly<{ calories: number; hydration: number }> {
    return this.tuning.healthRecoveryNeedsFloor;
  }

  /** The highest fatigue at which health and regions still recover in this state; none where content sets none. */
  healthRecoveryFatigueCeiling(state: RecoveryState): number {
    return this.tuning.healthRecoveryFatigueCeiling[state] ?? Number.POSITIVE_INFINITY;
  }

  /** Fatigue's change per Game hour resting or sleeping on furniture of this rest quality. */
  fatigueRecoveryRate(kind: 'rest' | 'sleep', quality: number): number {
    const { restFatigueRecoveryPerGameHour, sleepFatigueRecoveryPerGameHour, roughSleepShare } = this.tuning;
    const perHour =
      kind === 'rest'
        ? restFatigueRecoveryPerGameHour * quality
        : sleepFatigueRecoveryPerGameHour * (roughSleepShare + (1 - roughSleepShare) * quality);
    return -perHour * SECONDS_PER_HOUR;
  }

  snapshotState(): Readonly<BodyState> {
    return freezeSnapshot(structuredClone(this.state));
  }

  restoreState(state: BodyState): void {
    const copy = structuredClone(state);
    this.validate(copy);
    Object.assign(this.state, copy);
  }

  private validate(state: BodyState = this.state): void {
    if (
      !(
        validVitals(state.health) &&
        validVitals(state.blood) &&
        validVitals(state.shock) &&
        Number.isFinite(state.knockoutElapsed)
      ) ||
      state.knockoutElapsed < 0 ||
      state.knockoutElapsed > this.tuning.knockoutSimSeconds
    ) {
      throw new Error('Invalid body vitals');
    }
    for (const region of BODY_REGIONS) {
      if (
        !(
          validVitals(state.regionDamage[region]) && validWound(state.wounds[region], this.tuning.bleeding.tiers.length)
        )
      ) {
        throw new Error(`Invalid body region ${region}`);
      }
    }
    const { acute, doses } = state.pain;
    if (!(Number.isFinite(acute) && acute >= 0)) {
      throw new Error('Invalid body pain');
    }
    for (const { item, elapsedGameSeconds } of doses) {
      const def = this.analgesics(item);
      if (
        !(def && Number.isFinite(elapsedGameSeconds) && elapsedGameSeconds >= 0 && elapsedGameSeconds < doseLasts(def))
      ) {
        throw new Error(`Invalid painkiller dose ${item}`);
      }
    }
  }

  /** Health damage without a localized wound, such as starvation or food poisoning. */
  damageHealth(amount: number): number {
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error('Invalid body damage');
    }
    const applied = Math.min(amount, this.state.health);
    this.state.health = Math.max(0, this.state.health - amount);
    return applied;
  }

  restoreHealth(amount: number): void {
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error('Invalid health recovery');
    }
    this.state.health = clamp(this.state.health + amount);
  }

  recoverRegionDamage(ratePerGameHour: number, gameHours: number, elapsedGameHours: number): void {
    if (
      !Number.isFinite(ratePerGameHour) ||
      ratePerGameHour < 0 ||
      !Number.isFinite(gameHours) ||
      gameHours < 0 ||
      !Number.isFinite(elapsedGameHours) ||
      elapsedGameHours < 0
    ) {
      throw new Error('Invalid body recovery step');
    }
    for (const region of BODY_REGIONS) {
      const wound = this.state.wounds[region];
      if ((wound?.bleeding ?? 0) > 0 || wound?.infection === 'early' || wound?.infection === 'advanced') {
        continue;
      }
      const untilInfectionHours =
        wound?.infection === 'none' && wound.infectionAtRisk
          ? (this.tuning.infectionOnsetGameHours - wound.infectionGameSeconds) / SECONDS_PER_HOUR
          : Number.POSITIVE_INFINITY;
      const recoverableHours = Math.max(0, Math.min(gameHours, untilInfectionHours - elapsedGameHours));
      this.state.regionDamage[region] = Math.max(
        0,
        this.state.regionDamage[region] - ratePerGameHour * recoverableHours,
      );
    }
  }

  /** Applies impact shock, letting threshold pain use the same knockout state and recovery path. */
  private applyImpactShock(shockDamage: number, painKnockout: boolean): void {
    const previousShock = this.state.shock;
    this.state.shock = painKnockout ? 0 : Math.max(0, this.state.shock - shockDamage);
    if (this.state.shock === 0 && (previousShock > 0 || shockDamage > 0 || painKnockout)) {
      this.state.knockoutElapsed = 0;
    }
  }

  /** Applies one localized impact; unresolved hits are assigned to the torso by the caller. */
  impact(amount: number, region: BodyRegion, effects: BodyImpact = {}): number {
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error('Invalid body damage');
    }
    const shockPerDamage =
      effects.kind === undefined ? 0 : this.modified('body.shockPerDamage', this.tuning.shockPerDamage[effects.kind]);
    const shockDamage = effects.shockDamage ?? amount * shockPerDamage;
    if (!Number.isFinite(shockDamage) || shockDamage < 0) {
      throw new Error('Invalid shock damage');
    }
    if (
      effects.bleeding !== undefined &&
      !(
        Number.isInteger(effects.bleeding) &&
        effects.bleeding >= 0 &&
        effects.bleeding < this.tuning.bleeding.tiers.length
      )
    ) {
      throw new Error('Invalid bleeding tier');
    }
    const applied = this.damageHealth(amount);
    // A kindless impact hurts no more than it shocks.
    const painPerDamage =
      effects.kind === undefined ? 0 : this.modified('body.painPerDamage', this.tuning.pain.perDamage[effects.kind]);
    this.state.pain.acute += amount * painPerDamage * this.tuning.pain.regionWeight[region];
    this.state.regionDamage[region] = clamp(this.state.regionDamage[region] + amount);
    this.applyImpactShock(shockDamage, this.painKnocksOut());
    if (effects.bleeding !== undefined) {
      this.state.wounds[region] = bleedingWound(
        this.state.wounds[region],
        effects.bleeding,
        effects.infectionAtRisk ?? true,
      );
    }
    return applied;
  }

  /**
   * Advances body consequences by simulation seconds and returns a terminal cause, if any. `recovering` says
   * the needs let the body recover (needs.ts, `needsAllowRecovery`); then every uninfected wound also closes
   * by itself (`DESIGN.md`, "Bleeding"). `recoveryFactor` multiplies blood recovery (sleep's `sleepRecoveryFactor`).
   */
  advance(
    seconds: number,
    damageImmune = false,
    gameSeconds = seconds,
    { recovering = false, recoveryFactor = 1 }: BodyRecovery = {},
  ): string | undefined {
    if (
      !Number.isFinite(seconds) ||
      seconds < 0 ||
      !Number.isFinite(gameSeconds) ||
      gameSeconds < 0 ||
      !Number.isFinite(recoveryFactor) ||
      recoveryFactor < 0
    ) {
      throw new Error('Invalid body step');
    }
    let shockRecoverySeconds = seconds;
    if (this.unconscious) {
      const remaining = this.tuning.knockoutSimSeconds - this.state.knockoutElapsed;
      const unconsciousStep = Math.min(seconds, remaining);
      this.state.knockoutElapsed += unconsciousStep;
      shockRecoverySeconds -= unconsciousStep;
      if (this.state.knockoutElapsed >= this.tuning.knockoutSimSeconds) {
        this.state.knockoutElapsed = 0;
        this.state.shock = this.tuning.wakeShock;
      }
    }
    this.state.shock = clamp(this.state.shock + this.tuning.shockRecoveryPerSimSecond * shockRecoverySeconds);
    const { pain } = this.tuning;
    this.state.pain = {
      acute: fadeAcute(this.state.pain.acute, seconds, pain.acuteFadePerSimSecond, pain.acuteFadeSharePerSimSecond),
      doses: ageDoses(this.state.pain.doses, gameSeconds, this.analgesics),
    };
    let bleeding = false;
    let bloodLoss = 0;
    for (const region of BODY_REGIONS) {
      const wound = this.state.wounds[region];
      if (!wound) {
        continue;
      }
      const advanced = advanceInfection(wound, gameSeconds, this.tuning);
      const { infection } = advanced;
      const bled = this.bleed(
        advanced.bleeding,
        seconds,
        recovering && infection !== 'early' && infection !== 'advanced',
      );
      this.state.wounds[region] = { ...advanced, bleeding: bled.severity };
      bleeding ||= wound.bleeding > 0;
      bloodLoss += bled.loss;
      if (!damageImmune && infection === 'advanced') {
        this.state.health = Math.max(
          0,
          this.state.health - this.tuning.advancedInfectionHealthLossPerSimSecond * seconds,
        );
      }
    }
    if (!damageImmune) {
      this.advanceBlood(bleeding ? bloodLoss : undefined, seconds, recoveryFactor);
    }
    return this.terminalCause();
  }

  /**
   * Blood drains by what the wounds lost; only in a step where no wound bled does it recover, at
   * `recoveryFactor` times its rate.
   */
  private advanceBlood(bloodLoss: number | undefined, seconds: number, recoveryFactor: number): void {
    const change =
      bloodLoss === undefined
        ? this.modified('body.bloodRecoveryPerSimSecond', this.tuning.bloodRecoveryPerSimSecond) *
          recoveryFactor *
          seconds
        : -bloodLoss;
    this.state.blood = clamp(this.state.blood + change);
  }

  private terminalCause(): string | undefined {
    if (this.state.health <= 0) {
      return 'your injuries';
    }
    if (this.state.blood <= 0) {
      return 'blood loss';
    }
    return undefined;
  }

  /** Blood lost per Sim second at a severity: from the tier below's rate up to its own tier's across its band. */
  private lossRate(severity: number): number {
    const index = bleedingTierIndex(severity);
    if (index === undefined) {
      return 0;
    }
    const { tiers } = this.tuning.bleeding;
    const below = index > 0 ? tiers[index - 1]!.bloodLossPerSimSecond : 0;
    return this.modified(
      'bleeding.lossPerSimSecond',
      below + (tiers[index]!.bloodLossPerSimSecond - below) * (severity - index),
    );
  }

  /**
   * Bleeds one wound for a step. While `closing`, its severity also falls by itself, band by band at each
   * tier's closure rate, and the loss follows the falling rate.
   */
  private bleed(severity: number, seconds: number, closing: boolean): { severity: number; loss: number } {
    let left = seconds;
    let loss = 0;
    let current = severity;
    while (left > 0 && current > 0) {
      const index = bleedingTierIndex(current)!;
      const closure = closing
        ? this.modified('bleeding.closurePerSimSecond', 1 / this.tuning.bleeding.tiers[index]!.closeSimSeconds)
        : 0;
      const toFloor = closure > 0 ? (current - index) / closure : Number.POSITIVE_INFINITY;
      // Within rounding of the floor counts as reaching it, so a closed band leaves no sliver behind.
      const reachesFloor = toFloor <= left + BAND_EPSILON;
      const step = Math.min(left, toFloor);
      const end = reachesFloor ? index : current - closure * step;
      loss += ((this.lossRate(current) + this.lossRate(end)) / 2) * step;
      current = end;
      left -= step;
    }
    return { severity: current, loss };
  }

  /**
   * One roll is retained throughout an exposure. Increasing accumulated damage crosses random tier
   * thresholds without making the outcome depend on how many simulation steps delivered it.
   */
  bleedingTierForHit(damage: number, region: BodyRegion, kind: DamageKind, roll: number): number | undefined {
    const { tiers } = this.tuning.bleeding;
    let share = 0;
    for (let index = tiers.length - 1; index >= 0; index--) {
      const tier = tiers[index]!;
      if (damage < tier.minDamage) {
        continue;
      }
      share +=
        this.modified('bleeding.chance', tier.chancePerDamage[kind]) * damage * (tier.regionFactor?.[region] ?? 1);
      if (roll < share) {
        return index;
      }
    }
    return undefined;
  }

  canTreat(region: BodyRegion, treatment: TreatmentDef): boolean {
    const wound = this.state.wounds[region];
    return (
      wound !== null &&
      ((treatment.bleeding !== undefined && wound.bleeding > 0) ||
        (treatment.infection?.stages.some((stage) => stage === wound.infection) ?? false))
    );
  }

  /**
   * Applies one treatment, rolling its effect (`roll` gives numbers in [0, 1)). Under base content, the body's
   * `treatmentSpread` is centred on its neutral multiplier, so the item's bleeding strength is its average bandage
   * application; other content can change that relationship. Through modifiers and `treatmentSpread`, it closes
   * severity band by band, each band costing its tier's `treatmentEffort`; applications stack (`DESIGN.md`, "Bleeding").
   */
  treat(region: BodyRegion, treatment: TreatmentDef, roll: () => number): boolean {
    if (!this.canTreat(region, treatment)) {
      return false;
    }
    let wound = this.state.wounds[region]!;
    const { bleeding: strength, infection } = treatment;
    if (strength !== undefined && wound.bleeding > 0) {
      const { min, max } = this.tuning.treatmentSpread;
      const effort = this.modified('treatment.quality', strength) * (min + (max - min) * roll());
      wound = { ...wound, bleeding: dress(wound.bleeding, effort, this.tuning.bleeding.tiers) };
    }
    if (
      infection?.stages.some((stage) => stage === wound.infection) &&
      roll() < this.modified('treatment.infectionChance', infection.chance)
    ) {
      wound = { ...wound, infection: 'resolved' };
    }
    this.state.wounds[region] = wound;
    return true;
  }
}

const advanceInfection = (wound: BodyWound, gameSeconds: number, tuning: BodyTuningDef): BodyWound => {
  if (gameSeconds <= 0 || !wound.infectionAtRisk || wound.infection === 'resolved' || wound.infection === 'advanced') {
    return wound;
  }
  const infectionGameSeconds = wound.infectionGameSeconds + gameSeconds;
  const onset = tuning.infectionOnsetGameHours;
  let infection: BodyWound['infection'] = 'none';
  if (infectionGameSeconds >= onset) {
    infection = infectionGameSeconds >= onset + tuning.antisepticWindowGameHours ? 'advanced' : 'early';
  }
  return { ...wound, infection, infectionGameSeconds };
};

/** Opens a wound at the top of a tier's band, or makes an existing one bleed at least that badly. */
const bleedingWound = (wound: BodyWound | null, tier: number, infectionAtRisk: boolean): BodyWound =>
  wound
    ? { ...wound, bleeding: Math.max(wound.bleeding, tier + 1) }
    : { bleeding: tier + 1, infection: 'none', infectionGameSeconds: 0, infectionAtRisk };

/**
 * Spends treatment effort on a severity, worst band first, each band costing its tier's `treatmentEffort`;
 * effort left after closing a band carries into the next one down.
 */
const dress = (severity: number, effort: number, tiers: readonly BleedingTierDef[]): number => {
  let left = effort;
  let current = severity;
  while (left > 0 && current > 0) {
    const index = bleedingTierIndex(current)!;
    const cost = tiers[index]!.treatmentEffort;
    const bandCost = (current - index) * cost;
    if (left < bandCost - BAND_EPSILON) {
      return current - left / cost;
    }
    left -= bandCost;
    current = index;
  }
  return current;
};
