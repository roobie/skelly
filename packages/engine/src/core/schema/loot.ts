import { array, check, literal, nonEmpty, optional, pipe, strictObject, boolean as vBoolean } from 'valibot';
import { capabilityField } from './capability.ts';
import { Count, Fraction, Id, Positive, range } from './primitives.ts';

// ---- loot tables ----

const LootEntrySchema = pipe(
  strictObject({
    /** Unique within its table, so a patch can address the row. */
    id: Id,
    weight: Positive,
    item: optional(Id),
    table: optional(Id),
    nothing: optional(vBoolean()),
    /** How many of the item, inclusive; of a packaged item, how many filled holders. */
    count: optional(range(Count)),
    /** Condition of the item, 0 (broken) to 1 (new), inclusive. */
    condition: optional(range(Fraction)),
    /** How full each holder of a packaged item comes, as shares of its packaging count, inclusive; unset is full. */
    fill: optional(range(Fraction)),
    /** Drops a packaged item as the bare stack, as pills loose in a drawer. */
    loose: optional(literal(true)),
  }),
  check(
    (e) => [e.item, e.table, e.nothing].filter((x) => x !== undefined).length === 1,
    'needs exactly one of "item", "table" or "nothing"',
  ),
  check((e) => e.fill === undefined || e.loose === undefined, 'a loose entry has no holder to fill'),
);

const repeatedRowId = (entries: readonly { id: string }[]): string | undefined =>
  entries.map(({ id }) => id).find((id, i, ids) => ids.indexOf(id) !== i);

export const LootEntriesSchema = pipe(
  array(LootEntrySchema),
  nonEmpty('needs at least one entry'),
  check(
    (entries) => repeatedRowId(entries) === undefined,
    (issue) => `row id "${repeatedRowId(issue.input)}" is repeated`,
  ),
);

export const CartridgeOddsSchema = pipe(
  array(strictObject({ item: Id, weight: Positive })),
  nonEmpty('needs at least one cartridge'),
  check((odds) => new Set(odds.map(({ item }) => item)).size === odds.length, 'cartridges must be distinct'),
);

export const LootTableSchema = strictObject({
  id: Id,
  /** How many times to roll, inclusive. */
  rolls: range(Count),
  entries: LootEntriesSchema,
  /** Cartridge types, by weight, that a magazine this table drops is filled with; absent drops empty magazines. */
  cartridgeOdds: optional(CartridgeOddsSchema),
});

/** The product's distribution policy for what loot holds, apart from which table drops it. */
export const LootPolicySchema = strictObject({
  id: Id,
  capability: capabilityField('lootPolicy'),
  /** A dropped magazine's load as shares of its capacity, inclusive; each whole count in the rounded range is equally likely. */
  magazineLoad: range(Fraction),
});
