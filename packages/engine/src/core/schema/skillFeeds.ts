import { check, optional, pipe, record, strictObject } from 'valibot';
import { effectDirection, type SkillFedEffect } from '../modifiers.ts';
import { capabilitySelection } from './capability.ts';
import { NonNegative, Positive } from './primitives.ts';

/**
 * The skills feeding one effect, by role, each with its curve (`packages/engine/src/core/modifiers.ts`,
 * `SkillCurve`). A curve that turned practice against the effect is a content error, so more skill never slows an
 * action or worsens an outcome. A role with no provider feeds nothing.
 */
export const skillFeeds = (effect: SkillFedEffect) =>
  optional(
    record(
      capabilitySelection('skills'),
      pipe(
        strictObject({ expert: NonNegative, halfLifeLevels: Positive }),
        check(
          ({ expert }) => (effectDirection(effect) === 'lower' ? expert <= 1 : expert >= 1),
          `a skill curve must not make "${effect}" worse with practice`,
        ),
      ),
    ),
  );
