import { type InferOutput, literal, maxValue, minValue, pipe, strictObject, string } from 'valibot';
import {
  Color,
  Count,
  Id,
  Name,
  NonNegative,
  Positive,
  PositiveRealSeconds,
  PositiveSimSeconds,
} from './primitives.ts';

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
  /** How the shots it fires are drawn, so a pack restyles a spell without a renderer that knows it. */
  projectile: strictObject({
    /** The bright centre, drawn unlit. */
    core: strictObject({ color: Color, radiusMetres: Positive }),
    /** The glow added round the core. */
    halo: strictObject({ color: Color, radiusMetres: Positive }),
    /** The presentation point light a shot and its impact lend their surroundings while among the nearest glows. */
    light: strictObject({ color: Color, intensity: Positive, radiusMetres: Positive }),
    /** Sparks left along the path, one per `spacingMetres` of travel, drifting apart as they fade. */
    trail: strictObject({
      color: Color,
      spacingMetres: Positive,
      sizeMetres: Positive,
      lifeRealSeconds: PositiveRealSeconds,
      driftMetresPerRealSecond: NonNegative,
    }),
    /** The flash where a shot ends, swelling to `radiusMetres` as it and its light fade. */
    impact: strictObject({ color: Color, radiusMetres: Positive, lifeRealSeconds: PositiveRealSeconds }),
  }),
  progression: strictObject({
    maximumLevel: AbilityLevelCap,
    practicePerCast: Positive,
    practicePerLevel: Positive,
  }),
});

export type AbilityDef = InferOutput<typeof AbilitySchema>;
