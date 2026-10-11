/** The mechanism inputs a modifier can change: engine vocabulary, which content modifiers name. */
const MODIFIED_EFFECTS = [
  /** Blood one bleeding wound loses per Sim second. */
  'bleeding.lossPerSimSecond',
  /** Severity a bleeding wound closes by itself per Sim second. */
  'bleeding.closurePerSimSecond',
  /** A bleeding tier's chance to open on a qualifying hit. */
  'bleeding.chance',
  /** Total blood loss per Sim second at or above which bleeding refuses time compression. */
  'bleeding.blockCompressionAtLossPerSimSecond',
  /** The strength one treatment application brings; a wound care skill would raise it. */
  'treatment.quality',
] as const;
export type ModifiedEffect = (typeof MODIFIED_EFFECTS)[number];

/** One change to an effect, from a skill, trait, mutation, item or condition. */
export interface Modifier {
  readonly effect: ModifiedEffect;
  readonly multiply?: number;
  readonly add?: number;
}

/** Whatever carries modifiers: the body for now. */
export interface ModifierActor {
  readonly modifiers: readonly Modifier[];
}

/**
 * The one point where modifiers change a number a mechanism reads from content, so a modifier added later
 * reaches every mechanism that reads through it (DESIGN.md, "Bleeding"): the product of the multipliers,
 * then the sum of the adds. It returns `base` unchanged when nothing applies, as for now, while no content
 * declares a modifier.
 */
export const modified = (effect: ModifiedEffect, base: number, actor: ModifierActor): number => {
  let product = 1;
  let sum = 0;
  for (const modifier of actor.modifiers) {
    if (modifier.effect === effect) {
      product *= modifier.multiply ?? 1;
      sum += modifier.add ?? 0;
    }
  }
  return base * product + sum;
};
