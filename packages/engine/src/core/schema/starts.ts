import {
  array,
  boolean,
  check,
  type GenericSchema,
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
import { SKILL_LEVEL_LEGENDARY, SKILL_LEVEL_MAX, SKILL_LEVEL_MIN } from '../skillLevels.ts';
import { AttributeValues } from './attributes.ts';
import { FixedLootOverride, StartDescentSchema } from './layouts.ts';
import { Count, Fraction, GameTimeOfDay, Id, Name, Positive } from './primitives.ts';
import { CellPosition } from './templates.ts';

const KitDestinationSchema = union([
  strictObject({ kind: literal('worn') }),
  strictObject({ kind: literal('pile'), pos: CellPosition }),
  strictObject({ kind: literal('hand'), role: picklist(['dominant', 'off']) }),
  strictObject({ kind: literal('pocket'), parent: Id, pocket: Count }),
  strictObject({ kind: literal('slot'), parent: Id, slot: Id }),
]);

export const StartKitEntrySchema = strictObject({
  id: Id,
  item: Id,
  count: optional(pipe(Count, minValue(1))),
  condition: optional(Fraction),
  lit: optional(literal(true)),
  /** The world region pair a paper map covers; only a paper-map item takes it. See `packages/deadvox/DESIGN.md`, "Regional paper maps". */
  paperMap: optional(strictObject({ x: pipe(number(), integer()), z: pipe(number(), integer()) })),
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
});

/** A known ability the start grants; its level is on the ability's own scale. */
export const StartAbilitySchema = strictObject({ ability: Id, level: Count });

/** A resource pool the start grants, full; a character granted none has no pool at all. */
export const StartPoolSchema = strictObject({ pool: Id });

/** The key of each keyed start list's rows, by which a patch adds rows and each row keeps an origin of its own. */
export const START_ROW_KEYS = {
  kit: (row: InferOutput<typeof StartKitEntrySchema>) => row.id,
  abilities: (row: InferOutput<typeof StartAbilitySchema>) => row.ability,
  pools: (row: InferOutput<typeof StartPoolSchema>) => row.pool,
} as const;

const repeatedKey = <T>(rows: readonly T[], keyOf: (row: T) => string): string | undefined =>
  rows.map(keyOf).find((id, i, ids) => ids.indexOf(id) !== i);

/** A list whose rows' keys are unique, so each key addresses one row. */
export const keyedRows = <T>(row: GenericSchema<unknown, T>, keyOf: (row: T) => string) =>
  pipe(
    array(row),
    check(
      (rows) => repeatedKey(rows, keyOf) === undefined,
      (issue) => `row "${repeatedKey(issue.input, keyOf)}" is repeated`,
    ),
  );

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
  kit: keyedRows(StartKitEntrySchema, START_ROW_KEYS.kit),
  wounds: array(strictObject({ region: picklist(BODY_REGIONS), bleeding: Id })),
  /** Terrain cells the start ships already damaged, in world blocks; the damage amount is content, not code. */
  supportLoss: optional(array(CellPosition)),
  blockDamage: optional(
    array(
      strictObject({
        cell: CellPosition,
        damage: Positive,
      }),
    ),
  ),
  /** Terrain cells the start ignites through the world's fire owner. */
  fires: optional(array(strictObject({ cell: CellPosition, strength: Positive }))),
  /** Every content skill's starting level, under the start's own `skills`; null marks a debug start that tests
   * skills and so keeps the ordinary levels (`docs/PROCESS.md`, "Reviews by eye and by play"). */
  allSkills: optional(nullable(pipe(number(), integer(), minValue(SKILL_LEVEL_MIN), maxValue(SKILL_LEVEL_MAX)))),
  skills: record(Id, pipe(number(), integer(), minValue(SKILL_LEVEL_MIN), maxValue(SKILL_LEVEL_LEGENDARY))),
  recipes: array(Id),
  /** Innate attribute values the character starts with; an attribute left out is average. */
  attributes: AttributeValues,
  abilities: optional(keyedRows(StartAbilitySchema, START_ROW_KEYS.abilities), () => []),
  pools: optional(keyedRows(StartPoolSchema, START_ROW_KEYS.pools), () => []),
});

export type StartDef = InferOutput<typeof StartSchema>;
export type StartKitEntry = InferOutput<typeof StartKitEntrySchema>;
export type StartRowList = keyof typeof START_ROW_KEYS;
export type StartRow<L extends StartRowList> = StartDef[L][number];
export const START_ROW_LISTS = Object.keys(START_ROW_KEYS) as StartRowList[];
// A key function indexed by a generic list widens to the union of all three; each one takes only its own list's rows.
export const startRowKey = <L extends StartRowList>(list: L, row: StartRow<L>): string =>
  (START_ROW_KEYS[list] as (row: StartRow<L>) => string)(row);
