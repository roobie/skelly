// Whether a ground supply can overfill the one pile it is added to (`DESIGN.md`, "Loot"). The
// packer replays every reachable roll with the runtime's first-fit placement and credits the
// source's admission, but never stack merging: each stack is placed on its own.

import type { LootEntry, Registry } from './content.ts';
import { PILE_GRID } from './inventoryScale.ts';
import { findSpot, type Item, ItemFactory } from './items.ts';
import { admittedCandidates, type LootContext, type LootSpawnPoint } from './loot.ts';

type Supply = LootSpawnPoint['supply'];
interface Placed {
  item: Item;
  x: number;
  y: number;
  rotated: boolean;
}
type States = Map<string, Placed[]>;

interface PileVerdict {
  readonly outcome: 'fits' | 'overflow' | 'unproven';
  /** Whether a stackable item was reachable, so crediting merging could have changed the answer. */
  readonly stackable: boolean;
}

class PileStop extends Error {
  readonly outcome: 'overflow' | 'unproven';
  constructor(outcome: 'overflow' | 'unproven') {
    super(outcome);
    this.outcome = outcome;
  }
}

interface Search {
  readonly registry: Registry;
  readonly point: LootSpawnPoint;
  readonly stateCap: number;
  readonly factory: ItemFactory;
  readonly items: Map<string, Item>;
  created: number;
  stackable: boolean;
}

const MAX_NESTING = 16;

const itemOf = (search: Search, type: string): Item => {
  let item = search.items.get(type);
  if (!item) {
    item = search.factory.create(search.registry, type);
    search.items.set(type, item);
  }
  return item;
};

const place = (search: Search, placed: Placed[], type: string): Placed[] => {
  const item = itemOf(search, type);
  const spot = findSpot(search.registry, { size: PILE_GRID, placed }, item);
  if (!spot) {
    throw new PileStop('overflow');
  }
  return [...placed, { item, ...spot }];
};

// Only the taken cells decide where later stacks go, so equal occupancy is one state.
const cellKey = (registry: Registry, placed: readonly Placed[]): string => {
  const rows = new Array<number>(PILE_GRID.h).fill(0);
  for (const { item, x, y, rotated } of placed) {
    const [w, h] = registry.items.get(item.type)!.size;
    const [width, height] = rotated ? [h, w] : [w, h];
    for (let row = y; row < y + height; row++) {
      for (let col = x; col < x + width; col++) {
        rows[row]! |= 1 << col;
      }
    }
  }
  return rows.join(',');
};

const addState = (search: Search, states: States, placed: Placed[]): void => {
  const key = cellKey(search.registry, placed);
  if (!states.has(key)) {
    states.set(key, placed);
    search.created += 1;
    if (search.created > search.stateCap) {
      throw new PileStop('unproven');
    }
  }
};

const stackCount = (search: Search, type: string, count: number): number => {
  const limit = search.registry.items.get(type)!.stack;
  if (limit !== undefined) {
    search.stackable = true;
  }
  return Math.ceil(count / (limit ?? 1));
};

// Stacks of one type share a footprint, so a roll's count matters only as its stack number.
const addStacks = (search: Search, states: States, type: string, [lowCount, highCount]: [number, number]): States => {
  const out: States = new Map();
  const low = stackCount(search, type, lowCount);
  const high = stackCount(search, type, highCount);
  for (const placed of states.values()) {
    for (let stacks = low; stacks <= high; stacks++) {
      let next = placed;
      for (let i = 0; i < stacks; i++) {
        next = place(search, next, type);
      }
      addState(search, out, next);
    }
  }
  return out;
};

const reachableEntries = (search: Search, entries: readonly LootEntry[]): LootEntry[] => {
  const leaves = entries.filter((entry) => entry.table === undefined);
  const admitted = admittedCandidates(
    search.registry,
    search.point,
    leaves.map((entry) => ({ type: entry.item, weight: entry.weight })),
  );
  const types = new Set(admitted.map((candidate) => candidate.type));
  return entries.filter((entry) => entry.weight > 0 && (entry.table !== undefined || types.has(entry.item)));
};

