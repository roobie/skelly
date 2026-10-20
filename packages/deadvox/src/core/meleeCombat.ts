import { SKILL_LEVEL_MAX, skillEffectLevel, skillSaturation } from './character.ts';

export interface MeleeCombatTuning {
  readonly blockChanceMinimum: number;
  readonly blockChanceRange: number;
  readonly blockChanceHalfLifeLevels: number;
  readonly mitigationMinimum: number;
  readonly mitigationRange: number;
  readonly mitigationHalfLifeLevels: number;
  readonly staminaPerAbsorbedPoint: number;
  readonly staminaCostFloor: number;
  readonly staminaCostHalfLifeLevels: number;
  readonly joltPerAbsorbedPoint: number;
  readonly joltRealSeconds: number;
  /** How far the arms rise, in metres, on a block that absorbs enough to reach full jolt strength. */
  readonly deflectRiseMetres: number;
  /** Share of that rise any block that absorbs something shows, so an ordinary block still reads on screen. */
  readonly deflectRiseFloor: number;
  readonly deflectRealSeconds: number;
}

export interface MeleeCombatEffects {
  /** Chance that a block absorbs the whole hit. */
  readonly blockChance: number;
  /** Share of a hit a block absorbs when it is not a full block. */
  readonly mitigation: number;
  readonly staminaPerAbsorbedPoint: number;
}

export interface MeleeBlock {
  readonly absorbed: number;
  readonly staminaCost: number;
  readonly full: boolean;
}

const NO_BLOCK: MeleeBlock = { absorbed: 0, staminaCost: 0, full: false };

const rising = (effective: number, minimum: number, range: number, halfLife: number): number =>
  minimum + range * (effective / (effective + halfLife));

/** Blocking effectiveness improves monotonically and legendary uses ordinary-top effects. */
export const meleeCombatEffects = (level: number, tuning: MeleeCombatTuning): MeleeCombatEffects => {
  if (!Number.isFinite(level) || level < 0) {
    throw new Error('Invalid melee combat skill level');
  }
  const effective = skillEffectLevel(Math.min(level, SKILL_LEVEL_MAX));
  return {
    blockChance: rising(
      effective,
      tuning.blockChanceMinimum,
      tuning.blockChanceRange,
      tuning.blockChanceHalfLifeLevels,
    ),
    mitigation: rising(effective, tuning.mitigationMinimum, tuning.mitigationRange, tuning.mitigationHalfLifeLevels),
    staminaPerAbsorbedPoint:
      tuning.staminaPerAbsorbedPoint *
      skillSaturation(effective, tuning.staminaCostFloor, tuning.staminaCostHalfLifeLevels),
  };
};

/**
 * A winded guard absorbs nothing, so the winded check precedes the full-block roll.
 * What a block absorbs is capped by the stamina left to pay for it.
 */
export const meleeBlock = (
  {
    level,
    damage,
    roll,
    stamina,
    windedBelow,
  }: {
    readonly level: number;
    readonly damage: number;
    readonly roll: number;
    readonly stamina: number;
    readonly windedBelow: number;
  },
  tuning: MeleeCombatTuning,
): MeleeBlock => {
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) {
    throw new Error('Invalid block roll');
  }
  if (damage <= 0 || stamina < windedBelow) {
    return NO_BLOCK;
  }
  const effects = meleeCombatEffects(level, tuning);
  const full = roll < effects.blockChance;
  const wanted = full ? damage : damage * effects.mitigation;
  const absorbed = Math.min(wanted, stamina / effects.staminaPerAbsorbedPoint);
  return { absorbed, staminaCost: absorbed * effects.staminaPerAbsorbedPoint, full: full && absorbed >= damage };
};

export interface BlockJolt {
  /** From 0 to 1. */
  readonly strength: number;
  readonly realSeconds: number;
  /** Metres the arms rise to deflect the blow; scales with the same strength. */
  readonly rise: number;
  readonly riseRealSeconds: number;
}

/** The held weapon's jolt and arm rise on a block; zero strength or duration shows none. */
export const blockJolt = (absorbed: number, tuning: MeleeCombatTuning): BlockJolt => {
  const strength = Math.min(1, Math.max(0, absorbed * tuning.joltPerAbsorbedPoint));
  return {
    strength,
    realSeconds: tuning.joltRealSeconds,
    rise:
      strength > 0
        ? tuning.deflectRiseMetres * (tuning.deflectRiseFloor + (1 - tuning.deflectRiseFloor) * strength)
        : 0,
    riseRealSeconds: tuning.deflectRealSeconds,
  };
};
