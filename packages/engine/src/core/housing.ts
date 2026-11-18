// Housing slots (`packages/deadvox/docs/holdout.md`, "Supplies and progression"): the parts a placed piece holds.
// Part state is lazy (`packages/deadvox/docs/decisions/0011-lazy-part-state.md`, "Decision"): an untouched slot is
// computed from the world seed, the piece's authored placement and the slot, and only a slot a simulation event
// changed is stored, as an override its owner, `BlockEntities`, writes.
import { Rng } from '../math.ts';
import type { Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import type { ContentSection, FurnitureDef, PartBlueprintDef } from './schema.ts';

type SlotDef = PartBlueprintDef['slots'][number];
export type PartRequirementDef = NonNullable<NonNullable<FurnitureDef['power']>['requires']>[number];

/** Why a required part stops its source: no part in the slot, a type the requirement doesn't name, or too worn. */
export type PartFailureCause = 'absent' | 'incompatible' | 'insufficient';

export interface PartFailure {
  readonly slot: string;
  readonly cause: PartFailureCause;
}

/**
 * Why one required part fails, if it does. Ruin is condition 0, so an unauthored minimum is the least condition above
 * it: one comparison covers both, and content alone chooses whether a part fails before ruin.
 */
export const partFailure = (
  requirement: PartRequirementDef,
  part: Pick<HousingPart, 'type' | 'condition'> | undefined,
): PartFailureCause | undefined => {
  if (!part) {
    return 'absent';
  }
  if (!requirement.parts.includes(part.type)) {
    return 'incompatible';
  }
  return part.condition >= (requirement.minimum ?? Number.MIN_VALUE) ? undefined : 'insufficient';
};

/**
 * The required parts a housing fails, read from its readonly view (`BlockEntities.housingView`), so asking never
 * materialises a part or changes its condition.
 */
export const requirementFailures = (
  view: readonly HousingSlotView[],
  requires: readonly PartRequirementDef[],
): PartFailure[] =>
  requires.flatMap((requirement) => {
    const cause = partFailure(requirement, view.find(({ slot }) => slot === requirement.slot)?.part);
    return cause ? [{ slot: requirement.slot, cause }] : [];
  });

/** One slot that left its baseline: the part now in it, or none once its part was removed. */
export interface HousingOverride<Node> {
  readonly slot: string;
  readonly item?: Node;
}

/** A slot's part as readers see it; only a part an event materialised has a `uid`. */
export interface HousingPart {
  readonly type: string;
  readonly condition: number;
  readonly uid?: number;
}

/** One slot as readers see it; no part means an empty slot. */
export interface HousingSlotView {
  readonly slot: string;
  readonly part?: HousingPart;
}

interface HousingIssue {
  readonly section: ContentSection;
  readonly id: string;
  readonly path: string;
  readonly message: string;
}

/** The blueprint a kind of furniture houses its parts by, if its take-apart route is a parts blueprint. */
export const housingBlueprint = (registry: Registry, furniture: string): PartBlueprintDef | undefined => {
  const id = registry.furniture.get(furniture)?.takeApart?.parts;
  return id === undefined ? undefined : registry.partBlueprints.get(id);
};

interface Assembly {
  readonly type: string;
  readonly origin: Readonly<Vec3>;
}

/** The slot a placement's seeded failure falls on, if its blueprint has one; its own stream, apart from the slots'. */
export const failedSlot = (seed: number, assembly: Assembly, blueprint: PartBlueprintDef): string | undefined => {
  const among = blueprint.failure?.among;
  if (!among) {
    return undefined;
  }
  const stream = Rng.stream(seed, `housing-failure:${assembly.type}:${assembly.origin.join(',')}`);
  return among[stream.int(0, among.length - 1)];
};

/** The part an untouched slot holds, from identity alone, so every observer in any order computes the same part. */
export const baselinePart = (
  seed: number,
  assembly: Assembly,
  blueprint: PartBlueprintDef,
  slot: SlotDef,
): HousingPart | undefined => {
  const seeded = failedSlot(seed, assembly, blueprint) === slot.id ? slot.failed : slot.initial;
  if (!seeded) {
    return undefined;
  }
  const [low, high] = seeded.condition;
  const stream = Rng.stream(seed, `housing:${assembly.type}:${assembly.origin.join(',')}:${slot.id}`);
  return Object.freeze({ type: seeded.item, condition: stream.range(low, high) });
};

/** Whether a slot takes an item: one instance of an accepted type. */
export const slotAccepts = (slot: SlotDef, item: { readonly type: string; readonly count: number }): boolean =>
  item.count === 1 && slot.accepts.includes(item.type);

/** Why saved overrides cannot belong to a kind of furniture: unknown, repeated or out-of-order slots, or unfit parts. */
export const housingOverridesIssue = (
  registry: Registry,
  furniture: string,
  overrides: readonly HousingOverride<{ readonly type: string; readonly count: number }>[],
): string | undefined => {
  const slots = housingBlueprint(registry, furniture)?.slots;
  if (!slots) {
    return `"${furniture}" has no housing slots`;
  }
  let previous = -1;
  for (const { slot, item } of overrides) {
    const index = slots.findIndex(({ id }) => id === slot);
    if (index <= previous) {
      return `housing slot "${slot}" is unknown, repeated or out of blueprint order`;
    }
    if (item && !slotAccepts(slots[index]!, item)) {
      return `housing slot "${slot}" does not accept "${item.type}"`;
    }
    previous = index;
  }
  return undefined;
};

type LocalIssue = Omit<HousingIssue, 'section' | 'id'>;

/** A slot accepts only real items, and its seeded parts are ones it accepts; only a failure slot has a failed part. */
const slotIssues = (registry: Registry, blueprint: PartBlueprintDef, slot: SlotDef, at: string): LocalIssue[] => [
  ...slot.accepts.flatMap((type, entry) =>
    registry.items.has(type) ? [] : [{ path: `${at}.accepts[${entry}]`, message: `no item "${type}"` }],
  ),
  ...(['initial', 'failed'] as const).flatMap((key) => {
    const part = slot[key]?.item;
    return part !== undefined && !slot.accepts.includes(part)
      ? [{ path: `${at}.${key}.item`, message: `slot "${slot.id}" does not accept its ${key} part "${part}"` }]
      : [];
  }),
  ...(slot.failed && !blueprint.failure?.among.includes(slot.id)
    ? [{ path: `${at}.failed`, message: `slot "${slot.id}" has a failed part but is not among the failure slots` }]
    : []),
];

/** A failure falls only on real slots. */
const failureIssues = (blueprint: PartBlueprintDef): LocalIssue[] =>
  (blueprint.failure?.among ?? []).flatMap((slot, index) =>
    blueprint.slots.some(({ id }) => id === slot)
      ? []
      : [{ path: `.failure.among[${index}]`, message: `no slot "${slot}" in the blueprint` }],
  );

/** Only these kinds produce (`packages/engine/src/core/power.ts`, `production`), so only they can need parts to. */
const PRODUCING_KINDS: readonly string[] = ['generator', 'solar', 'inexhaustible'];

/**
 * A requirement names a slot of the piece's blueprint and parts that slot accepts. Unless it is critical, its seeded
 * part must pass at the bottom of its condition range, so the authored critical failures are the only ones a world
 * can start with. The check is the predicate itself, which a higher condition cannot fail.
 */
const requirementIssues = (registry: Registry, furniture: FurnitureDef): LocalIssue[] => {
  const requires = furniture.power?.requires;
  if (!requires) {
    return [];
  }
  const blueprint = housingBlueprint(registry, furniture.id);
  const kind = registry.powerDevices.get(furniture.power!.device)?.kind;
  if (!blueprint || (kind !== undefined && !PRODUCING_KINDS.includes(kind))) {
    return [{ path: '.power.requires', message: 'only a producing source with a parts blueprint has required parts' }];
  }
  const { slots } = blueprint;
  const issues = requires.flatMap((requirement, index) => {
    const at = `.power.requires[${index}]`;
    const slot = slots.find(({ id }) => id === requirement.slot);
    if (!slot) {
      return [{ path: `${at}.slot`, message: `no slot "${requirement.slot}" in its parts blueprint` }];
    }
    const unfit = requirement.parts.flatMap((type, entry) =>
      slot.accepts.includes(type)
        ? []
        : [{ path: `${at}.parts[${entry}]`, message: `slot "${slot.id}" does not accept "${type}"` }],
    );
    const seeded = slot.initial && { type: slot.initial.item, condition: slot.initial.condition[0] };
    const cause = requirement.critical ? undefined : partFailure(requirement, seeded);
    return cause
      ? [...unfit, { path: at, message: `a non-critical requirement's seeded part can start ${cause}` }]
      : unfit;
  });
  return [...issues, ...seededFailureIssues(requires, slots, blueprint.failure?.among ?? [])];
};

/**
 * A seeded failure must be the one fault its placement starts with: each failure slot is held to a critical
 * requirement, its failed part fails one even at the top of its condition range, and its initial part passes them
 * all at the bottom of its range, so the failure is never masked and the other placements never start broken.
 */
const seededFailureIssues = (
  requires: readonly PartRequirementDef[],
  slots: readonly SlotDef[],
  among: readonly string[],
): LocalIssue[] =>
  among.flatMap((id) => {
    const slot = slots.find((entry) => entry.id === id);
    const held = requires.filter((requirement) => requirement.slot === id);
    if (!slot) {
      return [];
    }
    if (!held.some(({ critical }) => critical)) {
      return [{ path: '.power.requires', message: `failure slot "${id}" has no critical requirement` }];
    }
    const failed = slot.failed && { type: slot.failed.item, condition: slot.failed.condition[1] };
    const initial = slot.initial && { type: slot.initial.item, condition: slot.initial.condition[0] };
    return [
      ...(held.some((requirement) => requirement.critical && partFailure(requirement, failed))
        ? []
        : [{ path: '.power.requires', message: `failure slot "${id}"'s failed part can pass` }]),
      ...(held.every((requirement) => !partFailure(requirement, initial))
        ? []
        : [{ path: '.power.requires', message: `failure slot "${id}"'s initial part can start failed` }]),
    ];
  });

/** Blueprint slots are sound, a parts route names a real blueprint, and required parts fit their slots. */
export const housingContentIssues = (registry: Registry): HousingIssue[] => {
  const issues: HousingIssue[] = [];
  for (const blueprint of registry.partBlueprints.values()) {
    const local = [
      ...blueprint.slots.flatMap((slot, index) => slotIssues(registry, blueprint, slot, `.slots[${index}]`)),
      ...failureIssues(blueprint),
    ];
    for (const issue of local) {
      issues.push({ section: 'partBlueprints', id: blueprint.id, ...issue });
    }
  }
  for (const furniture of registry.furniture.values()) {
    const parts = furniture.takeApart?.parts;
    if (parts !== undefined && !registry.partBlueprints.has(parts)) {
      issues.push({
        section: 'furniture',
        id: furniture.id,
        path: '.takeApart.parts',
        message: `no part blueprint "${parts}"`,
      });
    }
    for (const issue of requirementIssues(registry, furniture)) {
      issues.push({ section: 'furniture', id: furniture.id, ...issue });
    }
  }
  return issues;
};
