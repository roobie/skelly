import type { Body } from './body.ts';
import { type Character, dominantSide, offSide } from './character.ts';
import type { Inventory, Target } from './inventory.ts';
import { type Item, setInitialCylinder } from './items.ts';
import type { StartDef, StartKitEntry } from './schema/starts.ts';

const placeEntry = (
  inventory: Inventory,
  entry: StartKitEntry,
  item: Item,
  parents: ReadonlyMap<string, Item>,
): void => {
  const { destination } = entry;
  if (destination.kind === 'slot') {
    const parent = parents.get(destination.parent);
    if (!parent) {
      throw new Error(`missing earlier parent "${destination.parent}"`);
    }
    inventory.fitSlot(parent, destination.slot, item);
    return;
  }
  let target: Target;
  if (destination.kind === 'hand') {
    target = {
      kind: 'hand',
      side: destination.role === 'dominant' ? dominantSide(inventory.character) : offSide(inventory.character),
    };
  } else if (destination.kind === 'pocket') {
    const parent = parents.get(destination.parent);
    if (!parent) {
      throw new Error(`missing earlier parent "${destination.parent}"`);
    }
    target = { kind: 'pocket', owner: parent, pocket: destination.pocket };
  } else {
    target = { kind: 'worn' };
  }
  if (!inventory.add(item, target)) {
    throw new Error('ordinary inventory placement refused');
  }
};

const startFailure = (inventory: Inventory, start: StartDef, path: string, reason: unknown): never => {
  const origin = inventory.registry.contentOrigins.get(`starts:${start.id}`);
  throw new Error(`Start "${start.id}" (${origin?.source ?? 'unattributed start'}) ${path}: ${String(reason)}`);
};

export const applyStartKit = (inventory: Inventory, start: StartDef): void => {
  const parents = new Map<string, Item>();
  for (const entry of start.kit) {
    try {
      const item = inventory.create(entry.item, entry.count, entry.condition);
      if (entry.cartridges !== undefined) {
        item.cartridges = [...entry.cartridges];
      }
      if (entry.cylinder !== undefined) {
        setInitialCylinder(inventory.registry, item, entry.cylinder);
      }
      placeEntry(inventory, entry, item, parents);
      parents.set(entry.id, item);
    } catch (error) {
      startFailure(inventory, start, `kit entry "${entry.id}"`, error);
    }
  }
};

export const applyStartState = (
  inventory: Inventory,
  start: StartDef,
  context: { fresh: boolean; character: Character; body: Body },
): void => {
  if (!context.fresh) {
    return;
  }
  applyStartKit(inventory, start);
  try {
    context.character.initializeProgression(start.skills, start.recipes);
  } catch (error) {
    startFailure(inventory, start, 'progression', error);
  }
  for (const [index, wound] of start.wounds.entries()) {
    const tier = context.body.tuning.bleeding.tiers.findIndex(({ id }) => id === wound.bleeding);
    try {
      context.body.impact(0, wound.region, { bleeding: tier, infectionAtRisk: false });
    } catch (error) {
      startFailure(inventory, start, `wounds[${index}]`, error);
    }
  }
};
