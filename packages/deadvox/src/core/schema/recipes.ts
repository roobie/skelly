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
import { ItemCountSchema, LiquidAmountSchema } from './items.ts';
import { Count, Fraction, Id, Name, Positive, PositiveGameMinutes, SkillLevel } from './primitives.ts';

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
  /** Omitted means an ordinary craft. Item repair uses the result type; world repair names its entity type. */
  kind: optional(picklist(['craft', 'repair'])),
  /** `amount` is the repair at the lowest skill, so it must be more than 0 for every repair to restore something. */
  repair: optional(strictObject({ skill: Id, amount: Positive, perSkill: Fraction, entity: optional(Id) })),
  activation: optional(literal('sharpen')),
  /** Game minutes. */
  timeGameMinutes: PositiveGameMinutes,
  skillUnlock: optional(
    strictObject({
      skill: Id,
      level: pipe(number(), integer(), minValue(SKILL_LEVEL_MIN), maxValue(SKILL_LEVEL_LEGENDARY)),
    }),
  ),
  skills: record(Id, SkillLevel),
  qualities: record(Id, pipe(Count, minValue(1), maxValue(5))),
  components: array(pipe(array(RecipeInputSchema), nonEmpty('needs at least one alternative'))),
  consumeFitted: optional(vBoolean()),
  workstation: optional(nullable(Id)),
});
