import { claimed } from './capabilities.ts';
import { CONSUMABLE_SLOT } from './consumable.ts';
import type { ItemDef, Registry } from './content.ts';
import { firearmSlotIds, isLongGun } from './firearmFitting.ts';
import { knownItemSlot, slotsReason } from './magazine.ts';

type Report = (section: 'wearSlots' | 'items' | 'body', id: string, path: string, message: string) => void;

const checkSlotFrames = (registry: Registry, report: Report): void => {
  for (const slot of registry.wearSlots.values()) {
    slot.attachmentFrames.forEach((frame, index) => {
      for (const figure of registry.figures.values()) {
        if (!Object.hasOwn(figure.attachmentFrames, frame)) {
          report('wearSlots', slot.id, `.attachmentFrames[${index}]`, `figure "${figure.id}" has no frame "${frame}"`);
        }
      }
    });
  }
};

const checkBodySlots = (registry: Registry, report: Report): void => {
  for (const body of registry.body.values()) {
    const reference = (slot: string, path: string): void => {
      if (!registry.wearSlots.has(slot)) {
        report('body', body.id, path, `no wear slot "${slot}"`);
      }
    };
    for (const [region, slots] of Object.entries(body.coverage)) {
      slots.forEach((slot, index) => {
        reference(slot, `.coverage.${region}[${index}]`);
      });
    }
    for (const [touch, slot] of Object.entries(body.touchFirst)) {
      reference(slot, `.touchFirst.${touch}`);
    }
  }
};

const checkWearableSlot = (registry: Registry, item: ItemDef, report: Report): void => {
  const { wearable } = item;
  if (!wearable) {
    return;
  }
  const slot = registry.wearSlots.get(wearable.slot);
  if (!slot) {
    report('items', item.id, '.wearable.slot', `no wear slot "${wearable.slot}"`);
  }
  if (isLongGun(item) || slot?.capability?.includes('slungLongGun')) {
    report('items', item.id, '.wearable.slot', 'a slung long gun slot is not a clothing slot');
  }
  if (wearable.figureFit !== undefined && !slot?.capability?.includes('underLayerFit')) {
    report('items', item.id, '.wearable.figureFit', 'an under-layer fit requires its slot capability');
  }
  if (wearable.viewModel !== undefined && !slot?.capability?.includes('headEquipment')) {
    report('items', item.id, '.wearable.viewModel', 'a first-person model requires the head equipment slot capability');
  }
};

const checkAllowedModels = (
  registry: Registry,
  { host, slotId }: { host: ItemDef; slotId: string },
  fittedModels: readonly ItemDef[],
  report: Report,
): void => {
  const slot = registry.wearSlots.get(slotId)!;
  const checkEntries = (owner: ItemDef): void => {
    owner.figureModels?.forEach((entry, index) => {
      if (!slot.attachmentFrames.includes(entry.frame)) {
        report(
          'items',
          owner.id,
          `.figureModels[${index}].frame`,
          `frame "${entry.frame}" is not allowed by wear slot "${slot.id}" on "${host.id}"`,
        );
      }
    });
  };
  checkEntries(host);
  const fittingSlots = ['magazine', CONSUMABLE_SLOT, ...firearmSlotIds(registry, host)].filter((id) =>
    knownItemSlot(registry, host.id, id),
  );
  // Frame permission is per drawable child; pair compatibility remains the fitting owner's invariant.
  for (const child of fittedModels) {
    if (fittingSlots.some((id) => slotsReason(registry, host.id, { [id]: { type: child.id } }) === undefined)) {
      checkEntries(child);
    }
  }
};

export const checkWearSlots = (registry: Registry, report: Report): void => {
  checkSlotFrames(registry, report);
  checkBodySlots(registry, report);
  const slung = claimed(registry.wearSlots, 'slungLongGun');
  const fittedModels = [...registry.items.values()].filter((item) => item.figureModels?.length);
  for (const item of registry.items.values()) {
    checkWearableSlot(registry, item, report);
    const slot = isLongGun(item) ? slung : item.wearable && registry.wearSlots.get(item.wearable.slot);
    if (slot) {
      checkAllowedModels(registry, { host: item, slotId: slot.id }, fittedModels, report);
    }
  }
};
