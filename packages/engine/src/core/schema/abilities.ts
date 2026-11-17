import { type InferOutput, literal, maxValue, minValue, pipe, strictObject, string } from 'valibot';
import { Count, Id, Name, Positive, PositiveSimSeconds } from './primitives.ts';

/**
 * A known ability's own level scale, not a skill's: its cap is content's, and cast rules read the level as a CEL
 * int, so it stays a safe integer.
 */
const AbilityLevelCap = pipe(Count, minValue(1, 'must be 1 or more'), maxValue(Number.MAX_SAFE_INTEGER));

/** An ability a start may make known; see `packages/deadvox/docs/magic-mod.md`, "6. Spells: abilities with an effect dispatch". */
export const AbilitySchema = strictObject({
  id: Id,
  name: Name,
  rule: Id,
  targeting: literal('aimed'),
  preparationSimSeconds: PositiveSimSeconds,
  /** `amount` is a checked CEL double over the cast context; see `packages/engine/src/core/abilities.ts`, `resolveAbilityCost`. */
  cost: strictObject({ pool: Id, amount: string() }),
  progression: strictObject({
    maximumLevel: AbilityLevelCap,
    practicePerCast: Positive,
    practicePerLevel: Positive,
  }),
});

export type AbilityDef = InferOutput<typeof AbilitySchema>;
