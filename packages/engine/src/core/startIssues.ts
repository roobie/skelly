import { claimed } from './capabilities.ts';
import { startReservationIssues } from './cityPlan.ts';
import type { ElementPath, Registry } from './content.ts';
import { GENERATED_SITES } from './generatedSites.ts';
import { Inventory, wornOccupancyIssue, wornSlotOf } from './inventory.ts';
import { type Item, ItemFactory, setInitialCylinder } from './items.ts';
import { toggleLight } from './lights.ts';
import { knownItemSlot, magazineContentsReason } from './magazine.ts';
import { startFixedLootIssues } from './scenarioComposition.ts';
import { scenarioStartIssues } from './scenarioStart.ts';
import type { StartDef, StartKitEntry, StartRowList } from './schema/starts.ts';
import type { ScenarioDef } from './schema.ts';
import { assembleStartKit, startKitOrder } from './startState.ts';

interface StartIssue {
  id: string;
  /** A keyed row's issue is addressed by the row, since a patch may have added it from another file. */
  path: string | ElementPath;
  message: string;
}

type Fail = (path: string | ElementPath, message: string) => void;

/** Reports at a path within one keyed row of the start. */
const rowFail =
  (fail: Fail, list: StartRowList, element: string) =>
  (path: string, message: string): void =>
    fail({ list, element, path }, message);

const destinationIssues = (
  registry: Registry,
  entry: StartKitEntry,
  { parents, hands }: { parents: ReadonlyMap<string, StartKitEntry>; hands: Set<string> },
  fail: (path: string, message: string) => void,
): void => {
  const { destination } = entry;
  if (destination.kind === 'hand') {
    if (hands.has(destination.role)) {
      fail('.destination.role', `hand "${destination.role}" is already assigned`);
    }
    hands.add(destination.role);
  } else if (destination.kind === 'pocket' || destination.kind === 'slot') {
    const parent = parents.get(destination.parent);
    if (!parent) {
      fail('.destination.parent', `missing parent "${destination.parent}"`);
      return;
    }
    const def = registry.items.get(parent.item);
    if (destination.kind === 'pocket' && !def?.container?.pockets[destination.pocket]) {
      fail('.destination.pocket', `parent "${destination.parent}" has no such pocket`);
    }
    if (destination.kind === 'slot' && !knownItemSlot(registry, parent.item, destination.slot)) {
      fail('.destination.slot', `parent "${destination.parent}" has no such certified slot`);
    }
  }
};

const litIssue = (registry: Registry, entry: StartKitEntry, item: Item, fail: (message: string) => void): void => {
  if (!entry.lit) {
    return;
  }
  try {
    const refusal = toggleLight(registry, item, 0);
    if (refusal !== undefined) {
      fail(refusal);
    }
  } catch (error) {
    fail(String(error));
  }
};

type RowFail = (path: string, message: string) => void;

/** Checks one kit row on its own, before any of the kit is assembled. */
const kitRowIssues = (
  registry: Registry,
  entry: StartKitEntry,
  kit: { parents: ReadonlyMap<string, StartKitEntry>; hands: Set<string> },
  fail: RowFail,
): void => {
  if (!registry.items.has(entry.item)) {
    fail('.item', `no item "${entry.item}"`);
  }
  if (entry.cartridges !== undefined) {
    const reason = magazineContentsReason(registry, entry.item, entry.cartridges);
    if (reason) {
      fail('.cartridges', reason);
    }
  }
  if (entry.cylinder !== undefined) {
    try {
      const item = new ItemFactory().create(registry, entry.item, entry.count);
      setInitialCylinder(registry, item, entry.cylinder);
    } catch (error) {
      fail('.cylinder', String(error));
    }
  }
  destinationIssues(registry, entry, kit, fail);
};

/** Lighting and worn slots can only be judged on the assembled items, fittings included. */
const assembledKitIssues = (
  registry: Registry,
  ordered: readonly StartKitEntry[],
  items: ReadonlyMap<string, Item>,
  failRow: (entry: StartKitEntry) => RowFail,
): void => {
  const worn = new Set<string>();
  for (const entry of ordered) {
    const item = items.get(entry.id)!;
    const fail = failRow(entry);
    litIssue(registry, entry, item, (message) => fail('.lit', message));
    if (entry.destination.kind !== 'worn') {
      continue;
    }
    const slot = wornSlotOf(registry, item);
    const reason = slot === undefined ? 'item has no worn destination' : wornOccupancyIssue(registry, slot, item);
    if (reason) {
      fail('.destination', reason);
    } else if (slot !== undefined) {
      if (worn.has(slot)) {
        fail('.destination', `worn slot "${slot}" is already assigned`);
      }
      worn.add(slot);
    }
  }
};

