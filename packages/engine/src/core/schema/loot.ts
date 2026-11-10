import { array, check, nonEmpty, optional, pipe, strictObject, boolean as vBoolean } from 'valibot';
import { capabilityField } from './capability.ts';
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

export const CartridgeOddsSchema = pipe(
  array(strictObject({ item: Id, weight: Positive })),
  nonEmpty('needs at least one cartridge'),
  check((odds) => new Set(odds.map(({ item }) => item)).size === odds.length, 'cartridges must be distinct'),
);

export const LootTableSchema = strictObject({
  id: Id,
  /** How many times to roll, inclusive. */
  rolls: range(Count),
  entries: pipe(array(LootEntrySchema), nonEmpty('needs at least one entry')),
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
