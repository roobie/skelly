// Rolling loot tables (`DESIGN.md`, "Loot"). A table rolls a number of times; each roll
// picks an entry by weight: an item (with a count and condition range), a nested
// table (rolled in full), or nothing. What comes out is a list of items to make, not
// instances, so worldgen stays free of item uids.

import { array, check, type InferOutput, literal, optional, picklist, pipe, strictObject } from 'valibot';
import type { ItemDef, LootEntry, Registry } from './content.ts';
import { toChunk, type Vec3 } from './coords.ts';
import { type PaperMapCoverage, paperMapAt } from './paperMap.ts';
import { Rng } from './random.ts';
import { BLOCK_SIZE } from './scale.ts';
import type { FixedLootItemDef } from './schema.ts';

const distinct = <T>(values: T[]): boolean => new Set(values).size === values.length;

export const UsageSchema = pipe(
  array(picklist(['Residential', 'Industrial', 'Medical', 'Hunting', 'Police', 'Military', 'Infected'])),
  check(distinct, 'usage tags must be unique'),
);
export const LOOT_TIERS = ['Tier1', 'Tier2', 'Tier3', 'Tier4'] as const;
export const LootTierSchema = picklist(LOOT_TIERS);
export const ItemEconomySchema = strictObject({
  usage: UsageSchema,
  tiers: pipe(array(LootTierSchema), check(distinct, 'tiers must be unique')),
});
/** `lowerTiers` makes the context roll its tier and every tier beneath it, so a deeper area adds a tier and keeps the rest. */
export const LootContextSchema = strictObject({
  usage: UsageSchema,
  tier: LootTierSchema,
  lowerTiers: optional(literal(true)),
});

export type ItemEconomy = InferOutput<typeof ItemEconomySchema>;
export type LootContext = InferOutput<typeof LootContextSchema>;
/** The part of a loot context an enclosing assembly hands down to the pieces inside it. */
export type LootDepth = Pick<LootContext, 'tier' | 'lowerTiers'>;
type UsageTag = ItemEconomy['usage'][number];

export const lootDepthOf = ({ tier, lowerTiers }: LootContext): LootDepth => ({
  tier,
  ...(lowerTiers === true ? { lowerTiers } : {}),
});

// An exact point tier must not inherit a building's lower-tier range.
export const withLootDepth = (
  context: LootContext,
  depth: LootDepth | undefined,
  tier?: LootContext['tier'],
): LootContext => {
  const resolved = tier === undefined ? depth : { tier };
  return resolved === undefined ? context : { usage: context.usage, ...resolved };
};

const tierReaches = (context: LootContext, tier: (typeof LOOT_TIERS)[number]): boolean =>
  context.lowerTiers === true ? LOOT_TIERS.indexOf(tier) <= LOOT_TIERS.indexOf(context.tier) : tier === context.tier;

export const economyEligible = (economy: ItemEconomy, context: LootContext): boolean =>
  economy.tiers.some((tier) => tierReaches(context, tier)) &&
  economy.usage.some((usage) => context.usage.includes(usage));

export const militaryOnlyEconomy = (economy: ItemEconomy): boolean =>
  economy.usage.length === 1 && economy.usage[0] === 'Military';

type LootSupply =
  | { readonly kind: 'table'; readonly table: string }
  | { readonly kind: 'fixed'; readonly items: readonly FixedLootItemDef[]; readonly table?: string | undefined }
  | { readonly kind: 'empty' };

export interface LootSpawnPoint {
  readonly id: string;
  readonly channel: 'container' | 'surface' | 'corpse' | 'ground';
  readonly position: Vec3;
  readonly destination: Vec3;
  readonly context: LootContext;
  readonly supply: LootSupply;
  readonly required: boolean;
  readonly fixture?: true;
}

export interface LootPointSource {
  readonly site: string;
  readonly building: string;
  /** Include the local vertical coordinate so stress-test storeys cannot alias. */
  readonly anchor: Vec3;
  readonly channel: LootSpawnPoint['channel'];
  readonly position: Vec3;
  readonly destination: Vec3;
  readonly context: LootContext;
  readonly usage?: readonly UsageTag[];
  readonly supply: LootSupply;
  readonly required: boolean;
  readonly fixture?: true;
}

