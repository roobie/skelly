// A detachable box magazine (`SLICE-3.md`, "Firearms for real"): an item whose model carries gungen's fitted round column.
// Its cartridges are item state in feed order: index 0 is the top round, the next one fed or stripped.
import { batteryFits } from './battery.ts';
import type { ItemDef, ModelDef, Registry } from './content.ts';
import {
  attachmentIdFor,
  compatibilityPairCertifies,
  footprintFitsRail,
  isExportedSingleFit,
  isLongGun,
  LIGHT_MOUNT_SLOT,
  railFootprint,
  railFootprintsOverlap,
  SLING_SLOT,
} from './firearmFitting.ts';
import type { Item } from './items.ts';
import { militaryOnlyEconomy } from './loot.ts';

export interface MagazineSpec {
  readonly calibre: string;
  readonly capacity: number;
}

/** The magazine's calibre and capacity, from its exported model; undefined when the type is not a magazine. */
export const magazineSpec = (registry: Registry, type: string): MagazineSpec | undefined => {
  const def = registry.items.get(type);
  const model = def?.model === undefined ? undefined : registry.models.get(def.model);
  if (model?.gun?.capacity === undefined || model.gun.calibre === undefined || def?.firearm) {
    return undefined;
  }
  return { calibre: model.gun.calibre, capacity: model.gun.capacity };
};

/** The calibre a detachable-magazine firearm takes. */
export const magazineWellCalibre = (registry: Registry, type: string): string | undefined => {
  const def = registry.items.get(type);
  if (!def?.firearm || def.firearm.pump || def.firearm.bolt) {
    return undefined;
  }
  const model = def.model === undefined ? undefined : registry.models.get(def.model);
  return model?.gun?.revolver ? undefined : model?.gun?.calibre;
};

/** Whether a magazine of this type fits the firearm's magazine slot: same calibre. */
export const magazineFits = (registry: Registry, firearmType: string, magazineType: string): boolean => {
  const calibre = magazineWellCalibre(registry, firearmType);
  return calibre !== undefined && magazineSpec(registry, magazineType)?.calibre === calibre;
};

export const militaryLootItems = (registry: Registry): ReadonlySet<string> =>
  new Set([...registry.items.values()].filter((item) => militaryOnlyEconomy(item.economy)).map((item) => item.id));

interface FittedAttachment {
  readonly slotId: string;
  readonly attachmentId: string;
  readonly isDefault: boolean;
  readonly rail?: ReturnType<typeof railFootprint>;
}

const fittedAttachmentFor = (
  registry: Registry,
  model: ModelDef | undefined,
  slotId: string,
  child: { readonly type: string },
): FittedAttachment | string => {
  const slot = model?.gun?.attachmentSlots?.find(({ id }) => id === slotId);
  const attachmentId = attachmentIdFor(registry, child as Item);
  const attachmentModelId = registry.items.get(child.type)?.model;
  const attachment =
    attachmentModelId === undefined ? undefined : registry.models.get(attachmentModelId)?.gun?.attachment;
  const isDefault =
    model?.gun?.attachments?.some(
      (defaultAttachment) => defaultAttachment.mountedAt === slotId && defaultAttachment.id === attachmentId,
    ) ?? false;
  if (!(slot && attachment && attachmentId) || attachment.mount !== slot.mount) {
    return `Uncertified attachment in slot "${slotId}"`;
  }
  if (!(isDefault || isExportedSingleFit(model, slotId, attachmentId))) {
    return `Gungen does not certify ${attachmentId} for slot "${slotId}"`;
  }
  const rail = railFootprint(registry, model, slotId, child as Item);
  // Authored defaults are certified as a complete assembly; their anchor slots are not the occupied rail extent.
  if (!isDefault && slot.mount !== 'muzzle' && !(rail && footprintFitsRail(model, rail))) {
    return `Attachment footprint does not fit the exported notches for slot "${slotId}"`;
  }
  return { slotId, attachmentId, isDefault, ...(rail ? { rail } : {}) };
};

