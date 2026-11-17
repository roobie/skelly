import { type EffectActor, modified, type SkillFeeds } from './modifiers.ts';

export interface MeleeCombatTuning {
  readonly blockChanceMinimum: number;
  readonly mitigationMinimum: number;
  readonly staminaPerAbsorbedPoint: number;
  /** The skills feeding each block effect from its skill-zero value. */
  readonly skills?:
    | {
        readonly blockChance?: SkillFeeds | undefined;
        readonly mitigation?: SkillFeeds | undefined;
        readonly staminaPerAbsorbedPoint?: SkillFeeds | undefined;
      }
    | undefined;
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

export const meleeCombatEffects = (skills: EffectActor, tuning: MeleeCombatTuning): MeleeCombatEffects => ({
  blockChance: modified('melee.blockChance', tuning.blockChanceMinimum, skills, { skills: tuning.skills?.blockChance }),
  mitigation: modified('melee.mitigation', tuning.mitigationMinimum, skills, { skills: tuning.skills?.mitigation }),
  staminaPerAbsorbedPoint: modified('melee.staminaPerAbsorbedPoint', tuning.staminaPerAbsorbedPoint, skills, {
    skills: tuning.skills?.staminaPerAbsorbedPoint,
  }),
});

/**
 * A winded guard absorbs nothing, so the winded check precedes the full-block roll.
 * What a block absorbs is capped by the stamina left to pay for it.
 */
export const meleeBlock = (
  {
    skills,
    damage,
    roll,
    stamina,
    windedBelow,
  }: {
    readonly skills: EffectActor;
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
  const effects = meleeCombatEffects(skills, tuning);
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
