import { SECONDS_PER_HOUR } from './clock.ts';
import type { BodyTuningDef } from './schema.ts';
import { freezeSnapshot } from './snapshotData.ts';

export const BODY_REGIONS = ['head', 'torso', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'] as const;
export type BodyRegion = (typeof BODY_REGIONS)[number];
const BODY_REGION_WORD_BOUNDARY = /([A-Z])/g;
const BODY_REGION_INITIAL = /^[a-z]/;
export const bodyRegionLabel = (region: BodyRegion): string =>
  region.replace(BODY_REGION_WORD_BOUNDARY, ' $1').replace(BODY_REGION_INITIAL, (first) => first.toUpperCase());
type InfectionStage = 'none' | 'early' | 'advanced' | 'resolved';
export const BODY_TREATMENTS = ['bandage', 'rag', 'antiseptic', 'antibiotics'] as const;
export type BodyTreatment = (typeof BODY_TREATMENTS)[number];
/** Mildest first (DESIGN.md, "Bleeding"). */
export const BLEEDING_TIERS = ['scratch', 'moderate', 'heavy', 'arterial'] as const;
export type BleedingTier = (typeof BLEEDING_TIERS)[number];
const tierRank = (tier: BleedingTier): number => BLEEDING_TIERS.indexOf(tier);
const worse = (a: BleedingTier, b: BleedingTier): BleedingTier => (tierRank(a) >= tierRank(b) ? a : b);

interface BodyWound {
  /** Null once the wound has stopped bleeding. */
  bleeding: BleedingTier | null;
  /** Sim seconds the wound has bled at its tier; a scratch stops by itself after its tuned time. */
  bleedingSimSeconds: number;
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
  bleeding?: BleedingTier;
  blunt?: boolean;
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
const validWound = (value: unknown): value is BodyWound | null =>
  value === null ||
  (typeof value === 'object' &&
    value !== null &&
    ((value as BodyWound).bleeding === null || BLEEDING_TIERS.includes((value as BodyWound).bleeding!)) &&
    Number.isFinite((value as BodyWound).bleedingSimSeconds) &&
    (value as BodyWound).bleedingSimSeconds >= 0 &&
    ['none', 'early', 'advanced', 'resolved'].includes((value as BodyWound).infection) &&
    Number.isFinite((value as BodyWound).infectionGameSeconds) &&
    (value as BodyWound).infectionGameSeconds >= 0 &&
    typeof (value as BodyWound).infectionAtRisk === 'boolean');

export class Body {
  private readonly state: BodyState;
  readonly tuning: BodyTuningDef;

  constructor(tuning: BodyTuningDef, state: BodyState = BODY_START as BodyState) {
    this.tuning = tuning;
    this.state = structuredClone(state);
    this.validate();
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

  /** An open artery refuses time compression, so it runs its course in real time (DESIGN.md, "Bleeding"). */
  get compressionRefusal(): string | undefined {
    return this.worstBleeding === 'arterial' ? "You're bleeding out" : undefined;
  }

  /** The worst tier any wound bleeds at, or null when none bleeds. */
  get worstBleeding(): BleedingTier | null {
    return worstBleeding(this.state.wounds);
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
      if (!(validVitals(state.regionDamage[region]) && validWound(state.wounds[region]))) {
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
      if (wound?.bleeding || wound?.infection === 'early' || wound?.infection === 'advanced') {
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
    const shockDamage = effects.shockDamage ?? (effects.blunt ? amount * this.tuning.bluntShockPerDamage : 0);
    if (!Number.isFinite(shockDamage) || shockDamage < 0) {
      throw new Error('Invalid shock damage');
    }
    const applied = this.damageHealth(amount);
    this.state.regionDamage[region] = clamp(this.state.regionDamage[region] + amount);
    const previousShock = this.state.shock;
    this.state.shock = Math.max(0, this.state.shock - shockDamage);
    if (this.state.shock === 0 && (previousShock > 0 || shockDamage > 0)) {
      this.state.knockoutElapsed = 0;
    }
    if (effects.bleeding) {
      this.state.wounds[region] = bleedingWound(
        this.state.wounds[region],
        effects.bleeding,
        effects.infectionAtRisk ?? true,
      );
    }
    return applied;
  }

  /** Advances body consequences by simulation seconds and returns a terminal cause, if any. */
  advance(seconds: number, damageImmune = false, gameSeconds = seconds): string | undefined {
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
      const bled = advanceBleeding(advanceInfection(wound, gameSeconds, this.tuning), seconds, this.tuning);
      const { infection } = bled.wound;
      this.state.wounds[region] = bled.wound;
      bleeding ||= wound.bleeding !== null;
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
        this.state.blood + (bleeding ? -bloodLoss : this.tuning.bloodRecoveryPerSimSecond * seconds),
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

  canTreat(region: BodyRegion, treatment: BodyTreatment): boolean {
    const wound = this.state.wounds[region];
    if (!wound) {
      return false;
    }
    switch (treatment) {
      case 'bandage':
      case 'rag': {
        const { stops, eases } = this.tuning.bleedingTreatments[treatment];
        return wound.bleeding !== null && tierRank(wound.bleeding) <= tierRank(eases ?? stops);
      }
      case 'antiseptic':
        return wound.infection === 'early';
      case 'antibiotics':
        return wound.infection === 'advanced';
      default:
        return false;
    }
  }

  treat(region: BodyRegion, treatment: BodyTreatment): boolean {
    if (!this.canTreat(region, treatment)) {
      return false;
    }
    const wound = this.state.wounds[region]!;
    switch (treatment) {
      case 'bandage':
      case 'rag': {
        // A wound past what the treatment stops is eased down to that tier and bleeds on.
        const { stops } = this.tuning.bleedingTreatments[treatment];
        const bleeding = tierRank(wound.bleeding!) <= tierRank(stops) ? null : stops;
        this.state.wounds[region] = { ...wound, bleeding, bleedingSimSeconds: 0 };
        return true;
      }
      case 'antiseptic':
      case 'antibiotics':
        this.state.wounds[region] = { ...wound, infection: 'resolved' };
        return true;
      default:
        return false;
    }
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

/**
 * Opens a wound, or makes an existing one bleed at the worse of its tier and the hit's. A fresh hit restarts
 * the bleeding clock, so a new scratch runs its full time.
 */
const bleedingWound = (wound: BodyWound | null, tier: BleedingTier, infectionAtRisk: boolean): BodyWound =>
  wound
    ? { ...wound, bleeding: wound.bleeding ? worse(wound.bleeding, tier) : tier, bleedingSimSeconds: 0 }
    : { bleeding: tier, bleedingSimSeconds: 0, infection: 'none', infectionGameSeconds: 0, infectionAtRisk };

/** Bleeds one wound for a step at its tier's rate; a scratch stops partway once it has bled its tuned time. */
const advanceBleeding = (
  wound: BodyWound,
  seconds: number,
  tuning: BodyTuningDef,
): { wound: BodyWound; loss: number } => {
  if (wound.bleeding === null) {
    return { wound, loss: 0 };
  }
  const stopAfter = wound.bleeding === 'scratch' ? tuning.bleeding.scratch.stopSimSeconds : Number.POSITIVE_INFINITY;
  const bledSeconds = Math.min(seconds, Math.max(0, stopAfter - wound.bleedingSimSeconds));
  const bleedingSimSeconds = wound.bleedingSimSeconds + bledSeconds;
  return {
    wound:
      bleedingSimSeconds >= stopAfter
        ? { ...wound, bleeding: null, bleedingSimSeconds: 0 }
        : { ...wound, bleedingSimSeconds },
    loss: tuning.bleeding[wound.bleeding].bloodLossPerSimSecond * bledSeconds,
  };
};

const worstBleeding = (wounds: Readonly<BodyWounds>): BleedingTier | null =>
  BODY_REGIONS.reduce<BleedingTier | null>((worst, region) => {
    const tier = wounds[region]?.bleeding ?? null;
    return tier && (!worst || tierRank(tier) > tierRank(worst)) ? tier : worst;
  }, null);

/**
 * The tier a bleeding hit opens: the worst tier whose damage threshold it meets, whose region rule
 * allows it and whose chance comes up, checked worst first; otherwise a scratch.
 */
export const bleedingTierForHit = (
  tuning: BodyTuningDef,
  damage: number,
  region: BodyRegion,
  roll: () => number,
): BleedingTier => {
  for (const tier of ['arterial', 'heavy', 'moderate'] as const) {
    const rule = tuning.bleeding[tier];
    if (damage < rule.minDamage || (tier === 'arterial' && !tuning.bleeding.arterial.regions.includes(region))) {
      continue;
    }
    if (roll() < rule.chance) {
      return tier;
    }
  }
  return 'scratch';
};

export function bodyRegionForHitArea(area: 'head' | 'torso' | 'leftLeg' | 'rightLeg'): BodyRegion;
export function bodyRegionForHitArea(area: 'legs', legSide: 'leftLeg' | 'rightLeg'): BodyRegion;
export function bodyRegionForHitArea(
  area: 'head' | 'torso' | 'legs' | 'leftLeg' | 'rightLeg',
  legSide?: 'leftLeg' | 'rightLeg',
): BodyRegion {
  if (area === 'legs') {
    if (!legSide) {
      throw new Error('A leg hit requires a selected side');
    }
    return legSide;
  }
  return area;
}