export const lootSpawnPoint = (source: LootPointSource): LootSpawnPoint => ({
  // Tuple encoding prevents separators inside authored IDs from aliasing another source.
  id: JSON.stringify([source.site, source.building, source.anchor, source.channel]),
  channel: source.channel,
  position: [...source.position],
  destination: [...source.destination],
  context: {
    usage: source.usage === undefined ? [...source.context.usage] : [...source.usage],
    tier: source.context.tier,
    ...(source.context.lowerTiers === true ? { lowerTiers: true as const } : {}),
  },
  supply: source.supply,
  required: source.required,
  ...(source.fixture === true ? { fixture: true } : {}),
});

export const lootPointStream = (seed: number, point: LootSpawnPoint): Rng => Rng.stream(seed, `loot:${point.id}`);

export const lootPointsByColumn = (
  sources: readonly LootPointSource[],
): ReadonlyMap<string, readonly LootSpawnPoint[]> => {
  const columns = new Map<string, LootSpawnPoint[]>();
  const ids = new Set<string>();
  for (const source of sources) {
    const point = lootSpawnPoint(source);
    if (ids.has(point.id)) {
      throw new Error(`duplicate loot spawn point ${point.id}`);
    }
    ids.add(point.id);
    const key = `${toChunk(point.destination[0])},${toChunk(point.destination[2])}`;
    const points = columns.get(key) ?? [];
    points.push(point);
    columns.set(key, points);
  }
  return columns;
};

const installedLootTypes = (
  registry: Registry,
  item: ItemDef,
  overrides: Readonly<Record<string, string>>,
): (string | undefined)[] => {
  const attachments = registry.models.get(item.model ?? '')?.gun?.attachments ?? [];
  const children = attachments
    .filter((attachment) => overrides[attachment.mountedAt] === undefined)
    .map(
      (attachment) =>
        [...registry.items.values()].find(
          (entry) => registry.models.get(entry.model ?? '')?.gun?.attachment?.id === attachment.id,
        )?.id,
    );
  if (item.light?.power && overrides.battery === undefined) {
    children.push(item.light.power.battery);
  }
  return [...Object.values(overrides), ...children];
};

/** An item no loot context admits: it exists only where content places it by hand. */
export const neverSpawns = (economy: ItemEconomy): boolean => economy.tiers.length === 0 || economy.usage.length === 0;

/** Why one item is refused; authored placement also admits an item that never spawns, but not craft escrow. */
const admissionIssue = (item: ItemDef, context: LootContext, placed: boolean): string | undefined => {
  if (placed && item.workInProgress) {
    return `"${item.id}" is craft escrow, which only a craft creates`;
  }
  return economyEligible(item.economy, context) || (placed && neverSpawns(item.economy))
    ? undefined
    : `"${item.id}" is outside the source loot context`;
};

const typeIssue = (
  registry: Registry,
  root: { readonly type: string; readonly fitted: Readonly<Record<string, string>> },
  context: LootContext,
  placed: boolean,
): string | undefined => {
  const seen = new Set<string>();
  const pending = [root];
  while (pending.length > 0) {
    const candidate = pending.pop()!;
    if (seen.has(candidate.type)) {
      continue;
    }
    seen.add(candidate.type);
    const item = registry.items.get(candidate.type);
    if (!item) {
      return `no item "${candidate.type}"`;
    }
    const refused = admissionIssue(item, context, placed);
    if (refused !== undefined) {
      return refused;
    }
    for (const child of installedLootTypes(registry, item, candidate.fitted)) {
      if (child === undefined) {
        return 'no item for a default attachment';
      }
      pending.push({ type: child, fitted: {} });
    }
  }
  return undefined;
};

/** Whether random loot may roll the item: its economy must reach the context. */
export const lootTypeIssue = (
  registry: Registry,
  type: string,
  context: LootContext,
  fitted: Readonly<Record<string, string>> = {},
): string | undefined => typeIssue(registry, { type, fitted }, context, false);

/** Whether authored content may place the item: loot admission, or an item that never spawns. */
export const placedTypeIssue = (
  registry: Registry,
  type: string,
  context: LootContext,
  fitted: Readonly<Record<string, string>> = {},
): string | undefined => typeIssue(registry, { type, fitted }, context, true);