const fittedPairReason = (
  model: ModelDef | undefined,
  current: FittedAttachment,
  other: FittedAttachment,
): string | undefined => {
  if (current.rail && other.rail && railFootprintsOverlap(current.rail, other.rail)) {
    return `Attachment footprints overlap on rail at slots "${current.slotId}" and "${other.slotId}"`;
  }
  const bothDefaults = current.isDefault && other.isDefault;
  const pairCertified = compatibilityPairCertifies(
    model,
    [current.slotId, current.attachmentId],
    [other.slotId, other.attachmentId],
  );
  if (!(bothDefaults || pairCertified)) {
    return `Gungen does not certify the combined attachment fit at slots "${current.slotId}" and "${other.slotId}"`;
  }
  return undefined;
};

const attachmentSlotsReason = (
  registry: Registry,
  model: ModelDef | undefined,
  slots: Readonly<Record<string, { readonly type: string } | undefined>>,
): string | undefined => {
  const fitted: FittedAttachment[] = [];
  for (const [slotId, child] of Object.entries(slots)) {
    if (
      !child ||
      slotId === 'magazine' ||
      slotId === 'battery' ||
      slotId === 'canister' ||
      slotId === SLING_SLOT ||
      slotId === LIGHT_MOUNT_SLOT
    ) {
      continue;
    }
    const result = fittedAttachmentFor(registry, model, slotId, child);
    if (typeof result === 'string') {
      return result;
    }
    fitted.push(result);
  }
  for (let index = 0; index < fitted.length; index += 1) {
    const current = fitted[index]!;
    for (const other of fitted.slice(index + 1)) {
      const reason = fittedPairReason(model, current, other);
      if (reason) {
        return reason;
      }
    }
  }
  return undefined;
};

const batterySlotReason = (
  registry: Registry,
  lightType: string,
  slots: Readonly<Record<string, { readonly type: string } | undefined>>,
): string | undefined => {
  if (registry.items.get(lightType)?.light?.power) {
    return slots.battery &&
      batteryFits(registry, lightType, slots.battery.type) &&
      registry.items.get(slots.battery.type)?.battery
      ? undefined
      : 'A powered light needs its matching battery';
  }
  return slots.battery ? 'Only a powered light has a battery slot' : undefined;
};

const canisterSlotReason = (
  registry: Registry,
  canisterType: string | undefined,
  slots: Readonly<Record<string, { readonly type: string } | undefined>>,
): string | undefined => {
  if (!slots.canister) {
    return undefined;
  }
  return canisterType !== undefined &&
    slots.canister.type === canisterType &&
    registry.items.get(canisterType)?.canister
    ? undefined
    : 'Only a fuelled tool takes its own cartridge';
};

const slingSlotReason = (
  registry: Registry,
  definition: ItemDef | undefined,
  slots: Readonly<Record<string, { readonly type: string } | undefined>>,
): string | undefined => {
  const sling = slots[SLING_SLOT];
  if (!sling) {
    return undefined;
  }
  if (!isLongGun(definition)) {
    return 'Only a long gun takes a sling';
  }
  return registry.items.get(sling.type)?.sling ? undefined : 'Only a sling fits the sling mount';
};

const lightMountSlotReason = (
  registry: Registry,
  definition: ItemDef | undefined,
  slots: Readonly<Record<string, { readonly type: string } | undefined>>,
): string | undefined => {
  const mount = slots[LIGHT_MOUNT_SLOT];
  if (!mount) {
    return undefined;
  }
  const site = isLongGun(definition) ? definition?.lightMountSite : undefined;
  if (!site) {
    return "I can't fit a light to this gun";
  }
  return registry.items.get(mount.type)?.lightMount?.kind === site.kind
    ? undefined
    : "I can't fit this light mount to this gun";
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
  const canisterType = definition?.tool?.fuel?.canister;
  const hasSlots =
    magazineCalibre !== undefined ||
    batteryType !== undefined ||
    canisterType !== undefined ||
    (model?.gun?.attachmentSlots?.length ?? 0) > 0 ||
    isLongGun(definition);
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
  return (
    batterySlotReason(registry, type, slots) ??
    canisterSlotReason(registry, canisterType, slots) ??
    slingSlotReason(registry, definition, slots) ??
    lightMountSlotReason(registry, definition, slots) ??
    attachmentSlotsReason(registry, model, slots)
  );
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
