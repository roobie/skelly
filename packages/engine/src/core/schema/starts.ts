import {
  array,
  boolean,
  type InferOutput,
  integer,
  literal,
  maxLength,
  maxValue,
  minLength,
  minValue,
  nullable,
  number,
  optional,
  picklist,
  pipe,
  record,
  strictObject,
  tuple,
  union,
} from 'valibot';
import { BODY_REGIONS } from '../body.ts';
import { SKILL_LEVEL_LEGENDARY, SKILL_LEVEL_MAX, SKILL_LEVEL_MIN } from '../character.ts';
import { FixedLootOverride, StartDescentSchema } from './layouts.ts';
import { Count, Fraction, GameTimeOfDay, Id, Name } from './primitives.ts';
import { CellPosition } from './templates.ts';

const KitDestinationSchema = union([
  strictObject({ kind: literal('worn') }),
  strictObject({ kind: literal('hand'), role: picklist(['dominant', 'off']) }),
  strictObject({ kind: literal('pocket'), parent: Id, pocket: Count }),
  strictObject({ kind: literal('slot'), parent: Id, slot: Id }),
]);

export const StartSchema = strictObject({
  id: Id,
  site: Name,
  defaultForSite: optional(literal(true)),
  debugOnly: optional(literal(true)),
  seed: optional(pipe(number(), integer())),
  storeys: optional(pipe(Count, minValue(1))),
  density: optional(nullable(Fraction)),
  startTimeGameTimeOfDay: optional(GameTimeOfDay),
  placement: optional(
    strictObject({
      template: Id,
      cell: tuple([pipe(number(), integer()), pipe(number(), integer())]),
      spawn: CellPosition,
      minimumOpenDescents: optional(pipe(Count, minValue(1), maxValue(32)), 2),
      descents: pipe(array(StartDescentSchema), minLength(1), maxLength(32)),
      /** Core stock the instance promises in the start building, at template-local furniture anchors. */
      fixedLoot: optional(array(FixedLootOverride)),
    }),
  ),
  kit: array(
    strictObject({
      id: Id,
      item: Id,
      count: optional(pipe(Count, minValue(1))),
      condition: optional(Fraction),
      cartridges: optional(array(Id)),
      cylinder: optional(
        strictObject({
          chambers: array(
            union([
              strictObject({ state: picklist(['empty', 'case']) }),
              strictObject({ state: literal('round'), roundType: Id }),
            ]),
          ),
          aligned: Count,
          open: boolean(),
          cocked: boolean(),
        }),
      ),
      destination: KitDestinationSchema,
    }),
  ),
  wounds: array(strictObject({ region: picklist(BODY_REGIONS), bleeding: Id })),
  /** Every content skill's starting level, under the start's own `skills`; null marks a debug start that tests
   * skills and so keeps the ordinary levels (`docs/PROCESS.md`, "Reviews by eye and by play"). */
  allSkills: optional(nullable(pipe(number(), integer(), minValue(SKILL_LEVEL_MIN), maxValue(SKILL_LEVEL_MAX)))),
  skills: record(Id, pipe(number(), integer(), minValue(SKILL_LEVEL_MIN), maxValue(SKILL_LEVEL_LEGENDARY))),
  recipes: array(Id),
});

export type StartDef = InferOutput<typeof StartSchema>;
export type StartKitEntry = StartDef['kit'][number];