export interface Rolled {
  type: string;
  count: number;
  /** Coverage resolved from the immutable loot source, before an item gets a UID. */
  paperMap?: PaperMapCoverage;
  /** 0 to 1, rounded to hundredths so identical rolls stack. */
  condition: number;
  /** Item types fitted to each one, by slot id; only authored fixed loot sets them. */
  fitted?: Readonly<Record<string, string>>;
  /** Battery charge as a share of full; only authored fixed loot sets it. */
  charge?: number;
  craftedLiquids?: FixedLootItemDef['craftedLiquids'];
  liquidContents?: FixedLootItemDef['liquidContents'];
}

const pick = <T extends { weight: number }>(entries: readonly T[], rng: Rng): T => {
  if (entries.length === 1) {
    return entries[0]!;
  }
  const total = entries.reduce((sum, e) => sum + e.weight, 0);
  let r = rng.next() * total;
  for (const entry of entries) {
    r -= entry.weight;
    if (r < 0) {
      return entry;
    }
  }
  return entries.at(-1)!;
};

/**
 * Items for one count of an entry: a stackable item comes as stacks of up to its
 * limit, anything else as separate items.
 */
const itemsOf = (registry: Registry, { type, count, condition, paperMap }: Rolled): Rolled[] => {
  const limit = registry.items.get(type)?.stack ?? 1;
  const out: Rolled[] = [];
  for (let left = count; left > 0; left -= limit) {
    out.push({ type, count: Math.min(left, limit), condition, ...(paperMap === undefined ? {} : { paperMap }) });
  }
  return out;
};

const mapCoverage = (
  item: ItemDef | undefined,
  point: LootSpawnPoint,
  blockSize: number,
): PaperMapCoverage | undefined =>
  item?.paperMap ? paperMapAt(point.position[0] * blockSize, point.position[2] * blockSize) : undefined;

const withMapCoverage = (registry: Registry, point: LootSpawnPoint, blockSize: number, rolled: Rolled): Rolled => {
  const paperMap = mapCoverage(registry.items.get(rolled.type), point, blockSize);
  return { ...rolled, ...(paperMap === undefined ? {} : { paperMap }) };
};

export interface WeightedCandidate {
  readonly type?: string | undefined;
  readonly weight: number;
  readonly fitted?: Readonly<Record<string, string>> | undefined;
  /** Authored by hand rather than rolled from a table, so an item that never spawns is admitted. */
  readonly placed?: true | undefined;
}

export const admittedCandidates = (
  registry: Registry,
  point: LootSpawnPoint,
  candidates: readonly WeightedCandidate[],
) =>
  candidates.filter(
    (candidate) =>
      candidate.type === undefined ||
      (registry.items.has(candidate.type) &&
        ((point.fixture && point.supply.kind === 'fixed') ||
          (candidate.placed === true ? placedTypeIssue : lootTypeIssue)(
            registry,
            candidate.type,
            point.context,
            candidate.fitted,
          ) === undefined)),
  );

/** All item-type choices meet here; explicit fixture stock is not world-economy supply. */
export const selectLootType = (
  registry: Registry,
  point: LootSpawnPoint,
  candidates: readonly WeightedCandidate[],
  rng: Rng,
): string | undefined => {
  const admitted = admittedCandidates(registry, point, candidates);
  return admitted.length === 0 ? undefined : pick(admitted, rng).type;
};

interface RollContext {
  readonly point: LootSpawnPoint;
  readonly rng: Rng;
  readonly blockSize: number;
}

const fixedItems = (registry: Registry, items: readonly FixedLootItemDef[], context: RollContext): Rolled[] =>
  items.flatMap(({ item, count = 1, condition = 1, fitted, charge, craftedLiquids, liquidContents }) => {
    const type = selectLootType(
      registry,
      context.point,
      [{ type: item, weight: 1, fitted, placed: true }],
      context.rng,
    );
    if (type === undefined) {
      if (context.point.required) {
        throw new Error(`required loot ${item} is outside source ${context.point.id}`);
      }
      return [];
    }
    return itemsOf(
      registry,
      withMapCoverage(registry, context.point, context.blockSize, { type, count, condition }),
    ).map((rolled) => ({
      ...rolled,
      ...(fitted ? { fitted } : {}),
      ...(charge === undefined ? {} : { charge }),
      ...(craftedLiquids === undefined ? {} : { craftedLiquids: craftedLiquids.map((amount) => ({ ...amount })) }),
      ...(liquidContents === undefined ? {} : { liquidContents: { ...liquidContents } }),
    }));
  });

