import type { Registry } from './content.ts';
import { ItemFactory } from './items.ts';
import { fixedItems, type Rolled } from './loot.ts';
import { militaryLootItems, slotsReason } from './magazine.ts';
import type { FixedLootItemDef, FixedLootOverrideDef } from './schema.ts';
import type { FurnitureSpawn } from './site.ts';
import { type CompiledTemplate, type Placement, placedPieces } from './templates.ts';

const fixedItemIssue = (
  registry: Registry,
  military: ReadonlySet<string>,
  fixed: FixedLootItemDef,
  source: { loot: string | undefined; militaryTemplate: boolean },
): string | undefined => {
  if (!registry.items.has(fixed.item)) {
    return `no item "${fixed.item}"`;
  }
  if (fixed.fitted) {
    const missing = Object.values(fixed.fitted).find((child) => !registry.items.has(child));
    if (missing !== undefined) {
      return `no fitted item "${missing}"`;
    }
    const host = new ItemFactory().create(registry, fixed.item);
    const issue = slotsReason(registry, fixed.item, {
      ...host.slots,
      ...Object.fromEntries(Object.entries(fixed.fitted).map(([slot, child]) => [slot, { type: child }])),
    });
    if (issue) {
      return issue;
    }
  }
  const militarySource =
    fixed.placement === 'surface' ? source.militaryTemplate : registry.loot.get(source.loot ?? '')?.military;
  if (!military.has(fixed.item) || militarySource) {
    return undefined;
  }
  return fixed.placement === 'surface'
    ? `"${fixed.item}" is military loot only; surface placement requires a military template`
    : `"${fixed.item}" is military loot only; place it where a "military" table rolls`;
};

export const placementLootIssues = (
  {
    registry,
    military = militaryLootItems(registry),
    militaryTemplate,
  }: { registry: Registry; military?: ReadonlySet<string>; militaryTemplate: boolean },
  compiled: CompiledTemplate,
  overrides: readonly FixedLootOverrideDef[],
  path: string,
): [string, string][] => {
  const issues: [string, string][] = [];
  const anchors = new Set<string>();
  for (const [index, override] of overrides.entries()) {
    const key = override.at.join(',');
    const at = `${path}[${index}]`;
    if (anchors.has(key)) {
      issues.push([at, `fixed loot anchor ${key} is used more than once`]);
    }
    anchors.add(key);
    const piece = compiled.pieces.find((candidate) => candidate.pos.join(',') === key);
    if (!piece) {
      issues.push([`${at}.at`, `no furniture anchor at ${key}`]);
      continue;
    }
    if (
      override.items.some((item) => item.placement !== 'surface') &&
      !registry.furniture.get(piece.furniture)?.container
    ) {
      issues.push([`${at}.at`, `furniture at ${key} has no container`]);
    }
    for (const [itemIndex, fixed] of override.items.entries()) {
      const issue = fixedItemIssue(registry, military, fixed, { loot: piece.loot, militaryTemplate });
      if (issue !== undefined) {
        issues.push([`${at}.items[${itemIndex}].item`, issue]);
      }
    }
  }
  return issues;
};

export interface PlacementLootSource {
  readonly placement: Placement;
  readonly fixedLoot?: readonly FixedLootOverrideDef[] | undefined;
}

interface PlacementLoot {
  fixedLoot: Map<string, Rolled[]>;
  fixedSurfaceLoot: Map<string, Rolled[]>;
  keyLoot: Map<string, Set<string>>;
}

const addPlacementLoot = (
  registry: Registry,
  { placement, fixedLoot: overrides = [] }: PlacementLootSource,
  { fixedLoot, fixedSurfaceLoot, keyLoot }: PlacementLoot,
): void => {
  const placed = placedPieces(placement);
  for (const override of overrides) {
    const index = placement.template.pieces.findIndex((piece) => piece.pos.join(',') === override.at.join(','));
    if (index < 0) {
      throw new Error(`Missing fixed loot anchor ${override.at.join(',')} in ${placement.template.id}`);
    }
    const anchor = placed[index]!.pos.join(',');
    const container = override.items.filter((item) => item.placement !== 'surface');
    const surface = override.items.filter((item) => item.placement === 'surface');
    if (container.length > 0) {
      fixedLoot.set(anchor, fixedItems(registry, container));
    }
    if (surface.length > 0) {
      fixedSurfaceLoot.set(anchor, fixedItems(registry, surface));
    }
    const keys = override.items.filter((item) => item.key).map((item) => item.item);
    if (keys.length > 0) {
      keyLoot.set(anchor, new Set(keys));
    }
  }
};

export const collectPlacementLoot = (registry: Registry, sources: readonly PlacementLootSource[]): PlacementLoot => {
  const loot: PlacementLoot = { fixedLoot: new Map(), fixedSurfaceLoot: new Map(), keyLoot: new Map() };
  for (const source of sources) {
    addPlacementLoot(registry, source, loot);
  }
  return loot;
};

export const applyPlacementLoot = (
  spawn: FurnitureSpawn,
  loot: ReturnType<typeof collectPlacementLoot>,
): FurnitureSpawn => {
  const anchor = spawn.spec.pos.join(',');
  const fixed = loot.fixedLoot.get(anchor);
  const surfaceLoot = loot.fixedSurfaceLoot.get(anchor);
  return {
    ...spawn,
    ...(fixed ? { loot: [...fixed, ...spawn.loot] } : {}),
    ...(surfaceLoot ? { surfaceLoot } : {}),
  };
};
