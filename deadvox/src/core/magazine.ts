// A detachable box magazine (SLICE-3.md, 3.2): an item whose model carries gungen's fitted round column.
// Its cartridges are item state in feed order: index 0 is the top round, the next one fed or stripped.
import type { ModelDef, Registry } from './content.ts';

export interface MagazineSpec {
  readonly calibre: string;
  readonly capacity: number;
}

/** The magazine's calibre and capacity, from its exported model; undefined when the type is not a magazine. */
export const magazineSpec = (registry: Registry, type: string): MagazineSpec | undefined => {
  const def = registry.items.get(type);
  const model = def?.model === undefined ? undefined : registry.models.get(def.model);
  if (model?.capacity === undefined || model.calibre === undefined || def?.firearm) {
    return undefined;
  }
  return { calibre: model.calibre, capacity: model.capacity };
};

/** The calibre a magazine-fed firearm takes: every firearm but the pump feeds from a magazine slot. */
export const magazineWellCalibre = (registry: Registry, type: string): string | undefined => {
  const def = registry.items.get(type);
  if (!def?.firearm || def.firearm.pump) {
    return undefined;
  }
  return def.model === undefined ? undefined : registry.models.get(def.model)?.calibre;
};

/** Whether a magazine of this type fits the firearm's magazine slot: same calibre. */
export const magazineFits = (registry: Registry, firearmType: string, magazineType: string): boolean => {
  const calibre = magazineWellCalibre(registry, firearmType);
  return calibre !== undefined && magazineSpec(registry, magazineType)?.calibre === calibre;
};

/**
 * Military loot only: magazine-fed rifles, their magazines and cartridges, exported attachments, and packages that
 * unpack into any of them, however deeply nested. BR: "AR and AK are only found in military loot sources" (SLICE-3.md, 3.2); their ammunition follows.
 */
const isMilitaryAttachment = (registry: Registry, itemId: string): boolean => {
  const item = registry.items.get(itemId);
  const model = item?.model === undefined ? undefined : registry.models.get(item.model);
  const attachment = model?.attachment;
  return Boolean(attachment && !(attachment.kind === 'suppressor' && attachment.properties.wearClass === 'improvised'));
};

const addFirearmsToMilitaryLoot = (registry: Registry, calibres: Set<string>, items: Set<string>): void => {
  for (const id of registry.items.keys()) {
    const calibre = magazineWellCalibre(registry, id);
    if (calibre !== undefined) {
      calibres.add(calibre);
      items.add(id);
    }
  }
};

const addMilitaryCalibreItems = (registry: Registry, calibres: ReadonlySet<string>, items: Set<string>): void => {
  for (const [id, def] of registry.items) {
    const calibre = magazineSpec(registry, id)?.calibre ?? def.ammo?.calibre;
    if (calibre !== undefined && calibres.has(calibre)) {
      items.add(id);
    }
    if (isMilitaryAttachment(registry, id)) {
      items.add(id);
    }
  }
};

const addUnpackedMilitaryItems = (registry: Registry, items: Set<string>): void => {
  // A box may hold another box; repeat until no package joins, so content order can't hide one.
  let before: number;
  do {
    before = items.size;
    for (const [id, def] of registry.items) {
      if (def.unpack && items.has(def.unpack.item)) {
        items.add(id);
      }
    }
  } while (items.size !== before);
};

export const militaryLootItems = (registry: Registry): ReadonlySet<string> => {
  const calibres = new Set<string>();
  const items = new Set<string>();
  addFirearmsToMilitaryLoot(registry, calibres, items);
  addMilitaryCalibreItems(registry, calibres, items);
  addUnpackedMilitaryItems(registry, items);
  return items;
};

const attachmentSlotsReason = (
  registry: Registry,
  model: ModelDef | undefined,
  slots: Readonly<Record<string, { readonly type: string } | undefined>>,
): string | undefined => {
  for (const [slotId, child] of Object.entries(slots)) {
    if (!child || slotId === 'magazine' || slotId === 'battery') {
      continue;
    }
    const slot = model?.attachmentSlots?.find(({ id }) => id === slotId);
    const childDef = registry.items.get(child.type);
    const attachmentModel = childDef?.model === undefined ? undefined : registry.models.get(childDef.model);
    const attachment = attachmentModel?.attachment;
    const certifiedDefault = model?.attachments?.some(
      (fitted) => fitted.mountedAt === slotId && fitted.id === attachment?.id,
    );
    if (!(slot && attachment) || attachment.mount !== slot.mount || !certifiedDefault) {
      return `Uncertified attachment in slot "${slotId}"`;
    }
  }
  return undefined;
};

const batterySlotReason = (
  registry: Registry,
  batteryType: string | undefined,
  slots: Readonly<Record<string, { readonly type: string } | undefined>>,
): string | undefined => {
  if (batteryType !== undefined) {
    return slots.battery?.type === batteryType && registry.items.get(batteryType)?.battery
      ? undefined
      : 'A powered light needs its matching battery';
  }
  return slots.battery ? 'Only a powered light has a battery slot' : undefined;
};

/** Why `slots` can't be fitted to this item, or undefined when they can. */
export const slotsReason = (
  registry: Registry,
  type: string,
  slots: Readonly<Record<string, { readonly type: string } | undefined>> | undefined,
): string | undefined => {
  const definition = registry.items.get(type);
  const model = definition?.model === undefined ? undefined : registry.models.get(definition.model);
  const magazineCalibre = magazineWellCalibre(registry, type);
  const batteryType = definition?.light?.power?.battery;
  const hasSlots =
    magazineCalibre !== undefined || batteryType !== undefined || (model?.attachmentSlots?.length ?? 0) > 0;
  if (!hasSlots) {
    return slots === undefined ? undefined : 'This item has no fitted-item slots';
  }
  if (slots === undefined) {
    return 'An item with fitted-item slots needs its slots';
  }
  if (magazineCalibre !== undefined && slots.magazine && !magazineFits(registry, type, slots.magazine.type)) {
    return 'The fitted magazine does not fit this firearm';
  }
  if (slots.magazine && magazineCalibre === undefined) {
    return 'Only a magazine-fed firearm has a magazine slot';
  }
  return batterySlotReason(registry, batteryType, slots) ?? attachmentSlotsReason(registry, model, slots);
};

/** Why `cartridges` can't be this magazine's contents, or undefined when they can. */
export const magazineContentsReason = (
  registry: Registry,
  type: string,
  cartridges: readonly string[] | undefined,
): string | undefined => {
  const spec = magazineSpec(registry, type);
  if (!spec) {
    return cartridges === undefined ? undefined : 'Only a magazine holds cartridges';
  }
  if (cartridges === undefined) {
    return 'A magazine needs its cartridge list';
  }
  if (cartridges.length > spec.capacity) {
    return 'Magazine holds more than its capacity';
  }
  return cartridges.every((round) => registry.items.get(round)?.ammo?.calibre === spec.calibre)
    ? undefined
    : 'Magazine holds a cartridge of another calibre';
};
