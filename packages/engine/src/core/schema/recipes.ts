import {
  array,
  finite,
  integer,
  literal,
  maxValue,
  minValue,
  nonEmpty,
  nullable,
  number,
  optional,
  picklist,
  pipe,
  record,
  strictObject,
  union,
  boolean as vBoolean,
} from 'valibot';
import { SKILL_LEVEL_LEGENDARY, SKILL_LEVEL_MIN } from '../character.ts';
import { capabilitySelection } from './capability.ts';
import { ItemCountSchema, LiquidAmountSchema } from './items.ts';
import { Count, Id, Name, NonNegative, Positive, PositiveGameMinutes, SkillLevel } from './primitives.ts';

const RecipeInputSchema = union([ItemCountSchema, LiquidAmountSchema]);

export const RecipeCategorySchema = strictObject({
  id: Id,
  label: Name,
  parent: optional(Id),
  order: pipe(number(), finite()),
});

export const RecipeTagSchema = strictObject({
  id: Id,
  label: Name,
  searchTerms: array(Name),
});

export const RecipeSchema = strictObject({
  id: Id,
  category: Id,
  tags: array(Id),
  searchTerms: array(Name),
  result: ItemCountSchema,
  /** Omitted means an ordinary craft. Item repair uses the result type; world repair names its entity type or terrain block. */
  kind: optional(picklist(['craft', 'repair'])),
  /** `amount` is the repair at the lowest skill, so it must be more than 0 for every repair to restore something; perSkill adds
   * per skill level on top. Item repair is a fraction of condition and clamps at runtime; world repair (entity or block)
   * counts damage points, so perSkill may exceed 1 there. */
  repair: optional(
    strictObject({
      skill: capabilitySelection('skills'),
      amount: Positive,
      perSkill: NonNegative,
      entity: optional(Id),
      block: optional(Id),
    }),
  ),
  activation: optional(literal('sharpen')),
  /** Game minutes. */
  timeGameMinutes: PositiveGameMinutes,
  skillUnlock: optional(
    strictObject({
      skill: capabilitySelection('skills'),
      level: pipe(number(), integer(), minValue(SKILL_LEVEL_MIN), maxValue(SKILL_LEVEL_LEGENDARY)),
    }),
  ),
  skills: record(capabilitySelection('skills'), SkillLevel),
  qualities: record(Id, pipe(Count, minValue(1), maxValue(5))),
  components: array(pipe(array(RecipeInputSchema), nonEmpty('needs at least one alternative'))),
  consumeFitted: optional(vBoolean()),
  workstation: optional(nullable(Id)),
});
