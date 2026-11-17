import { SKILL_LEVEL_MAX } from './skillLevels.ts';

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
  'body.painKnockoutAt': { bound: 'positive', better: 'higher' },
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
  /** Impulse a melee strike delivers, which is also its strength against a door or a piece it bashes. */
  'melee.impulse': { bound: 'nonNegative', better: 'higher' },
  /** Practice one training award adds to its skill. */
  'practice.gain': { bound: 'nonNegative', better: 'higher' },
  /** Amount a granted resource pool holds when full. */
  'pool.maximum': { bound: 'nonNegative', better: 'higher' },
  /** Amount a resource pool moves toward its maximum per Game second. */
  'pool.recoveryPerGameSecond': { bound: 'nonNegative', better: 'higher' },
  /** Share of a furniture piece's weight the mover bears; only a whole share lifts it off the floor. */
  'furniture.liftShare': { bound: 'fraction', better: 'higher' },
} as const satisfies Record<string, EffectRule>;
export type ModifiedEffect = keyof typeof MODIFIED_EFFECTS;
/** An effect skills and attributes can feed: one whose better direction the engine knows. */
export type DirectedEffect = {
  [E in ModifiedEffect]: (typeof MODIFIED_EFFECTS)[E] extends { better: string } ? E : never;
}[ModifiedEffect];

export const DIRECTED_EFFECTS = (Object.keys(MODIFIED_EFFECTS) as ModifiedEffect[]).filter(
  (effect): effect is DirectedEffect => 'better' in MODIFIED_EFFECTS[effect],
);

export const MODIFIED_EFFECT_NAMES = Object.keys(MODIFIED_EFFECTS) as readonly ModifiedEffect[];

export const effectDirection = (effect: DirectedEffect): 'lower' | 'higher' => MODIFIED_EFFECTS[effect].better;

export const effectBounds = (effect: ModifiedEffect): readonly [number, number] =>
  BOUNDS[MODIFIED_EFFECTS[effect].bound];

/**
 * An ordinary adult's attribute value. The scale is a ratio, so every effect reads an attribute as its share of
 * this (`packages/deadvox/docs/magic-mod.md`, "Attribute scale").
 */
export const ATTRIBUTE_AVERAGE = 100;

/** The lowest attribute value an effect reads, so a time that scales as average over value stays finite. */
export const ATTRIBUTE_FLOOR = 1;

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

/**
 * A content curve over attribute / difficulty: the factor at each listed ratio, ratios rising, joined linearly and
 * held flat past either end. A steep curve is a hard gate.
 */
export type ContestCurve = readonly { readonly ratio: number; readonly factor: number }[];

/**
 * How one attribute scales an effect (`packages/deadvox/docs/magic-mod.md`, "Effect shapes"): a rate or capacity
 * by `(value / average) ^ exponent`, or a contest of the value against the difficulty of the thing acted on.
 */
export type AttributeFeed = { readonly exponent: number } | { readonly contest: ContestCurve };

/** The attributes feeding an effect, each named by its content id, with its shape. */
export type AttributeFeeds = Readonly<Partial<Record<string, AttributeFeed>>>;

/** What content feeds one effect at its site. */
export interface EffectFeeds {
  readonly attributes?: AttributeFeeds | undefined;
  readonly skills?: SkillFeeds | undefined;
  /** What a contest attribute is against, on the attribute's scale. */
  readonly difficulty?: number | undefined;
}

type ModifierTarget =
  | { readonly effect: ModifiedEffect; readonly attribute?: undefined }
  | { readonly attribute: string; readonly effect?: undefined };

/**
 * One change to an effect or an attribute, from a trait, item or condition, named by its source so a readout can
 * say where it came from and removing the source removes it.
 */
export type Modifier = ModifierTarget & {
  readonly source: string;
  readonly multiply?: number | undefined;
  readonly add?: number | undefined;
};

/** Whatever has skills: the effect level of the skill providing a role, zero when no skill provides it. */
export interface SkilledActor {
  readonly skillLevel: (role: string) => number;
}

/** Someone with no skill at all. */
export const UNSKILLED: SkilledActor = { skillLevel: () => 0 };

/** One source's share of a resolved value, in pipeline order. */
export interface EffectStep {
  readonly stage: 'attribute' | 'skill' | 'modifier';
  /** The attribute id, the skill role, or the modifier's source. */
  readonly source: string;
  readonly multiply: number;
  readonly add: number;
}

/** A resolved value with every source that moved it. */
export interface Resolution {
  readonly base: number;
  readonly value: number;
  readonly steps: readonly EffectStep[];
}

/** The latest resolution of each effect the actor read, for the debug readout. */
export type EffectTrace = Map<ModifiedEffect, Resolution>;

export interface EffectActor {
  readonly skillLevel?: ((role: string) => number) | undefined;
  /** Innate attribute values by content id; an attribute left out is average. */
  readonly attributes?: Readonly<Record<string, number>> | undefined;
  readonly modifiers?: readonly Modifier[] | undefined;
  readonly trace?: EffectTrace | undefined;
}

