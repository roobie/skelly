// Rolling loot tables (`DESIGN.md`, "Loot"). A table rolls a number of times; each roll
// picks an entry by weight: an item (with a count and condition range), a nested
// table (rolled in full), or nothing. What comes out is a list of items to make, not
// instances, so worldgen stays free of item uids.

import { array, check, type InferOutput, picklist, pipe, strictObject } from 'valibot';
import type { LootEntry, Registry } from './content.ts';
import { toChunk, type Vec3 } from './coords.ts';
import { Rng } from './random.ts';
import type { FixedLootItemDef } from './schema.ts';

const distinct = <T>(values: T[]): boolean => new Set(values).size === values.length;

export const UsageSchema = pipe(
  array(picklist(['Residential', 'Industrial', 'Medical', 'Hunting', 'Military', 'Infected'])),
  check(distinct, 'usage tags must be unique'),
);
export const LootTierSchema = picklist(['Tier1', 'Tier2', 'Tier3']);
export const ItemEconomySchema = strictObject({
  usage: UsageSchema,
  tiers: pipe(array(LootTierSchema), check(distinct, 'tiers must be unique')),
});
export const LootContextSchema = strictObject({ usage: UsageSchema, tier: LootTierSchema });

export type ItemEconomy = InferOutput<typeof ItemEconomySchema>;
export type LootContext = InferOutput<typeof LootContextSchema>;
export type UsageTag = ItemEconomy['usage'][number];

export const economyEligible = (economy: ItemEconomy, context: LootContext): boolean =>
  economy.tiers.includes(context.tier) && economy.usage.some((usage) => context.usage.includes(usage));

export const militaryOnlyEconomy = (economy: ItemEconomy): boolean =>
  economy.usage.length === 1 && economy.usage[0] === 'Military';

export type LootSupply =
  | { readonly kind: 'table'; readonly table: string }
  | { readonly kind: 'fixed'; readonly items: readonly FixedLootItemDef[] }
  | { readonly kind: 'empty' };

export interface LootSpawnPoint {
  readonly id: string;
  readonly channel: 'container' | 'surface';
  readonly position: Vec3;
  readonly destination: Vec3;
  readonly context: LootContext;
  readonly supply: LootSupply;
  readonly required: boolean;
}

export interface LootPointSource {
  readonly site: string;
  readonly building: string;
  /** Include the local vertical coordinate so stress-test storeys cannot alias. */
  readonly anchor: Vec3;
  readonly channel: LootSpawnPoint['channel'];
  readonly position: Vec3;
  readonly destination: Vec3;
  readonly context: LootContext;
  readonly usage?: readonly UsageTag[];
  readonly supply: LootSupply;
  readonly required: boolean;
}

export const lootSpawnPoint = (source: LootPointSource): LootSpawnPoint => ({
  // Tuple encoding prevents separators inside authored IDs from aliasing another source.
  id: JSON.stringify([source.site, source.building, source.anchor, source.channel]),
  channel: source.channel,
  position: source.position,
  destination: source.destination,
  context: {
    usage: source.usage === undefined ? [...source.context.usage] : [...source.usage],
    tier: source.context.tier,
  },
  supply: source.supply,
  required: source.required,
});

export const lootPointStream = (seed: number, point: LootSpawnPoint): Rng => Rng.stream(seed, `loot:${point.id}`);

export const lootPointsByColumn = (
  sources: readonly LootPointSource[],
): ReadonlyMap<string, readonly LootSpawnPoint[]> => {
  const columns = new Map<string, LootSpawnPoint[]>();
  const ids = new Set<string>();
  for (const source of sources) {
    const point = lootSpawnPoint(source);
    if (ids.has(point.id)) {
      throw new Error(`duplicate loot spawn point ${point.id}`);
    }
    ids.add(point.id);
    const key = `${toChunk(point.destination[0])},${toChunk(point.destination[2])}`;
    const points = columns.get(key) ?? [];
    points.push(point);
    columns.set(key, points);
  }
  return columns;
};

export interface Rolled {
  type: string;
  count: number;
  /** 0 to 1, rounded to hundredths so identical rolls stack. */
  condition: number;
  /** Item types fitted to each one, by slot id; only authored fixed loot sets them. */
  fitted?: Readonly<Record<string, string>>;
}

const pick = (entries: readonly LootEntry[], rng: Rng): LootEntry => {
  const total = entries.reduce((sum, e) => sum + e.weight, 0);
  let r = rng.next() * total;
  for (const entry of entries) {
    r -= entry.weight;
    if (r < 0) {
      return entry;
    }
  }
  return entries.at(-1)!;
};

/**
 * Items for one count of an entry: a stackable item comes as stacks of up to its
 * limit, anything else as separate items.
 */
const itemsOf = (registry: Registry, type: string, count: number, condition: number): Rolled[] => {
  const limit = registry.items.get(type)?.stack ?? 1;
  const out: Rolled[] = [];
  for (let left = count; left > 0; left -= limit) {
    out.push({ type, count: Math.min(left, limit), condition });
  }
  return out;
};

/** Turns authored fixed items into worldgen records while respecting each item's stack limit. */
export const fixedItems = (registry: Registry, items: readonly FixedLootItemDef[]): Rolled[] =>
  items.flatMap(({ item, count = 1, condition = 1, fitted }) =>
    itemsOf(registry, item, count, condition).map((rolled) => (fitted ? { ...rolled, fitted } : rolled)),
  );

/** Rolls a table. The validator has already ruled out missing ids and loops. */
export const rollLoot = (registry: Registry, tableId: string, rng: Rng): Rolled[] => {
  const table = registry.loot.get(tableId);
  if (!table) {
    return [];
  }
  const out: Rolled[] = [];
  const rolls = rng.int(table.rolls[0], table.rolls[1]);
  for (let i = 0; i < rolls; i++) {
    const entry = pick(table.entries, rng);
    if (entry.table !== undefined) {
      out.push(...rollLoot(registry, entry.table, rng));
    } else if (entry.item !== undefined) {
      const count = entry.count ? rng.int(entry.count[0], entry.count[1]) : 1;
      const condition = entry.condition ? Math.round(rng.range(entry.condition[0], entry.condition[1]) * 100) / 100 : 1;
      out.push(...itemsOf(registry, entry.item, count, condition));
    }
  }
  return out;
};
