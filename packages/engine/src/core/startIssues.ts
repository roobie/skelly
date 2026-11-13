import { claimed } from './capabilities.ts';
import { startReservationIssues } from './cityPlan.ts';
import type { Registry } from './content.ts';
import { GENERATED_SITES } from './generatedSites.ts';
import { ItemFactory, setInitialCylinder } from './items.ts';
import { knownItemSlot, magazineContentsReason } from './magazine.ts';
import { startFixedLootIssues } from './scenarioComposition.ts';
import { scenarioStartIssues } from './scenarioStart.ts';
import type { StartDef, StartKitEntry } from './schema/starts.ts';
import type { ScenarioDef } from './schema.ts';

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
      fail('.destination.parent', `parent "${destination.parent}" must appear earlier in the kit`);
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

const kitIssues = (registry: Registry, start: StartDef, fail: (path: string, message: string) => void): void => {
  const parents = new Map<string, StartKitEntry>();
  const hands = new Set<string>();
  start.kit.forEach((entry, index) => {
    const path = `.kit[${index}]`;
    if (parents.has(entry.id)) {
      fail(`${path}.id`, `duplicate kit entry "${entry.id}"`);
    }
    if (!registry.items.has(entry.item)) {
      fail(`${path}.item`, `no item "${entry.item}"`);
    }
    if (entry.cartridges !== undefined) {
      const reason = magazineContentsReason(registry, entry.item, entry.cartridges);
      if (reason) {
        fail(`${path}.cartridges`, reason);
      }
    }
    if (entry.cylinder !== undefined) {
      try {
        const item = new ItemFactory().create(registry, entry.item, entry.count);
        setInitialCylinder(registry, item, entry.cylinder);
      } catch (error) {
        fail(`${path}.cylinder`, String(error));
      }
    }
    destinationIssues(registry, entry, { parents, hands }, (suffix, message) => fail(`${path}${suffix}`, message));
    parents.set(entry.id, entry);
  });
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
    for (const id of Object.keys(start.skills)) {
      if (!registry.skills.has(id)) {
        fail(`.skills.${id}`, `no skill "${id}"`);
      }
    }
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
