import type { Registry } from './content.ts';

export interface Stack {
  item: string;
  count: number;
}

export interface Totals {
  /** Grams. */
  weight: number;
  /** Millilitres. */
  volume: number;
  /** Item ids the registry doesn't know (e.g. from a removed mod). */
  unknown: string[];
}

export const inventoryTotals = (stacks: Stack[], registry: Registry): Totals => {
  const totals: Totals = { weight: 0, volume: 0, unknown: [] };
  for (const { item, count } of stacks) {
    const def = registry.items.get(item);
    if (!def) {
      totals.unknown.push(item);
      continue;
    }
    totals.weight += def.weight * count;
    totals.volume += def.volume * count;
  }
  return totals;
};
