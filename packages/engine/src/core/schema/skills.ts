import { check, maxValue, optional, pipe, record, strictObject } from 'valibot';
import { capabilityField } from './capability.ts';
import { FirearmsEffectsSchema, MeleeEffectsSchema } from './combat.ts';
import { Count, Fraction, Id, Name, NonNegative, NonNegativeSimRate, Positive, SkillLevel } from './primitives.ts';

const SkillCurveSchema = strictObject({
  saturationFloor: Fraction,
  saturationHalfLifeLevels: Positive,
});

export const SkillProgressionSchema = strictObject({
  id: Id,
  capability: capabilityField('skillProgression'),
  practicePerLevel: Positive,
});

export const SkillSchema = pipe(
  strictObject({
    id: Id,
    capability: capabilityField('skills'),
    name: Name,
    detail: optional(Name),
    curve: optional(SkillCurveSchema),
    steadiness: optional(
      strictObject({
        wobbleSkillTenVariance: pipe(Positive, maxValue(100)),
        steadyingMinimum: Fraction,
        steadyingSkillRange: Fraction,
        steadyingSkillHalfLifeLevels: Positive,
      }),
    ),
    training: optional(
      strictObject({
        craftingTierOffset: optional(Count),
        activities: optional(
          record(
            Id,
            pipe(
              strictObject({
                practice: optional(NonNegative),
                practicePerSimSecond: optional(NonNegativeSimRate),
                tier: optional(SkillLevel),
              }),
              check(
                (activity) => (activity.practice === undefined) !== (activity.practicePerSimSecond === undefined),
                'needs exactly one of "practice" or "practicePerSimSecond"',
              ),
            ),
          ),
        ),
      }),
    ),
    inventory: optional(
      strictObject({
        handlingFactorFloor: Fraction,
        handlingFactorHalfLifeLevels: Positive,
      }),
    ),
    combat: optional(
      strictObject({
        firearms: optional(FirearmsEffectsSchema),
        melee: optional(MeleeEffectsSchema),
      }),
    ),
  }),
  check(({ training, capability, combat, inventory, steadiness, curve }) => {
    const activity = (activityId: string, field: 'practice' | 'practicePerSimSecond') =>
      training?.activities?.[activityId]?.[field] !== undefined;
    const complete =
      (!['crafting', 'mechanics'].includes(capability ?? '') || training?.craftingTierOffset !== undefined) &&
      (capability !== 'longGunSteadiness' || steadiness !== undefined) &&
      (capability !== 'firearmsCombat' ||
        (combat?.firearms !== undefined &&
          curve !== undefined &&
          activity('readying', 'practicePerSimSecond') &&
          activity('handling', 'practice') &&
          activity('shot', 'practice') &&
          activity('hit', 'practice') &&
          activity('attachment', 'practice'))) &&
      (capability !== 'meleeCombat' ||
        (combat?.melee !== undefined && activity('block', 'practice') && activity('hit', 'practice'))) &&
      (capability !== 'inventoryManagement' || (inventory !== undefined && activity('handling', 'practice')));
    return (
      complete &&
      (!steadiness ||
        (curve !== undefined &&
          steadiness.steadyingMinimum + steadiness.steadyingSkillRange <= 1 &&
          activity('acquisition', 'practice') &&
          activity('ads', 'practicePerSimSecond') &&
          activity('shot', 'practice') &&
          activity('hit', 'practice')))
    );
  }, 'missing required skill tuning or effect range exceeds one'),
  check(
    ({ capability, training }) =>
      capability !== 'inventoryManagement' || training?.activities?.handling?.tier === undefined,
    'inventory-management handling activity must be untiered',
  ),
);
