import { SKILL_LEVEL_MAX } from './character.ts';

/** The range a resolved value cannot leave, whatever skills and modifiers do to it. */
const BOUNDS = {
  nonNegative: [0, Number.POSITIVE_INFINITY],
  positive: [Number.MIN_VALUE, Number.POSITIVE_INFINITY],
  fraction: [0, 1],
} as const;

interface EffectRule {
  readonly bound: keyof typeof BOUNDS;
  /** The way practice moves the value; only an effect with one takes skill curves. */
  readonly better?: 'lower' | 'higher';
}

/**
 * The mechanism inputs skills and modifiers can change: engine vocabulary, which content names. Each effect keeps
 * its true bound, so no content can lift it (`PILLARS.md`, "Content forward compatibility").
 */
const MODIFIED_EFFECTS = {
  'attack.damage': { bound: 'nonNegative' },
  /** Blood one bleeding wound loses per Sim second. */
  'bleeding.lossPerSimSecond': { bound: 'nonNegative' },
  /** Severity a bleeding wound closes by itself per Sim second. */
  'bleeding.closurePerSimSecond': { bound: 'nonNegative' },
  /** A bleeding tier's chance to open on a qualifying hit. */
  'bleeding.chance': { bound: 'fraction' },
  /** Total blood loss per Sim second at or above which bleeding refuses time compression. */
  'bleeding.blockCompressionAtLossPerSimSecond': { bound: 'nonNegative' },
  /** The strength one treatment application brings; a wound care skill would raise it. */
  'treatment.quality': { bound: 'nonNegative' },
  /** Shock damage per point of localized hit damage. */
  'body.shockPerDamage': { bound: 'nonNegative' },
  /** Acute pain per point of localized hit damage; a tolerance trait or an opioid would lower it. */
  'body.painPerDamage': { bound: 'nonNegative' },
  /** Felt pain at the knockout threshold, which every pain tier and effect is a share of. */
  'body.painKnockoutAt': { bound: 'positive' },
  /** Blood recovered per simulation second when no wound bleeds. */
  'body.bloodRecoveryPerSimSecond': { bound: 'nonNegative' },
  /** The chance that an infection treatment succeeds. */
  'treatment.infectionChance': { bound: 'fraction' },
  /** Time to move an item between inventory places. */
  'inventory.handlingSimSeconds': { bound: 'nonNegative', better: 'lower' },
  /** Time to force a locked door by one method. */
  'door.forcingSimSeconds': { bound: 'positive', better: 'lower' },
  /** Chance that a melee block absorbs the whole hit. */
  'melee.blockChance': { bound: 'fraction', better: 'higher' },
  /** Share of a hit a partial melee block absorbs. */
  'melee.mitigation': { bound: 'fraction', better: 'higher' },
  /** Stamina a melee block spends per point of damage it absorbs. */
  'melee.staminaPerAbsorbedPoint': { bound: 'nonNegative', better: 'lower' },
  /** Time to raise a firearm to the ready. */
  'firearm.raiseSimSeconds': { bound: 'positive', better: 'lower' },
  /** Walking speed share kept while a firearm is ready. */
  'firearm.readyMovementFactor': { bound: 'fraction', better: 'higher' },
  /**
   * Share of the gap from a firearm's skill-zero sway or recoil handling to expert handling still left; every gun
   * closes it alike, so all guns meet at expert handling.
   */
  'firearm.noviceHandlingShare': { bound: 'fraction', better: 'lower' },
  /** Factor on magazine and round handling times. */
  'firearm.reloadFactor': { bound: 'nonNegative', better: 'lower' },
  /** Factor on racking a firearm's action. */
  'firearm.rackFactor': { bound: 'nonNegative', better: 'lower' },
  /** Time to fit or remove one firearm attachment. */
  'firearm.attachmentSimSeconds': { bound: 'nonNegative', better: 'lower' },
  /** Share of aim drift a held breath removes before pain weakens it. */
  'aim.breathSteadying': { bound: 'fraction', better: 'higher' },
} as const satisfies Record<string, EffectRule>;
export type ModifiedEffect = keyof typeof MODIFIED_EFFECTS;
/** An effect skills can feed: one whose better direction the engine knows. */
export type SkillFedEffect = {
  [E in ModifiedEffect]: (typeof MODIFIED_EFFECTS)[E] extends { better: string } ? E : never;
}[ModifiedEffect];

