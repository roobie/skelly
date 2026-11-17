import type { Body } from './body.ts';
import { type Character, dominantSide, offSide } from './character.ts';
import type { Vec3 } from './coords.ts';
import type { Inventory, Target } from './inventory.ts';
import { type Item, setInitialCylinder } from './items.ts';
import { toggleLight } from './lights.ts';
import type { StartDef, StartKitEntry } from './schema/starts.ts';

export const startKitOrder = (
  kit: readonly StartKitEntry[],
  fail: (entry: StartKitEntry, suffix: string, message: string) => void,
): StartKitEntry[] | undefined => {
  const parents = new Map<string, StartKitEntry>();
  let valid = true;
  for (const entry of kit) {
    if (parents.has(entry.id)) {
      fail(entry, '.id', `duplicate kit entry "${entry.id}"`);
      valid = false;
    }
    parents.set(entry.id, entry);
  }
  const ordered: StartKitEntry[] = [];
  const visiting = new Set<StartKitEntry>();
  const visited = new Set<StartKitEntry>();
  const visit = (entry: StartKitEntry): void => {
    if (visited.has(entry)) {
      return;
    }
    if (visiting.has(entry)) {
      fail(entry, '.destination.parent', `cyclic kit ownership at "${entry.id}"`);
      valid = false;
      return;
    }
    visiting.add(entry);
    const { destination } = entry;
    if (destination.kind === 'slot' || destination.kind === 'pocket') {
      const parent = parents.get(destination.parent);
      if (parent) {
        visit(parent);
      } else {
        fail(entry, '.destination.parent', `missing parent "${destination.parent}"`);
        valid = false;
      }
    }
    visiting.delete(entry);
    visited.add(entry);
    ordered.push(entry);
  };
  for (const entry of kit) {
    visit(entry);
  }
  return valid ? ordered : undefined;
};

const createStartItem = (inventory: Inventory, entry: StartKitEntry): Item => {
  const item = inventory.create(entry.item, entry.count, entry.condition);
  if (entry.cartridges !== undefined) {
    item.cartridges = [...entry.cartridges];
  }
  if (entry.cylinder !== undefined) {
    setInitialCylinder(inventory.registry, item, entry.cylinder);
  }
  return item;
};

/** Fittings must exist before a root's persistent worn eligibility can be checked. */
export const assembleStartKit = (
  inventory: Inventory,
  ordered: readonly StartKitEntry[],
  fail: (entry: StartKitEntry, reason: unknown) => void,
): Map<string, Item> | undefined => {
  const fittings = ordered.flatMap((entry) =>
    entry.destination.kind === 'slot' ? [{ entry, destination: entry.destination }] : [],
  );
  const assigned = new Map<string, Set<string>>();
  for (const { entry, destination } of fittings) {
    const slots = assigned.get(destination.parent) ?? new Set<string>();
    if (slots.has(destination.slot)) {
      fail(entry, new Error(`slot "${destination.slot}" on "${destination.parent}" is already assigned`));
      return undefined;
    }
    slots.add(destination.slot);
    assigned.set(destination.parent, slots);
  }
  const items = new Map<string, Item>();
  for (const entry of ordered) {
    try {
      items.set(entry.id, createStartItem(inventory, entry));
    } catch (error) {
      fail(entry, error);
      return undefined;
    }
  }
  // Replaced defaults must not veto siblings that are certified together in the completed kit.
  for (const { entry, destination } of fittings) {
    try {
      inventory.fitSlot(items.get(destination.parent)!, destination.slot, undefined);
    } catch (error) {
      fail(entry, error);
      return undefined;
    }
  }
  for (const { entry, destination } of fittings) {
    try {
      inventory.fitSlot(items.get(destination.parent)!, destination.slot, items.get(entry.id)!);
    } catch (error) {
      fail(entry, error);
      return undefined;
    }
  }
  return items;
};

const placeEntry = (
  inventory: Inventory,
  entry: StartKitEntry,
  item: Item,
  parents: ReadonlyMap<string, Item>,
): void => {
  const { destination } = entry;
  if (destination.kind === 'slot') {
    return;
  }
  let target: Target;
  if (destination.kind === 'hand') {
    target = {
      kind: 'hand',
      side: destination.role === 'dominant' ? dominantSide(inventory.character) : offSide(inventory.character),
    };
  } else if (destination.kind === 'pile') {
    target = { kind: 'pile', pos: destination.pos };
  } else if (destination.kind === 'pocket') {
    const parent = parents.get(destination.parent);
    if (!parent) {
      throw new Error(`missing parent "${destination.parent}"`);
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

export const applyStartKit = (inventory: Inventory, start: StartDef, calendar = 0): void => {
  const fail = (entry: StartKitEntry, reason: unknown): never =>
    startFailure(inventory, start, `kit entry "${entry.id}"`, reason);
  const ordered = startKitOrder(start.kit, (entry, _suffix, message) => fail(entry, message))!;
  const parents = assembleStartKit(inventory, ordered, fail)!;
  for (const entry of ordered) {
    try {
      const item = parents.get(entry.id)!;
      placeEntry(inventory, entry, item, parents);
      if (entry.lit) {
        const refusal = toggleLight(inventory.registry, item, calendar);
        if (refusal !== undefined) {
          throw new Error(refusal);
        }
      }
    } catch (error) {
      fail(entry, error);
    }
  }
};

/** A start's skill levels: `allSkills` for every skill the content defines, then the start's own `skills`. */
export const startSkills = (
  skills: ReadonlyMap<string, unknown>,
  start: Pick<StartDef, 'allSkills' | 'skills'>,
): Record<string, number> => {
  const { allSkills } = start;
  return {
    ...(allSkills === undefined || allSkills === null
      ? {}
      : Object.fromEntries([...skills.keys()].map((id) => [id, allSkills]))),
    ...start.skills,
  };
};

export const applyStartState = (
  inventory: Inventory,
  start: StartDef,
  context: {
    fresh: boolean;
    calendar?: number;
    character: Character;
    body: Body;
    /** Records authored damage on a terrain cell, through the session's own damage owner. */
    damageCell: (cell: Vec3, damage: number) => void;
  },
): void => {
  if (!context.fresh) {
    return;
  }
  applyStartKit(inventory, start, context.calendar);
  try {
    context.character.initializeAttributes(start.attributes ?? {});
    context.character.initializeProgression(startSkills(inventory.registry.skills, start), start.recipes);
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
  for (const [index, entry] of (start.blockDamage ?? []).entries()) {
    try {
      context.damageCell(entry.cell, entry.damage);
    } catch (error) {
      startFailure(inventory, start, `blockDamage[${index}]`, error);
    }
  }
};
