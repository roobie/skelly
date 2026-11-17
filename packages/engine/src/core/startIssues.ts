import { claimed } from './capabilities.ts';
import { startReservationIssues } from './cityPlan.ts';
import type { Registry } from './content.ts';
import { GENERATED_SITES } from './generatedSites.ts';
import { Inventory, wornOccupancyIssue, wornSlotOf } from './inventory.ts';
import { type Item, ItemFactory, setInitialCylinder } from './items.ts';
import { toggleLight } from './lights.ts';
import { knownItemSlot, magazineContentsReason } from './magazine.ts';
import { startFixedLootIssues } from './scenarioComposition.ts';
import { scenarioStartIssues } from './scenarioStart.ts';
import type { StartDef, StartKitEntry } from './schema/starts.ts';
import type { ScenarioDef } from './schema.ts';
import { assembleStartKit, startKitOrder } from './startState.ts';

interface StartIssue {
  id: string;
  path: string;
  message: string;
}

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

const kitIssues = (registry: Registry, start: StartDef, fail: (path: string, message: string) => void): void => {
  const paths = new Map(start.kit.map((entry, index) => [entry, `.kit[${index}]`]));
  const ordered = startKitOrder(start.kit, (entry, suffix, message) => fail(`${paths.get(entry)}${suffix}`, message));
  if (!ordered) {
    return;
  }
  const parents = new Map(start.kit.map((entry) => [entry.id, entry]));
  const hands = new Set<string>();
  let valid = true;
  const report = (path: string, message: string): void => {
    valid = false;
    fail(path, message);
  };
  start.kit.forEach((entry, index) => {
    const path = `.kit[${index}]`;
    if (!registry.items.has(entry.item)) {
      report(`${path}.item`, `no item "${entry.item}"`);
    }
    if (entry.cartridges !== undefined) {
      const reason = magazineContentsReason(registry, entry.item, entry.cartridges);
      if (reason) {
        report(`${path}.cartridges`, reason);
      }
    }
    if (entry.cylinder !== undefined) {
      try {
        const item = new ItemFactory().create(registry, entry.item, entry.count);
        setInitialCylinder(registry, item, entry.cylinder);
      } catch (error) {
        report(`${path}.cylinder`, String(error));
      }
    }
    destinationIssues(registry, entry, { parents, hands }, (suffix, message) => report(`${path}${suffix}`, message));
  });
  if (!valid) {
    return;
  }
  const items = assembleStartKit(new Inventory(registry), ordered, (entry, reason) =>
    fail(`${paths.get(entry)}.destination`, String(reason)),
  );
  if (!items) {
    return;
  }
  const worn = new Set<string>();
  for (const entry of ordered) {
    const item = items.get(entry.id)!;
    const path = paths.get(entry)!;
    litIssue(registry, entry, item, (message) => fail(`${path}.lit`, message));
    if (entry.destination.kind !== 'worn') {
      continue;
    }
    const slot = wornSlotOf(registry, item);
    const reason = slot === undefined ? 'item has no worn destination' : wornOccupancyIssue(registry, slot, item);
    if (reason) {
      fail(`${path}.destination`, reason);
    } else if (slot !== undefined) {
      if (worn.has(slot)) {
        fail(`${path}.destination`, `worn slot "${slot}" is already assigned`);
      }
      worn.add(slot);
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
    const fail = (path: string, message: string): void => {
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
