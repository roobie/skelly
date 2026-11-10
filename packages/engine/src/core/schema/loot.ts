import { array, check, nonEmpty, optional, pipe, strictObject, boolean as vBoolean } from 'valibot';
import { Count, Fraction, Id, Positive, range } from './primitives.ts';

// ---- loot tables ----

const LootEntrySchema = pipe(
  strictObject({
    weight: Positive,
    item: optional(Id),
    table: optional(Id),
    nothing: optional(vBoolean()),
    /** How many of the item, inclusive. */
    count: optional(range(Count)),
    /** Condition of the item, 0 (broken) to 1 (new), inclusive. */
    condition: optional(range(Fraction)),
  }),
  check(
    (e) => [e.item, e.table, e.nothing].filter((x) => x !== undefined).length === 1,
    'needs exactly one of "item", "table" or "nothing"',
  ),
);

export const LootTableSchema = strictObject({
  id: Id,
  /** How many times to roll, inclusive. */
  rolls: range(Count),
  entries: pipe(array(LootEntrySchema), nonEmpty('needs at least one entry')),
});
