// How one item instance looks (DESIGN.md, "One item, one look"): its own model, plus the models of the items it
// owns at their slots. Every view draws an item from this, never from its type alone, so a rifle looks the same in
// the hands and on the ground.

import type { Registry } from '../core/content.ts';
import type { Vec3 } from '../core/coords.ts';
import { defOf, type Item } from '../core/items.ts';

export interface ItemLookSlot {
  readonly slot: 'magazine';
  /** The slot frame in the base model's metres, with `turn` in XYZ degrees like a model's grip. */
  readonly at: Vec3;
  readonly turn: Vec3;
  /** The fitted item's model; absent while the slot is empty. */
  readonly model?: string;
}

export interface ItemLook {
  readonly model: string;
  readonly slots: readonly ItemLookSlot[];
  /** Equal exactly when two items draw the same. */
  readonly key: string;
}

/** The item's model with its fitted magazine's own model in the magazine slot; undefined without a model. */
export const itemLook = (registry: Registry, item: Item): ItemLook | undefined => {
  const { model } = defOf(registry, item.type);
  if (model === undefined) {
    return undefined;
  }
  const slot = registry.models.get(model)?.slots?.magazine;
  const fitted = item.slots?.magazine;
  const fittedModel = fitted && defOf(registry, fitted.type).model;
  const slots: ItemLookSlot[] = slot
    ? [{ slot: 'magazine', at: slot.at, turn: slot.turn, ...(fittedModel ? { model: fittedModel } : {}) }]
    : [];
  return { model, slots, key: [model, ...slots.map((entry) => `${entry.slot}=${entry.model ?? ''}`)].join('+') };
};