export const SKILL_FED_EFFECTS = (Object.keys(MODIFIED_EFFECTS) as ModifiedEffect[]).filter(
  (effect): effect is SkillFedEffect => 'better' in MODIFIED_EFFECTS[effect],
);

export const effectDirection = (effect: SkillFedEffect): 'lower' | 'higher' => MODIFIED_EFFECTS[effect].better;

export const effectBounds = (effect: ModifiedEffect): readonly [number, number] =>
  BOUNDS[MODIFIED_EFFECTS[effect].bound];

/**
 * A content curve for one skill feeding an effect: the factor on the base runs from 1 at level zero to `expert` at
 * the top ordinary level, along a hyperbola whose unbounded limit it would be halfway to at `halfLifeLevels`, so
 * practice has diminishing returns and a ceiling.
 */
export interface SkillCurve {
  readonly expert: number;
  readonly halfLifeLevels: number;
}

/** The skills feeding an effect, each named by the mechanism role its provider claims, with its curve. */
export type SkillFeeds = Readonly<Partial<Record<string, SkillCurve>>>;

/** One change to an effect, from a trait, mutation, item or condition. */
export interface Modifier {
  readonly effect: ModifiedEffect;
  readonly multiply?: number;
  readonly add?: number;
}

/** Whatever carries modifiers. */
export interface ModifierActor {
  readonly modifiers: readonly Modifier[];
}

/** Whatever has skills: the effect level of the skill providing a role, zero when no skill provides it. */
export interface SkilledActor {
  readonly skillLevel: (role: string) => number;
}

/** Someone with no skill at all. */
export const UNSKILLED: SkilledActor = { skillLevel: () => 0 };

export type EffectActor = Partial<ModifierActor> & Partial<SkilledActor>;

/** Progress along a curve from level zero (0) to the top ordinary level (1). */
const curveProgress = (level: number, halfLifeLevels: number): number => {
  const capped = Math.min(Math.max(level, 0), SKILL_LEVEL_MAX);
  return (capped * (halfLifeLevels + SKILL_LEVEL_MAX)) / (SKILL_LEVEL_MAX * (halfLifeLevels + capped));
};

/** The factor a curve puts on its effect's base at a skill level. */
export const skillFactor = (curve: SkillCurve, level: number): number =>
  1 + (curve.expert - 1) * curveProgress(level, curve.halfLifeLevels);

/**
 * The one point where skills and modifiers change a number a mechanism reads from content, so a modifier or skill
 * added later reaches every mechanism that reads through it (`packages/deadvox/DESIGN.md`, "Bleeding"). The base is
 * scaled by each feeding skill's curve, then by the product of the modifiers' multipliers, then the adds join, and
 * the effect's bound holds the result. Attributes join between the base and the skills
 * (`packages/deadvox/docs/magic-mod.md`, "Skills and the resolver").
 */
export const modified = (effect: ModifiedEffect, base: number, actor: EffectActor, skills: SkillFeeds = {}): number => {
  let skilled = base;
  for (const [role, curve] of Object.entries(skills)) {
    if (curve !== undefined) {
      skilled *= skillFactor(curve, actor.skillLevel?.(role) ?? 0);
    }
  }
  let product = 1;
  let sum = 0;
  for (const modifier of actor.modifiers ?? []) {
    if (modifier.effect === effect) {
      product *= modifier.multiply ?? 1;
      sum += modifier.add ?? 0;
    }
  }
  const [min, max] = effectBounds(effect);
  return Math.min(max, Math.max(min, skilled * product + sum));
};
