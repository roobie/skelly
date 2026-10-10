import { SECONDS_PER_HOUR } from './clock.ts';
import type { BodyTuningDef } from './schema.ts';
import { freezeSnapshot } from './snapshotData.ts';

export const BODY_REGIONS = ['head', 'torso', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'] as const;
export type BodyRegion = (typeof BODY_REGIONS)[number];
type InfectionStage = 'none' | 'early' | 'advanced' | 'resolved';
export const BODY_TREATMENTS = ['bandage', 'rag', 'antiseptic', 'antibiotics'] as const;
export type BodyTreatment = (typeof BODY_TREATMENTS)[number];

interface BodyWound {
  bleeding: boolean;
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
  bleeding?: boolean;
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
    typeof (value as BodyWound).bleeding === 'boolean' &&
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
      const wound = this.state.wounds[region];
      this.state.wounds[region] = wound
        ? { ...wound, bleeding: true }
        : {
            bleeding: true,
            infection: 'none',
            infectionGameSeconds: 0,
            infectionAtRisk: effects.infectionAtRisk ?? true,
          };
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
    let bleedingRegions = 0;
    for (const region of BODY_REGIONS) {
      const wound = this.state.wounds[region];
      if (!wound) {
        continue;
      }
      const updatedWound = advanceInfection(wound, gameSeconds, this.tuning);
      const { infection } = updatedWound;
      this.state.wounds[region] = updatedWound;
      if (wound.bleeding) {
        bleedingRegions += 1;
      }
      if (!damageImmune && infection === 'advanced') {
        this.state.health = Math.max(
          0,
          this.state.health - this.tuning.advancedInfectionHealthLossPerSimSecond * seconds,
        );
      }
    }
    if (!damageImmune) {
      this.state.blood = advanceBlood(this.state.blood, bleedingRegions, seconds, this.tuning);
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
      case 'rag':
        return wound.bleeding;
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
      case 'rag':
        this.state.wounds[region] = { ...wound, bleeding: false };
        return true;
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

const advanceBlood = (blood: number, bleedingRegions: number, seconds: number, tuning: BodyTuningDef): number => {
  const change =
    bleedingRegions > 0
      ? -tuning.bloodLossPerSimSecond * bleedingRegions * seconds
      : tuning.bloodRecoveryPerSimSecond * seconds;
  return clamp(blood + change);
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
