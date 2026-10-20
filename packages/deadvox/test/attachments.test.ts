import { describe, expect, it } from 'vitest';
import { Inventory } from '../src/core/inventory.ts';
import { defOf, weightOf } from '../src/core/items.ts';
import { baseRegistry } from './baseRegistry.ts';

const registry = baseRegistry();
const ASSAULT_RIFLE = 'rifle_assault';
const UNCERTIFIED_ATTACHMENT = /Uncertified attachment in slot/;
describe('fitted firearm items', () => {
  it('creates removable default attachments as owned child items and renders them through the slot frame', () => {
    const rifleModel = registry.models.get(defOf(registry, ASSAULT_RIFLE).model!)!;
    const [defaultAttachment] = rifleModel.gun?.attachments ?? [];
    expect(defaultAttachment).toBeDefined();
    const defaultItem = [...registry.items.values()].find((item) => {
      const model = item.model === undefined ? undefined : registry.models.get(item.model);
      return model?.gun?.attachment?.id === defaultAttachment!.id;
    });
    expect(defaultItem).toBeDefined();
    const rival = [...registry.items.values()].find((item) => {
      const model = item.model === undefined ? undefined : registry.models.get(item.model);
      return model?.gun?.attachment && model.gun.attachment.mount !== defaultAttachment!.mount;
    });
    expect(rival).toBeDefined();

    const inventory = new Inventory(registry);
    const rifle = inventory.create(ASSAULT_RIFLE);
    const optic = rifle.slots?.[defaultAttachment!.mountedAt];
    expect(optic).toBeDefined();
    expect(optic!.type).toBe(defaultItem!.id);
    expect(inventory.add(rifle, { kind: 'hand', side: 'right' })).toBe(true);
    expect(inventory.itemByUid(optic!.uid)).toBe(optic);
    expect(weightOf(registry, rifle)).toBeGreaterThan(defOf(registry, rifle.type).weight);

    const wrong = inventory.create(rival!.id);
    expect(() => inventory.fitSlot(rifle, defaultAttachment!.mountedAt, wrong)).toThrow(UNCERTIFIED_ATTACHMENT);
    expect(inventory.fitSlot(rifle, defaultAttachment!.mountedAt, undefined)).toBe(optic);
    expect(inventory.itemByUid(optic!.uid)).toBeUndefined();
  });
});
