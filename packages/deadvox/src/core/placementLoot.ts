import type { Registry } from './content.ts';
import { couldFit, ItemFactory } from './items.ts';
import { type LootContext, lootTypeIssue, withLootDepth } from './loot.ts';
import { slotsReason } from './magazine.ts';
import { groundPileIssue } from './pileBound.ts';
import { reachTuning } from './reach.ts';
import type { FixedLootItemDef, FixedLootOverrideDef } from './schema.ts';
import { type CompiledTemplate, type Placement, placedPieces } from './templates.ts';

const fixedItemIssue = (registry: Registry, fixed: FixedLootItemDef, context: LootContext): string | undefined => {
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
  return lootTypeIssue(registry, fixed.item, context, fixed.fitted);
};

// Furnishing leaves out an item that fits no pocket, so a fixed item that can't fit even an empty one would vanish.
const pocketFitIssue = (
  registry: Registry,
  fixed: FixedLootItemDef,
  furniture: string,
  pockets: readonly { readonly grid: readonly [number, number] }[] | undefined,
): string | undefined => {
  if (fixed.placement === 'surface' || !pockets) {
    return undefined;
  }
  const item = new ItemFactory().create(registry, fixed.item);
  return pockets.some(({ grid: [w, h] }) => couldFit(registry, { w, h }, item))
    ? undefined
    : `"${fixed.item}" fits no pocket of "${furniture}"`;
};

const groundPileStateCap = (registry: Registry): number => reachTuning(registry).groundPileStateCap;

type GroundPoint = NonNullable<CompiledTemplate['groundLoot']>[number];

const sourceIssues = (
  registry: Registry,
  { supply }: GroundPoint,
  sourceContext: LootContext,
  path: string,
): [string, string][] => {
  const issues: [string, string][] = [];
  if ('table' in supply && supply.table !== undefined && !registry.loot.has(supply.table)) {
    issues.push([`${path}.table`, `no loot table "${supply.table}"`]);
  }
  if (supply.kind === 'fixed') {
    for (const [itemIndex, fixed] of supply.items.entries()) {
      const issue = fixedItemIssue(registry, fixed, sourceContext);
      if (issue !== undefined) {
        issues.push([`${path}.items[${itemIndex}].item`, issue]);
      }
    }
  }
  return issues;
};

/** A palette piece's own stock: container items need a container, and every item passes admission. */
export const pieceItemIssues = (
  registry: Registry,
  compiled: CompiledTemplate,
  context: LootContext = compiled.lootContext,
): [string, string][] => {
  const issues: [string, string][] = [];
  for (const [index, piece] of compiled.pieces.entries()) {
    const path = `.pieces[${index}].items`;
    const items = piece.items ?? [];
    if (items.some((item) => item.placement !== 'surface') && !registry.furniture.get(piece.furniture)?.container) {
      issues.push([path, `furniture "${piece.furniture}" at ${piece.pos.join(',')} has no container`]);
    }
    for (const [itemIndex, fixed] of items.entries()) {
      const issue = fixedItemIssue(
        registry,
        fixed,
        withLootDepth({ ...context, usage: piece.lootUsage ?? context.usage }, piece.lootDepth),
      );
      if (issue !== undefined) {
        issues.push([`${path}[${itemIndex}].item`, issue]);
      }
    }
  }
  return issues;
};

const groundPointIssues = (
  registry: Registry,
  point: GroundPoint,
  sourceContext: LootContext,
  path: string,
): [string, string][] => {
  const issues = sourceIssues(registry, point, sourceContext, path);
  if (point.supply.kind === 'empty' || issues.length > 0) {
    return issues;
  }
  const overfill = groundPileIssue(registry, point.supply, sourceContext, groundPileStateCap(registry));
  return overfill === undefined ? [] : [[path, overfill]];
};

export const groundLootSupplyIssues = (
  registry: Registry,
  compiled: CompiledTemplate,
  context: LootContext = compiled.lootContext,
): [string, string][] =>
  (compiled.groundLoot ?? []).flatMap((point, index) =>
    groundPointIssues(
      registry,
      point,
      withLootDepth({ ...context, usage: point.lootUsage ?? context.usage }, point.lootDepth),
      `.groundLoot[${index}].supply`,
    ),
  );

export const placementLootIssues = (
  { registry, context }: { registry: Registry; context: LootContext },
  compiled: CompiledTemplate,
  overrides: readonly FixedLootOverrideDef[],
  path: string,
): [string, string][] => {
  const issues = [
    ...groundLootSupplyIssues(registry, compiled, context),
    ...pieceItemIssues(registry, compiled, context),
  ];
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
    const pockets = registry.furniture.get(piece.furniture)?.container?.pockets;
    if (override.items.some((item) => item.placement !== 'surface') && !pockets) {
      issues.push([`${at}.at`, `furniture at ${key} has no container`]);
    }
    for (const [itemIndex, fixed] of override.items.entries()) {
      const issue =
        fixedItemIssue(
          registry,
          fixed,
          withLootDepth(
            { ...context, usage: override.lootUsage ?? piece.lootUsage ?? context.usage },
            piece.lootDepth,
          ),
        ) ?? pocketFitIssue(registry, fixed, piece.furniture, pockets);
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

export const placementKeyLoot = (sources: readonly PlacementLootSource[]): Map<string, Set<string>> => {
  const keys = new Map<string, Set<string>>();
  for (const { placement, fixedLoot = [] } of sources) {
    const placed = placedPieces(placement);
    for (const override of fixedLoot) {
      const index = placement.template.pieces.findIndex((piece) => piece.pos.join(',') === override.at.join(','));
      if (index < 0) {
        throw new Error(`Missing fixed loot anchor ${override.at.join(',')} in ${placement.template.id}`);
      }
      const items = override.items.filter((item) => item.key).map((item) => item.item);
      if (items.length > 0) {
        keys.set(placed[index]!.pos.join(','), new Set(items));
      }
    }
  }
  return keys;
};
