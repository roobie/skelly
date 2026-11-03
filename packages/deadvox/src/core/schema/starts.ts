import {
  array,
  type InferOutput,
  integer,
  literal,
  maxValue,
  minValue,
  nullable,
  number,
  optional,
  picklist,
  pipe,
  record,
  strictObject,
  union,
} from 'valibot';
import { BODY_REGIONS } from '../body.ts';
import { SKILL_LEVEL_LEGENDARY, SKILL_LEVEL_MIN } from '../character.ts';
import { Count, Fraction, GameTimeOfDay, Id, Name } from './primitives.ts';

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
  kit: array(
    strictObject({
      id: Id,
      item: Id,
      count: optional(pipe(Count, minValue(1))),
      condition: optional(Fraction),
      cartridges: optional(array(Id)),
      destination: KitDestinationSchema,
    }),
  ),
  wounds: array(strictObject({ region: picklist(BODY_REGIONS), bleeding: Id })),
  skills: record(Id, pipe(number(), integer(), minValue(SKILL_LEVEL_MIN), maxValue(SKILL_LEVEL_LEGENDARY))),
  recipes: array(Id),
});

export type StartDef = InferOutput<typeof StartSchema>;
export type StartKitEntry = StartDef['kit'][number];
