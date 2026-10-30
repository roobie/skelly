// How one item instance looks (`DESIGN.md`, "Piles and item models"): its own model, plus the models of the items it
// owns at their slots. Every view draws an item from this, never from its type alone, so a rifle looks the same in
// the hands and on the ground.

import type { Registry } from '../core/content.ts';
import type { Vec3 } from '../core/coords.ts';
import { LIGHT_MOUNT_SLOT } from '../core/firearmFitting.ts';
import { defOf, type Item } from '../core/items.ts';
import { supplyShare } from '../core/lights.ts';

export interface ItemStateLook {
  readonly on?: boolean;
  readonly glow?: { readonly color: string; readonly intensity: number };
  readonly wear?: number;
  readonly supply?: number | 'absent' | 'present';
}

const bandOf = (bands: readonly { readonly from: number }[], share: number): number =>
  Math.max(
    0,
    bands.findLastIndex((band) => band.from <= share),
  );

export const itemStateLook = (registry: Registry, item: Item, model: string): ItemStateLook => {
  const def = defOf(registry, item.type);
  const presentation = registry.models.get(model)?.itemPresentation;
  const wear = presentation && registry.itemWear.get(presentation.wear);
  const supply = supplyShare(registry, item);
  let supplyLook: ItemStateLook['supply'];
  if (supply?.kind === 'absent') {
    supplyLook = 'absent';
  }
  if (supply?.kind === 'share') {
    supplyLook = presentation?.supply.kind === 'fill' ? bandOf(presentation.supply.bands, supply.share) : 'present';
  }
  return {
    ...(def.light ? { on: item.on === true } : {}),
    ...(def.light?.color !== undefined && def.light.emissive !== undefined
      ? { glow: { color: def.light.color, intensity: def.light.emissive } }
      : {}),
    ...(wear ? { wear: bandOf(wear.bands, item.condition) } : {}),
    ...(supplyLook === undefined ? {} : { supply: supplyLook }),
  };
};

export interface ItemLookSlot {
  readonly slot: string;
  readonly state?: ItemStateLook;
  /** The slot frame in the base model's metres. */
  readonly at: Vec3;
  /** Magazine pose in XYZ degrees; attachment slots instead use direction and up. */
  readonly turn?: Vec3;
  readonly direction?: Vec3;
  readonly up?: Vec3;
  /** The fitted model's exported connector frame, aligned to the gun-side slot frame. */
  readonly mountFrame?: { readonly normal: Vec3; readonly up: Vec3 };
  /** The fitted item's model; absent while the slot is empty. */
  readonly model?: string;
}

export interface ItemLook {
  readonly model: string;
  readonly state?: ItemStateLook;
  readonly slots: readonly ItemLookSlot[];
  /** Exported pieces the item has shed, such as a lit grenade's lever or a pulled pin. */
  readonly hidden: readonly string[];
  /** Composition and banded-state cache identity, including supply presence. */
  readonly key: string;
}

/** A pulled pin leaves the model until it goes back in; a lit fuse has let the lever go for good. */
const shedGroups = (registry: Registry, model: string, item: Item): string[] => {
  const modelDef = registry.models.get(model);
  const lit = item.fuseRemainingSimSeconds !== undefined;
  return [
    ...(modelDef?.pin && (item.pinPulled || lit) ? [modelDef.pin.piece] : []),
    ...(modelDef?.lever && lit ? [modelDef.lever.piece] : []),
  ];
};

/** The item's model with its fitted magazine's own model in the magazine slot; undefined without a model. */
export const itemLook = (registry: Registry, item: Item): ItemLook | undefined => {
  const { model } = defOf(registry, item.type);
  if (model === undefined) {
    return undefined;
  }
  const modelDef = registry.models.get(model);
  const magazineSlot = modelDef?.gun?.slots?.magazine;
  const fittedMagazine = item.slots?.magazine;
  const magazineModel = fittedMagazine && defOf(registry, fittedMagazine.type).model;
  const slots: ItemLookSlot[] = magazineSlot
    ? [
        {
          slot: 'magazine',
          at: magazineSlot.at,
          turn: magazineSlot.turn,
          ...(magazineModel
            ? { model: magazineModel, state: itemStateLook(registry, fittedMagazine!, magazineModel) }
            : {}),
        },
      ]
    : [];
  for (const [slotId, child] of Object.entries(item.slots ?? {})) {
    if (slotId === 'magazine' || slotId === 'battery' || slotId === 'canister' || !child) {
      continue;
    }
    const slot = attachmentSlot(registry, item, slotId, child);
    if (slot) {
      slots.push({ ...slot, state: itemStateLook(registry, child, slot.model!) });
    }
  }
  const hidden = shedGroups(registry, model, item);
  const state = itemStateLook(registry, item, model);
  return {
    model,
    state,
    slots,
    hidden,
    key: [
      model,
      JSON.stringify(state),
      ...slots.map((entry) => `${entry.slot}=${entry.model ?? ''}:${JSON.stringify(entry.state)}`),
      ...hidden.map((group) => `-${group}`),
    ].join('+'),
  };
};

/** Where a fitted attachment draws: a gungen mount slot, or the gun's own light-mount site. */
const attachmentSlot = (registry: Registry, item: Item, slotId: string, child: Item): ItemLookSlot | undefined => {
  const attachmentModel = defOf(registry, child.type).model;
  if (!attachmentModel) {
    return undefined;
  }
  if (slotId === LIGHT_MOUNT_SLOT) {
    const site = defOf(registry, item.type).lightMountSite;
    return site && { slot: slotId, at: site.at, turn: site.turn, model: attachmentModel };
  }
  const modelId = defOf(registry, item.type).model;
  const mount = modelId && registry.models.get(modelId)?.gun?.attachmentSlots?.find(({ id }) => id === slotId);
  const mountFrame = registry.models.get(attachmentModel)?.gun?.attachment?.mountFrame;
  return mount && mountFrame
    ? { slot: slotId, at: mount.position, direction: mount.direction, up: mount.up, mountFrame, model: attachmentModel }
    : undefined;
};