/** Progress along a curve from level zero (0) to the top ordinary level (1). */
const curveProgress = (level: number, halfLifeLevels: number): number => {
  const capped = Math.min(Math.max(level, 0), SKILL_LEVEL_MAX);
  return (capped * (halfLifeLevels + SKILL_LEVEL_MAX)) / (SKILL_LEVEL_MAX * (halfLifeLevels + capped));
};

/** The factor a curve puts on its effect's base at a skill level. */
export const skillFactor = (curve: SkillCurve, level: number): number =>
  1 + (curve.expert - 1) * curveProgress(level, curve.halfLifeLevels);

/** The factor a contest curve gives at a ratio of attribute to difficulty. */
export const contestFactor = (curve: ContestCurve, ratio: number): number => {
  const first = curve[0]!;
  if (ratio <= first.ratio) {
    return first.factor;
  }
  for (let index = 1; index < curve.length; index += 1) {
    const point = curve[index]!;
    if (ratio <= point.ratio) {
      const previous = curve[index - 1]!;
      return (
        previous.factor + ((point.factor - previous.factor) * (ratio - previous.ratio)) / (point.ratio - previous.ratio)
      );
    }
  }
  return curve.at(-1)!.factor;
};

/** Multiplies and adds every modifier on one target joins with, recording each source when asked. */
const applyModifiers = (
  value: number,
  modifiers: readonly Modifier[],
  targets: (modifier: Modifier) => boolean,
  steps: EffectStep[] | undefined,
): number => {
  let product = 1;
  let sum = 0;
  for (const modifier of modifiers) {
    if (targets(modifier)) {
      const multiply = modifier.multiply ?? 1;
      const add = modifier.add ?? 0;
      product *= multiply;
      sum += add;
      steps?.push({ stage: 'modifier', source: modifier.source, multiply, add });
    }
  }
  return value * product + sum;
};

const attributeValueInto = (actor: EffectActor, attribute: string, steps: EffectStep[] | undefined): number =>
  Math.max(
    ATTRIBUTE_FLOOR,
    applyModifiers(
      actor.attributes?.[attribute] ?? ATTRIBUTE_AVERAGE,
      actor.modifiers ?? [],
      (modifier) => modifier.attribute === attribute,
      steps,
    ),
  );

/** An attribute's effective value: the innate value with the modifiers on it, never below the floor. */
export const attributeValue = (actor: EffectActor, attribute: string): number =>
  attributeValueInto(actor, attribute, undefined);

/** An attribute's effective value with the modifier sources that moved it from the innate value. */
export const explainAttribute = (actor: EffectActor, attribute: string): Resolution => {
  const steps: EffectStep[] = [];
  const value = attributeValueInto(actor, attribute, steps);
  return { base: actor.attributes?.[attribute] ?? ATTRIBUTE_AVERAGE, value, steps };
};

const attributeFactor = (feed: AttributeFeed, value: number, difficulty: number | undefined): number => {
  if ('exponent' in feed) {
    return (value / ATTRIBUTE_AVERAGE) ** feed.exponent;
  }
  if (difficulty === undefined) {
    throw new Error('A contest feeds this effect, but the mechanism named no difficulty');
  }
  return contestFactor(feed.contest, difficulty > 0 ? value / difficulty : Number.POSITIVE_INFINITY);
};

/**
 * The one point where attributes, skills and modifiers change a number a mechanism reads from content, so a source
 * added later reaches every mechanism that reads through it (`packages/deadvox/docs/magic-mod.md`, "Skills and the
 * resolver"). The base is scaled by each feeding attribute's shape, then by each feeding skill's curve, then by the
 * product of the effect's modifiers' multipliers, then their adds join, and the effect's bound holds the result. A
 * contest reads the feeds' difficulty as what it is against.
 */
export const resolve = (
  effect: ModifiedEffect,
  base: number,
  actor: EffectActor,
  feeds: EffectFeeds = {},
): Resolution => {
  const steps: EffectStep[] = [];
  let scaled = base;
  for (const [attribute, feed] of Object.entries(feeds.attributes ?? {})) {
    if (feed !== undefined) {
      const factor = attributeFactor(feed, attributeValueInto(actor, attribute, undefined), feeds.difficulty);
      scaled *= factor;
      steps.push({ stage: 'attribute', source: attribute, multiply: factor, add: 0 });
    }
  }
  for (const [role, curve] of Object.entries(feeds.skills ?? {})) {
    if (curve !== undefined) {
      const factor = skillFactor(curve, actor.skillLevel?.(role) ?? 0);
      scaled *= factor;
      steps.push({ stage: 'skill', source: role, multiply: factor, add: 0 });
    }
  }
  const modified = applyModifiers(scaled, actor.modifiers ?? [], (modifier) => modifier.effect === effect, steps);
  const [min, max] = effectBounds(effect);
  const resolution = { base, value: Math.min(max, Math.max(min, modified)), steps };
  actor.trace?.set(effect, resolution);
  return resolution;
};

/** The resolved value alone; see `resolve`. */
export const modified = (effect: ModifiedEffect, base: number, actor: EffectActor, feeds?: EffectFeeds): number =>
  resolve(effect, base, actor, feeds).value;
