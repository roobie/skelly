// A stowage slot seats one item by a word it accepts (`packages/skelly-assets/docs/decisions/0017-stowage-slots.md`).

import type { Registry } from './content.ts';
import type { Item } from './items.ts';

/** The words an item type stows by: the standards of its model's seats. */
const seatWords = (registry: Registry, type: string): readonly string[] => {
  const model = registry.items.get(type)?.model;
  return (
    (model === undefined ? undefined : registry.models.get(model)?.stowage?.seats)?.map(({ standard }) => standard) ??
    []
  );
};

/** The slot `slot` of an item type's model, if its model lists one. */
export const stowageSlot = (registry: Registry, ownerType: string, slot: string) => {
  const model = registry.items.get(ownerType)?.model;
  return (model === undefined ? undefined : registry.models.get(model)?.stowage?.slots)?.find(({ id }) => id === slot);
};

/** Why a slot will not seat an item: something already sits there, or the item has no seat the slot accepts. */
export type SlotRefusal = 'slotTaken' | 'slotNotFor';

/**
 * Why the slot `slot.id` of an item type `slot.owner` will not take `incoming.count` of `incoming.type` beside what it
 * holds. A slot seats a single item. Whether the item stays inside the slot's envelope is not checked, since the engine
 * keeps no item bounds.
 */
export const slotRefusal = (
  registry: Registry,
  slot: { readonly owner: string; readonly id: string },
  incoming: Pick<Item, 'type' | 'count'>,
  inside: readonly Pick<Item, 'count'>[],
): SlotRefusal | undefined => {
  const accepts = stowageSlot(registry, slot.owner, slot.id)?.accepts ?? [];
  if (!seatWords(registry, incoming.type).some((word) => accepts.includes(word))) {
    return 'slotNotFor';
  }
  return incoming.count + inside.reduce((sum, { count }) => sum + count, 0) > 1 ? 'slotTaken' : undefined;
};
