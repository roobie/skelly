// Rolling loot tables (DESIGN.md, "Loot"). A table rolls a number of times; each roll
// picks an entry by weight: an item (with a count and condition range), a nested
// table (rolled in full), or nothing. What comes out is a list of items to make, not
// instances, so worldgen stays free of item uids.

import type { LootEntry, Registry } from './content.ts';
import type { Rng } from './random.ts';

export interface Rolled {
  type: string;
  count: number;
  /** 0 to 1, rounded to hundredths so identical rolls stack. */
  condition: number;
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
