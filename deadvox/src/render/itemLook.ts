// How one item instance looks (DESIGN.md, "One item, one look"): its own model, plus the models of the items it
// owns at their slots. Every view draws an item from this, never from its type alone, so a rifle looks the same in
// the hands and on the ground.

import type { Registry } from '../core/content.ts';
import type { Vec3 } from '../core/coords.ts';
import { defOf, type Item } from '../core/items.ts';

export interface ItemLookSlot {
  readonly slot: string;
  /** The slot frame in the base model's metres. */
  readonly at: Vec3;
  /** Magazine pose in XYZ degrees; attachment slots instead use direction and up. */
  readonly turn?: Vec3;
  readonly direction?: Vec3;
  readonly up?: Vec3;
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
  const modelDef = registry.models.get(model);
  const magazineSlot = modelDef?.slots?.magazine;
  const fittedMagazine = item.slots?.magazine;
  const magazineModel = fittedMagazine && defOf(registry, fittedMagazine.type).model;
  const slots: ItemLookSlot[] = magazineSlot
    ? [
        {
          slot: 'magazine',
          at: magazineSlot.at,
          turn: magazineSlot.turn,
          ...(magazineModel ? { model: magazineModel } : {}),
        },
      ]
    : [];
  for (const [slotId, child] of Object.entries(item.slots ?? {})) {
    if (slotId === 'magazine' || slotId === 'battery' || !child) {
      continue;
    }
    const mount = modelDef?.attachmentSlots?.find(({ id }) => id === slotId);
    const attachmentModel = defOf(registry, child.type).model;
    if (mount && attachmentModel) {
      slots.push({
        slot: slotId,
        at: mount.position,
        direction: mount.direction,
        up: mount.up,
        model: attachmentModel,
      });
    }
  }
  return { model, slots, key: [model, ...slots.map((entry) => `${entry.slot}=${entry.model ?? ''}`)].join('+') };
};
