import { SECONDS_PER_HOUR } from './clock.ts';
import { type ModifiedEffect, type Modifier, type ModifierActor, modified } from './modifiers.ts';
import type { BodyTuningDef, TreatmentDef } from './schema.ts';
import { freezeSnapshot } from './snapshotData.ts';

export const BODY_REGIONS = ['head', 'torso', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'] as const;
export type BodyRegion = (typeof BODY_REGIONS)[number];
const BODY_REGION_WORD_BOUNDARY = /([A-Z])/g;
const BODY_REGION_INITIAL = /^[a-z]/;
export const bodyRegionLabel = (region: BodyRegion): string =>
  region.replace(BODY_REGION_WORD_BOUNDARY, ' $1').replace(BODY_REGION_INITIAL, (first) => first.toUpperCase());
/** What a hit does to flesh; weapons, enemy attacks, bleeding and shock all read it. */
export const DAMAGE_KINDS = ['blunt', 'cut', 'pierce'] as const;
export type DamageKind = (typeof DAMAGE_KINDS)[number];
const INFECTION_STAGES = ['none', 'early', 'advanced', 'resolved'] as const;
type InfectionStage = (typeof INFECTION_STAGES)[number];
type BleedingTierDef = BodyTuningDef['bleeding']['tiers'][number];
const BAND_EPSILON = 1e-9;

interface BodyWound {
  /**
   * Bleeding severity: 0 has stopped, and the content tier at index i covers (i, i + 1] (DESIGN.md,
   * "Bleeding").
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

const BODY_START: Readonly<BodyState> = Object.freeze({
  health: 100,
  blood: 100,
  shock: 100,
  knockoutElapsed: 0,
  regionDamage: Object.freeze({ head: 0, torso: 0, leftArm: 0, rightArm: 0, leftLeg: 0, rightLeg: 0 }),
  wounds: Object.freeze({ head: null, torso: null, leftArm: null, rightArm: null, leftLeg: null, rightLeg: null }),
});

const clamp = (value: number): number => Math.max(0, Math.min(100, value));
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

  constructor(tuning: BodyTuningDef, state: BodyState = BODY_START as BodyState, modifiers: readonly Modifier[] = []) {
    this.tuning = tuning;
    this.modifiers = modifiers;
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

  /** Bleeding at or above content's loss rate refuses time compression (DESIGN.md, "Bleeding"). */
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
    this.state.regionDamage[region] = clamp(this.state.regionDamage[region] + amount);
    const previousShock = this.state.shock;
    this.state.shock = Math.max(0, this.state.shock - shockDamage);
    if (this.state.shock === 0 && (previousShock > 0 || shockDamage > 0)) {
      this.state.knockoutElapsed = 0;
    }
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
   * by itself (DESIGN.md, "Bleeding").
   */
  advance(seconds: number, damageImmune = false, gameSeconds = seconds, recovering = false): string | undefined {
    if (!Number.isFinite(seconds) || seconds < 0 || !Number.isFinite(gameSeconds) || gameSeconds < 0) {
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
      // Blood recovers only in a step where no wound bled.
      this.state.blood = clamp(
        this.state.blood +
          (bleeding
            ? -bloodLoss
            : this.modified('body.bloodRecoveryPerSimSecond', this.tuning.bloodRecoveryPerSimSecond) * seconds),
      );
    }
    return this.terminalCause();
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
   * The index of the tier a hit opens, or undefined when it doesn't bleed. One roll in [0, 1): each tier the
   * hit qualifies for (damage at least its `minDamage`, region among its `regions`) takes its chance for the
   * hit's kind as its share of the roll, so content sets how likely each tier is and no kind is ruled out.
   */
  bleedingTierForHit(damage: number, region: BodyRegion, kind: DamageKind, roll: number): number | undefined {
    const { tiers } = this.tuning.bleeding;
    let share = 0;
    for (let index = tiers.length - 1; index >= 0; index--) {
      const tier = tiers[index]!;
      if (damage < tier.minDamage || (tier.regions !== undefined && !tier.regions.includes(region))) {
        continue;
      }
      share += this.modified('bleeding.chance', tier.chance[kind]);
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
   * severity band by band, each band costing its tier's `treatmentEffort`; applications stack (DESIGN.md, "Bleeding").
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
