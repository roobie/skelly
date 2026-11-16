import { check, optional, pipe, record, strictObject } from 'valibot';
import { attributeFeeds } from './attributes.ts';
import { capabilityField } from './capability.ts';
import { Count, Id, Name, NonNegative, NonNegativeSimRate, Positive, SkillLevel } from './primitives.ts';

export const SkillProgressionSchema = strictObject({
  id: Id,
  capability: capabilityField('skillProgression'),
  practicePerLevel: Positive,
  /** Attributes that scale every practice award. */
  attributes: optional(strictObject({ practice: attributeFeeds('practice.gain') })),
});

export const SkillSchema = pipe(
  strictObject({
    id: Id,
    capability: capabilityField('skills'),
    name: Name,
    detail: optional(Name),
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
  }),
  check(({ training, capability }) => {
    const activity = (activityId: string, field: 'practice' | 'practicePerSimSecond') =>
      training?.activities?.[activityId]?.[field] !== undefined;
    return (
      (!['crafting', 'mechanics'].includes(capability ?? '') || training?.craftingTierOffset !== undefined) &&
      (capability !== 'firearmsCombat' ||
        (activity('readying', 'practicePerSimSecond') &&
          activity('handling', 'practice') &&
          activity('shot', 'practice') &&
          activity('hit', 'practice') &&
          activity('attachment', 'practice'))) &&
      (capability !== 'longGunSteadiness' ||
        (activity('acquisition', 'practice') &&
          activity('ads', 'practicePerSimSecond') &&
          activity('shot', 'practice') &&
          activity('hit', 'practice'))) &&
      (capability !== 'meleeCombat' || (activity('block', 'practice') && activity('hit', 'practice'))) &&
      (capability !== 'inventoryManagement' || activity('handling', 'practice'))
    );
  }, 'missing a training activity its mechanism practises'),
  check(
    ({ capability, training }) =>
      capability !== 'inventoryManagement' || training?.activities?.handling?.tier === undefined,
    'inventory-management handling activity must be untiered',
  ),
);
