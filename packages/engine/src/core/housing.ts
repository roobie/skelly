// Housing slots (`packages/deadvox/docs/holdout.md`, "Supplies and progression"): the parts a placed piece holds.
// Part state is lazy (`packages/deadvox/docs/decisions/0011-lazy-part-state.md`, "Decision"): an untouched slot is
// computed from the world seed, the piece's authored placement and the slot, and only a slot a simulation event
// changed is stored, as an override its owner, `BlockEntities`, writes.
import { Rng } from '../math.ts';
import type { Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import type { ContentSection, PartBlueprintDef } from './schema.ts';

type SlotDef = PartBlueprintDef['slots'][number];

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

/** The part an untouched slot holds, from identity alone, so every observer in any order computes the same part. */
export const baselinePart = (
  seed: number,
  assembly: { readonly type: string; readonly origin: Readonly<Vec3> },
  slot: SlotDef,
): HousingPart | undefined => {
  if (!slot.initial) {
    return undefined;
  }
  const [low, high] = slot.initial.condition;
  const stream = Rng.stream(seed, `housing:${assembly.type}:${assembly.origin.join(',')}:${slot.id}`);
  return Object.freeze({ type: slot.initial.item, condition: stream.range(low, high) });
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

/** A slot accepts only real items, and its initial part is one it accepts. */
const slotIssues = (registry: Registry, slot: SlotDef, at: string): Omit<HousingIssue, 'section' | 'id'>[] => [
  ...slot.accepts.flatMap((type, entry) =>
    registry.items.has(type) ? [] : [{ path: `${at}.accepts[${entry}]`, message: `no item "${type}"` }],
  ),
  ...(slot.initial && !slot.accepts.includes(slot.initial.item)
    ? [
        {
          path: `${at}.initial.item`,
          message: `slot "${slot.id}" does not accept its initial part "${slot.initial.item}"`,
        },
      ]
    : []),
];

/** Blueprint slots are sound, and a parts route names a real blueprint. */
export const housingContentIssues = (registry: Registry): HousingIssue[] => {
  const issues: HousingIssue[] = [];
  for (const blueprint of registry.partBlueprints.values()) {
    for (const [index, slot] of blueprint.slots.entries()) {
      for (const issue of slotIssues(registry, slot, `.slots[${index}]`)) {
        issues.push({ section: 'partBlueprints', id: blueprint.id, ...issue });
      }
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
  }
  return issues;
};
