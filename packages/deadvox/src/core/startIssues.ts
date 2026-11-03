import { claimed } from './capabilities.ts';
import type { Registry } from './content.ts';
import { magazineContentsReason } from './magazine.ts';
import type { StartDef, StartKitEntry } from './schema/starts.ts';

interface StartIssue {
  id: string;
  path: string;
  message: string;
}

const destinationIssues = (
  entry: StartKitEntry,
  parents: ReadonlyMap<string, StartKitEntry>,
  hands: Set<string>,
  fail: (path: string, message: string) => void,
): void => {
  const { destination } = entry;
  if (destination.kind === 'hand') {
    if (hands.has(destination.role)) {
      fail('.destination.role', `hand "${destination.role}" is already assigned`);
    }
    hands.add(destination.role);
  } else if ((destination.kind === 'pocket' || destination.kind === 'slot') && !parents.has(destination.parent)) {
    fail('.destination.parent', `parent "${destination.parent}" must appear earlier in the kit`);
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
    destinationIssues(entry, parents, hands, (suffix, message) => fail(`${path}${suffix}`, message));
    parents.set(entry.id, entry);
  });
};

export const startIssues = (registry: Registry): StartIssue[] => {
  const issues: StartIssue[] = [];
  for (const start of registry.starts.values()) {
    const fail = (path: string, message: string): void => {
      issues.push({ id: start.id, path, message });
    };
    const scenario = registry.scenarios.get(start.site);
    if (!(scenario || registry.layouts.has(start.site))) {
      fail('.site', `no scenario or layout "${start.site}"`);
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
