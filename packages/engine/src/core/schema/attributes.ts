import { array, check, finite, minLength, number, optional, pipe, record, strictObject, union } from 'valibot';
import { type DirectedEffect, effectDirection } from '../modifiers.ts';
import { Id, Name, NonNegative, Positive } from './primitives.ts';

/** One attribute of the shared vocabulary (`packages/deadvox/docs/magic-mod.md`, "Attribute vocabulary"). */
export const AttributeSchema = strictObject({ id: Id, name: Name, detail: optional(Name) });

/** Innate attribute values by attribute id, on the ratio scale. */
export const AttributeValues = optional(record(Id, Positive));

const Exponent = pipe(number(), finite('must be finite'));

const ContestCurveSchema = pipe(
  array(strictObject({ ratio: Positive, factor: NonNegative })),
  minLength(2, 'a contest curve needs at least two points'),
  check(
    (points) => points.every((point, index) => index === 0 || point.ratio > points[index - 1]!.ratio),
    'contest ratios must rise',
  ),
);

const rises = (values: readonly number[], better: 'lower' | 'higher'): boolean =>
  values.every((value, index) => {
    const previous = values[index - 1];
    return previous === undefined || (better === 'higher' ? value >= previous : value <= previous);
  });

/**
 * The attributes feeding one effect, by attribute id, each with its shape (`packages/engine/src/core/modifiers.ts`,
 * `AttributeFeed`). A shape that turned a higher attribute against the effect is a content error, so a stronger or
 * defter character is never worse at what the attribute feeds.
 */
export const attributeFeeds = (effect: DirectedEffect) => {
  const better = effectDirection(effect);
  return optional(
    record(
      Id,
      union([
        pipe(
          strictObject({ exponent: Exponent }),
          check(
            ({ exponent }) => (better === 'higher' ? exponent >= 0 : exponent <= 0),
            `an attribute exponent must not make "${effect}" worse as the attribute rises`,
          ),
        ),
        pipe(
          strictObject({ contest: ContestCurveSchema }),
          check(
            ({ contest }) =>
              rises(
                contest.map(({ factor }) => factor),
                better,
              ),
            `a contest curve must not make "${effect}" worse as the attribute rises`,
          ),
        ),
      ]),
    ),
  );
};