const merge = (into: States, from: States): void => {
  for (const [key, placed] of from) {
    into.set(key, placed);
  }
};

const applyEntry = (search: Search, current: States, entry: LootEntry, depth: number): States => {
  if (entry.table !== undefined) {
    return runTable(search, current, entry.table, depth + 1);
  }
  if (entry.item === undefined) {
    return current;
  }
  return addStacks(search, current, entry.item, [entry.count?.[0] ?? 1, entry.count?.[1] ?? 1]);
};

const runTable = (search: Search, states: States, tableId: string, depth: number): States => {
  const table = search.registry.loot.get(tableId);
  if (!table) {
    return states;
  }
  if (depth > MAX_NESTING) {
    throw new PileStop('unproven');
  }
  const entries = reachableEntries(search, table.entries);
  const [minRolls, maxRolls] = table.rolls;
  const all: States = new Map();
  let current = states;
  if (minRolls === 0) {
    merge(all, current);
  }
  for (let roll = 1; roll <= maxRolls; roll++) {
    const next: States = new Map();
    for (const entry of entries) {
      merge(next, applyEntry(search, current, entry, depth));
      if (next.size > search.stateCap) {
        throw new PileStop('unproven');
      }
    }
    current = next;
    if (roll >= minRolls) {
      merge(all, current);
    }
  }
  return all;
};

const fixedStates = (search: Search, items: Extract<Supply, { kind: 'fixed' }>['items']): States => {
  let states: States = new Map([['', []]]);
  for (const { item, count = 1, fitted } of items) {
    if (admittedCandidates(search.registry, search.point, [{ type: item, weight: 1, fitted }]).length > 0) {
      states = addStacks(search, states, item, [count, count]);
    }
  }
  return states;
};

const groundPileVerdict = (registry: Registry, supply: Supply, context: LootContext, stateCap: number): PileVerdict => {
  const search: Search = {
    registry,
    point: {
      id: 'pile-bound',
      channel: 'ground',
      position: [0, 0, 0],
      destination: [0, 0, 0],
      context,
      supply,
      required: false,
    },
    stateCap,
    factory: new ItemFactory(),
    items: new Map(),
    created: 0,
    stackable: false,
  };
  try {
    const start: States = supply.kind === 'fixed' ? fixedStates(search, supply.items) : new Map([['', []]]);
    if ('table' in supply && supply.table !== undefined) {
      runTable(search, start, supply.table, 0);
    }
    return { outcome: 'fits', stackable: search.stackable };
  } catch (error) {
    if (error instanceof PileStop) {
      return { outcome: error.outcome, stackable: search.stackable };
    }
    throw error;
  }
};

const describe = (supply: Supply): string => {
  const parts = [
    ...(supply.kind === 'fixed' ? ['fixed items'] : []),
    ...('table' in supply && supply.table !== undefined ? [`table "${supply.table}"`] : []),
  ];
  return parts.join(' and ');
};

// Template and scenario validation reach the same supply repeatedly, and one run is not cheap.
const verdicts = new WeakMap<Registry, Map<string, PileVerdict>>();

/** The author-facing reason a ground supply is not proven to fit one pile, if it is not. */
export const groundPileIssue = (
  registry: Registry,
  supply: Supply,
  context: LootContext,
  stateCap: number,
): string | undefined => {
  const memo = verdicts.get(registry) ?? new Map<string, PileVerdict>();
  verdicts.set(registry, memo);
  const memoKey = JSON.stringify([supply, context, stateCap]);
  const verdict = memo.get(memoKey) ?? groundPileVerdict(registry, supply, context, stateCap);
  memo.set(memoKey, verdict);
  if (verdict.outcome === 'fits') {
    return undefined;
  }
  const merging = verdict.stackable
    ? ' The check places every stack on its own and does not credit stack merging, so stock the game would merge may be refused.'
    : '';
  const split = ' Split the stock across several anchors.';
  const what = describe(supply);
  return verdict.outcome === 'overflow'
    ? `ground supply from ${what} could overfill one pile.${merging}${split}`
    : `ground supply from ${what} is unproven: it has more than ${stateCap} pile states to check.${merging}${split}`;
};
