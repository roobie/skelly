import { freezeSnapshot } from './snapshotData.ts';

export const BODY_REGIONS = ['head', 'torso', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'] as const;
export type BodyRegion = (typeof BODY_REGIONS)[number];
type InfectionStage = 'none' | 'early' | 'advanced' | 'resolved';
export type BodyTreatment = 'bandage' | 'rag' | 'antiseptic' | 'antibiotics';

interface BodyWound {
  bleeding: boolean;
  infection: InfectionStage;
}

export type BodyWounds = Record<BodyRegion, BodyWound | null>;
export type BodyRegionDamage = Record<BodyRegion, number>;

export interface BodyState {
  health: number;
  blood: number;
  shock: number;
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
}

const BODY_START: Readonly<BodyState> = Object.freeze({
  health: 100,
  blood: 100,
  shock: 100,
  regionDamage: Object.freeze({ head: 0, torso: 0, leftArm: 0, rightArm: 0, leftLeg: 0, rightLeg: 0 }),
  wounds: Object.freeze({ head: null, torso: null, leftArm: null, rightArm: null, leftLeg: null, rightLeg: null }),
});

const BLOOD_LOSS_PER_SECOND = 0.004;
const BLOOD_RECOVERY_PER_SECOND = 0.002;
const SHOCK_RECOVERY_PER_SECOND = 0.1;
const ADVANCED_INFECTION_HEALTH_LOSS_PER_SECOND = 0.0005;

const clamp = (value: number): number => Math.max(0, Math.min(100, value));
const validVitals = (value: number): boolean => Number.isFinite(value) && value >= 0 && value <= 100;
const validWound = (value: unknown): value is BodyWound | null =>
  value === null ||
  (typeof value === 'object' &&
    value !== null &&
    typeof (value as BodyWound).bleeding === 'boolean' &&
    ['none', 'early', 'advanced', 'resolved'].includes((value as BodyWound).infection));

export class Body {
  private readonly state: BodyState;

  constructor(state: BodyState = BODY_START as BodyState) {
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
    return this.state.shock <= 0;
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
      aimSway: 1 + regionDamage.torso / 100,
      swingSlowdown: 1 + Math.max(regionDamage.leftArm, regionDamage.rightArm) / 100,
      movementSpeed: Math.max(0.5, 1 - Math.max(regionDamage.leftLeg, regionDamage.rightLeg) / 200),
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
    if (!validVitals(state.health) || !validVitals(state.blood) || !validVitals(state.shock)) {
      throw new Error('Invalid body vitals');
    }
    for (const region of BODY_REGIONS) {
      if (!validVitals(state.regionDamage[region]) || !validWound(state.wounds[region])) {
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

  /** Applies one localized impact; unresolved hits are assigned to the torso by the caller. */
  impact(amount: number, region: BodyRegion, effects: BodyImpact = {}): number {
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error('Invalid body damage');
    }
    const shockDamage = effects.shockDamage ?? (effects.blunt ? amount * 2 : 0);
    if (!Number.isFinite(shockDamage) || shockDamage < 0) {
      throw new Error('Invalid shock damage');
    }
    const applied = this.damageHealth(amount);
    this.state.regionDamage[region] = clamp(this.state.regionDamage[region] + amount);
    this.state.shock = Math.max(0, this.state.shock - shockDamage);
    if (effects.bleeding) {
      const wound = this.state.wounds[region];
      this.state.wounds[region] = wound
        ? { ...wound, bleeding: true }
        : { bleeding: true, infection: 'none' };
    }
    return applied;
  }

  /** Advances body consequences by simulation seconds and returns a terminal cause, if any. */
  advance(seconds: number, damageImmune = false): string | undefined {
    if (!Number.isFinite(seconds) || seconds < 0) {
      throw new Error('Invalid body step');
    }
    this.state.shock = clamp(this.state.shock + SHOCK_RECOVERY_PER_SECOND * seconds);
    let bleedingRegions = 0;
    for (const region of BODY_REGIONS) {
      const wound = this.state.wounds[region];
      if (!wound) {
        continue;
      }
      const infection: InfectionStage =
        seconds > 0 && wound.infection === 'none'
          ? 'early'
          : seconds > 0 && wound.infection === 'early'
            ? 'advanced'
            : wound.infection;
      this.state.wounds[region] = { ...wound, infection };
      if (wound.bleeding) {
        bleedingRegions += 1;
      }
      if (!damageImmune && infection === 'advanced') {
        this.state.health = Math.max(0, this.state.health - ADVANCED_INFECTION_HEALTH_LOSS_PER_SECOND * seconds);
      }
    }
    if (!damageImmune) {
      const bloodChange =
        bleedingRegions > 0
          ? -BLOOD_LOSS_PER_SECOND * bleedingRegions * seconds
          : BLOOD_RECOVERY_PER_SECOND * seconds;
      this.state.blood = clamp(this.state.blood + bloodChange);
    }
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
    }
  }
}

export const bodyRegionForHitArea = (area: 'head' | 'torso' | 'legs'): BodyRegion =>
  area === 'head' ? 'head' : area === 'legs' ? 'leftLeg' : 'torso';