const leafCandidates = (entries: readonly LootEntry[]): WeightedCandidate[] =>
  entries.filter((entry) => entry.table === undefined).map((entry) => ({ type: entry.item, weight: entry.weight }));

const tableEntry = (
  registry: Registry,
  point: LootSpawnPoint,
  entries: readonly LootEntry[],
  rng: Rng,
): LootEntry | undefined => {
  const leaves = leafCandidates(entries);
  const branches = entries.filter((entry) => entry.table !== undefined);
  const leafWeight = admittedCandidates(registry, point, leaves).reduce((sum, entry) => sum + entry.weight, 0);
  if (branches.length > 0) {
    // Grouping leaf weights preserves nested-table roll multiplicity without choosing any item outside the selector.
    const branch = pick<LootEntry>(
      [...branches, ...(leafWeight > 0 ? [{ weight: leafWeight, nothing: true }] : [])],
      rng,
    );
    if (branch.table !== undefined) {
      return branch;
    }
  }
  const type = selectLootType(registry, point, leaves, rng);
  if (type === undefined) {
    return;
  }
  return pick(
    entries.filter((entry) => entry.item === type),
    rng,
  );
};

const rollTable = (registry: Registry, tableId: string, context: RollContext): Rolled[] => {
  const table = registry.loot.get(tableId);
  if (!table) {
    return [];
  }
  const out: Rolled[] = [];
  const rolls = context.rng.int(table.rolls[0], table.rolls[1]);
  for (let i = 0; i < rolls; i++) {
    const entry = tableEntry(registry, context.point, table.entries, context.rng);
    if (entry?.table !== undefined) {
      out.push(...rollTable(registry, entry.table, context));
    } else if (entry?.item !== undefined) {
      const count = entry.count ? context.rng.int(entry.count[0], entry.count[1]) : 1;
      const condition = entry.condition
        ? Math.round(context.rng.range(entry.condition[0], entry.condition[1]) * 100) / 100
        : 1;
      out.push(
        ...itemsOf(
          registry,
          withMapCoverage(registry, context.point, context.blockSize, { type: entry.item, count, condition }),
        ),
      );
    }
  }
  return out;
};

/** A point's loot, split into the fixed items it must deliver and what its table rolled. */
export const rollLootParts = (
  registry: Registry,
  point: LootSpawnPoint,
  rng: Rng,
  blockSize = BLOCK_SIZE,
): { fixed: Rolled[]; rolled: Rolled[] } => {
  const context = { point, rng, blockSize };
  switch (point.supply.kind) {
    case 'empty':
      return { fixed: [], rolled: [] };
    case 'table':
      return { fixed: [], rolled: rollTable(registry, point.supply.table, context) };
    case 'fixed': {
      const fixed = fixedItems(registry, point.supply.items, context);
      return {
        fixed: point.required ? fixed : [],
        rolled: [
          ...(point.required ? [] : fixed),
          ...(point.supply.table === undefined ? [] : rollTable(registry, point.supply.table, context)),
        ],
      };
    }
    default:
      throw new Error('Unknown loot supply');
  }
};

export const rollLoot = (registry: Registry, point: LootSpawnPoint, rng: Rng, blockSize = BLOCK_SIZE): Rolled[] => {
  const { fixed, rolled } = rollLootParts(registry, point, rng, blockSize);
  return [...fixed, ...rolled];
};

export const corpseLootPoint = (table: string, id: number, pos: Vec3): LootSpawnPoint => ({
  id: `corpse:${id}`,
  channel: 'corpse',
  position: [...pos],
  destination: [...pos],
  context: { usage: ['Infected'], tier: 'Tier1' },
  supply: { kind: 'table', table },
  required: false,
});