const kitIssues = (registry: Registry, start: StartDef, fail: Fail): void => {
  const failRow = (entry: StartKitEntry) => rowFail(fail, 'kit', entry.id);
  const ordered = startKitOrder(start.kit, (entry, suffix, message) => failRow(entry)(suffix, message));
  if (!ordered) {
    return;
  }
  const kit = { parents: new Map(start.kit.map((entry) => [entry.id, entry])), hands: new Set<string>() };
  let valid = true;
  for (const entry of start.kit) {
    kitRowIssues(registry, entry, kit, (path, message) => {
      valid = false;
      failRow(entry)(path, message);
    });
  }
  if (!valid) {
    return;
  }
  const items = assembleStartKit(new Inventory(registry), ordered, (entry, reason) =>
    failRow(entry)('.destination', String(reason)),
  );
  if (items) {
    assembledKitIssues(registry, ordered, items, failRow);
  }
};

/** Granted abilities and pools must exist, and a level must be one the ability reaches. */
const magicIssues = (registry: Registry, start: StartDef, fail: Fail): void => {
  for (const { ability, level } of start.abilities) {
    const def = registry.abilities.get(ability);
    const failRow = rowFail(fail, 'abilities', ability);
    if (!def) {
      failRow('.ability', `no ability "${ability}"`);
    } else if (level > def.progression.maximumLevel) {
      failRow('.level', `ability "${ability}" stops at level ${def.progression.maximumLevel}`);
    }
  }
  for (const { pool } of start.pools) {
    if (!registry.pools.has(pool)) {
      rowFail(fail, 'pools', pool)('.pool', `no pool "${pool}"`);
    }
  }
};

/** A composed scenario names no start, so each start on it brings and answers for its own placement. */
const placementIssues = (
  registry: Registry,
  start: StartDef,
  scenario: ScenarioDef | undefined,
  fail: (path: string, message: string) => void,
): void => {
  const { placement } = start;
  if (scenario?.kind !== 'assembledCity' || !scenario.composition) {
    if (placement) {
      fail(
        '.placement',
        `site "${start.site}" does not define a city composition, so a start there takes no placement`,
      );
    }
    return;
  }
  if (!placement) {
    fail('.placement', `composed scenario "${scenario.id}" needs a placement on each of its starts`);
    return;
  }
  for (const [path, message] of [
    ...scenarioStartIssues(registry, scenario, placement),
    ...startReservationIssues(registry, scenario, placement),
    ...startFixedLootIssues(registry, scenario, placement),
  ]) {
    fail(path, message);
  }
};

/** Reports each skill or attribute a start sets that the content does not define. */
const unknownIds = (
  registry: Registry,
  start: StartDef,
  section: 'skills' | 'attributes',
  fail: (path: string, message: string) => void,
): void => {
  for (const id of Object.keys(start[section] ?? {})) {
    if (!registry[section].has(id)) {
      fail(`.${section}.${id}`, `no ${section.slice(0, -1)} "${id}"`);
    }
  }
};

export const startIssues = (registry: Registry): StartIssue[] => {
  const issues: StartIssue[] = [];
  for (const start of registry.starts.values()) {
    const fail: Fail = (path, message) => {
      issues.push({ id: start.id, path, message });
    };
    const scenario = registry.scenarios.get(start.site);
    if (!(scenario || registry.layouts.has(start.site) || GENERATED_SITES.has(start.site))) {
      fail('.site', `no scenario or layout "${start.site}"`);
    }
    placementIssues(registry, start, scenario, fail);
    if (
      start.defaultForSite &&
      [...registry.starts.values()].some(
        (other) => other.id !== start.id && other.defaultForSite && other.site === start.site,
      )
    ) {
      fail('.defaultForSite', `site "${start.site}" has more than one default start`);
    }
    kitIssues(registry, start, fail);
    magicIssues(registry, start, fail);
    unknownIds(registry, start, 'skills', fail);
    unknownIds(registry, start, 'attributes', fail);
    start.recipes.forEach((id, index) => {
      if (!registry.recipes.has(id)) {
        fail(`.recipes[${index}]`, `no recipe "${id}"`);
      }
    });
    const body = scenario ? registry.body.get(scenario.body) : claimed(registry.body, 'player');
    start.wounds.forEach((wound, index) => {
      if (!body?.bleeding.tiers.some(({ id }) => id === wound.bleeding)) {
        fail(`.wounds[${index}].bleeding`, `no bleeding tier "${wound.bleeding}" for this start's body`);
      }
    });
  }
  return issues;
};
