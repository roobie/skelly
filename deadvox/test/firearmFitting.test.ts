import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ModelDef, Registry } from '../src/core/content.ts';
import { buildRegistry } from '../src/core/content.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import { defOf, type Item } from '../src/core/items.ts';
import { FirearmAttachmentHandling } from '../src/game/firearmAttachmentHandling.ts';

type Pair = NonNullable<ModelDef['compatibilityPairs']>[number];
type Choice = Pair[number];

const base = 'src/content/base';
const sources = readdirSync(base)
  .filter((file) => file.endsWith('.json'))
  .sort()
  .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(base, file), 'utf8')) as unknown }));
const { registry: baseRegistry, issues } = buildRegistry(sources);
if (issues.length > 0) {
  throw new Error(`Fixture content is invalid: ${JSON.stringify(issues)}`);
}

const makeFixture = () => {
  const registry: Registry = {
    ...baseRegistry,
    items: new Map(baseRegistry.items),
    models: new Map(baseRegistry.models),
  };
  const firearmType = 'rifle_assault';
  const modelId = defOf(registry, firearmType).model!;
  const model = registry.models.get(modelId)!;
  const attachmentType = [...registry.items.values()].find((candidate) => {
    const attachmentModel = candidate.model === undefined ? undefined : registry.models.get(candidate.model);
    return attachmentModel?.attachment?.kind === 'foregrip';
  })!.id;
  const inventory = new Inventory(registry);
  const firearm = inventory.create(firearmType);
  const foregrip = inventory.create(attachmentType);
  const withModel = (change: (model: ModelDef) => ModelDef): void => {
    registry.models.set(modelId, change(model));
  };
  return { registry, model, modelId, inventory, firearm, foregrip, withModel };
};

const bottomRailSlots = (model: ModelDef): string[] =>
  (model.attachmentSlots ?? [])
    .filter((slot) => slot.mount === 'rail-bottom')
    .map((slot) => slot.id)
    .slice(0, 2);

const pair = (a: Choice, b: Choice): Pair => [b, a];
const SINGLE_FIT_DENIED = /does not certify foregrip/;
const PAIR_FIT_DENIED = /combined attachment fit/;
const NOTCH_FIT_DENIED = /does not fit the exported notches/;
const OVERLAP_DENIED = /footprints overlap/;

const fitAttachmentInFixture = (inventory: Inventory, firearm: Item, slot: string, attachment: Item): void => {
  inventory.fitSlot(firearm, slot, attachment);
};

describe('certified firearm fitting', () => {
  it('denies a dynamic fit without its per-slot certificate', () => {
    const fixture = makeFixture();
    const slot = bottomRailSlots(fixture.model)[0]!;
    fixture.withModel((model) => ({ ...model, compatibility: { ...model.compatibility, [slot]: [] } }));

    expect(() => fitAttachmentInFixture(fixture.inventory, fixture.firearm, slot, fixture.foregrip)).toThrow(
      SINGLE_FIT_DENIED,
    );
  });

  it('requires a pair certificate when fitting beside an installed default', () => {
    const fixture = makeFixture();
    const slot = bottomRailSlots(fixture.model)[0]!;
    fixture.withModel((model) => ({
      ...model,
      compatibility: { ...model.compatibility, [slot]: ['foregrip'] },
      compatibilityPairs: [],
    }));

    expect(() => fitAttachmentInFixture(fixture.inventory, fixture.firearm, slot, fixture.foregrip)).toThrow(
      PAIR_FIT_DENIED,
    );
  });

  it('accepts a certified combined fit independent of pair order', () => {
    const fixture = makeFixture();
    const slot = bottomRailSlots(fixture.model)[0]!;
    const defaultSlot = fixture.model.attachments![0]!.mountedAt;
    fixture.withModel((model) => ({
      ...model,
      compatibility: { ...model.compatibility, [slot]: ['foregrip'] },
      compatibilityPairs: [pair([slot, 'foregrip'], [defaultSlot, fixture.model.attachments![0]!.id])],
    }));

    fitAttachmentInFixture(fixture.inventory, fixture.firearm, slot, fixture.foregrip);

    expect(fixture.firearm.slots?.[slot]).toBe(fixture.foregrip);
  });

  it('rejects footprints that leave the exported rail notches', () => {
    const fixture = makeFixture();
    const [slot, omitted] = bottomRailSlots(fixture.model);
    const gripModelId = defOf(fixture.registry, fixture.foregrip.type).model!;
    const gripModel = fixture.registry.models.get(gripModelId)!;
    fixture.registry.models.set(gripModelId, {
      ...gripModel,
      attachment: {
        ...gripModel.attachment!,
        properties: { ...gripModel.attachment!.properties, railSpanNotches: { minOffset: 0, maxOffset: 1 } },
      },
    });
    fixture.withModel((model) => ({
      ...model,
      attachmentSlots: model.attachmentSlots!.filter(({ id }) => id !== omitted),
      compatibility: { ...model.compatibility, [slot!]: ['foregrip'] },
    }));

    expect(() => fitAttachmentInFixture(fixture.inventory, fixture.firearm, slot!, fixture.foregrip)).toThrow(
      NOTCH_FIT_DENIED,
    );
  });

  it('fits and removes by handling when the firearm is held or on the ground', () => {
    for (const location of ['hand', 'pile'] as const) {
      const fixture = makeFixture();
      const slot = bottomRailSlots(fixture.model)[0]!;
      const defaultSlot = fixture.model.attachments![0]!.mountedAt;
      fixture.withModel((model) => ({
        ...model,
        compatibility: { ...model.compatibility, [slot]: ['foregrip'] },
        compatibilityPairs: [pair([slot, 'foregrip'], [defaultSlot, fixture.model.attachments![0]!.id])],
      }));
      const queue = new HandlingQueue(fixture.inventory);
      const handling = new FirearmAttachmentHandling(fixture.inventory, queue, () => [0, 0, 0]);
      const firearmTarget =
        location === 'hand'
          ? { kind: 'hand' as const, side: 'right' as const }
          : { kind: 'pile' as const, pos: [0, 0, 0] as [number, number, number] };
      if (
        !(
          fixture.inventory.add(fixture.firearm, firearmTarget) &&
          fixture.inventory.add(fixture.foregrip, { kind: 'pile', pos: [0, 0, 0] })
        )
      ) {
        throw new Error('Fixture items could not be placed for handling');
      }

      expect(handling.fit(fixture.firearm.uid, slot, fixture.foregrip.uid)).toBeUndefined();
      expect(fixture.firearm.slots?.[slot]).toBeUndefined();
      queue.tick(1);
      expect(fixture.firearm.slots?.[slot]).toBe(fixture.foregrip);

      expect(handling.remove(fixture.firearm.uid, slot)).toBeUndefined();
      queue.tick(1);
      expect(fixture.firearm.slots?.[slot]).toBeUndefined();
      expect(fixture.inventory.locate(fixture.foregrip)?.kind).toBe('pile');
    }
  });

  it('keeps an unconfigured variable-power optic out of fitting', () => {
    const fixture = makeFixture();
    const optic = [...fixture.registry.items.values()].find((item) => {
      const model = item.model === undefined ? undefined : fixture.registry.models.get(item.model);
      const range = model?.attachment?.properties.magnification;
      return model?.attachment?.kind === 'optic' && range !== undefined && range.min < range.max;
    });
    if (!optic) {
      throw new Error('Fixture registry needs a variable-power optic');
    }
    fixture.registry.items.set(optic.id, { ...optic, opticMagnification: undefined });
    const opticModel = fixture.registry.models.get(optic.model!)!;
    const firearmSlot = fixture.model.attachmentSlots!.find(({ id }) =>
      fixture.model.compatibility?.[id]?.includes(opticModel.attachment!.id),
    );
    if (!firearmSlot) {
      throw new Error('Fixture firearm needs a compatible optic slot');
    }
    if (fixture.firearm.slots?.[firearmSlot.id]) {
      fixture.inventory.fitSlot(fixture.firearm, firearmSlot.id, undefined);
    }
    const thermal = fixture.inventory.create(optic.id);
    const queue = new HandlingQueue(fixture.inventory);
    const handling = new FirearmAttachmentHandling(fixture.inventory, queue, () => [0, 0, 0]);
    if (
      !(
        fixture.inventory.add(fixture.firearm, { kind: 'hand', side: 'right' }) &&
        fixture.inventory.add(thermal, { kind: 'pile', pos: [0, 0, 0] })
      )
    ) {
      throw new Error('Fixture items could not be placed for optic handling');
    }

    expect(handling.candidates(fixture.firearm.uid, firearmSlot.id)).not.toContain(thermal);
    expect(handling.fit(fixture.firearm.uid, firearmSlot.id, thermal.uid)).toBe('This optic has no supported view');
    expect(queue.jobs).toHaveLength(0);
  });

  it('lets every base optic fit at least one base firearm', () => {
    const firearms = [...baseRegistry.items.values()].filter((item) => item.firearm && item.model);
    const optics = [...baseRegistry.items.values()].filter(
      (item) => item.model && baseRegistry.models.get(item.model)?.attachment?.kind === 'optic',
    );
    if (!(firearms.length > 0 && optics.length > 0)) {
      throw new Error('Base content needs firearms and optics');
    }

    for (const opticDefinition of optics) {
      const fitsSomeFirearm = firearms.some((firearmDefinition) => {
        const inventory = new Inventory(baseRegistry);
        const firearm = inventory.create(firearmDefinition.id);
        const optic = inventory.create(opticDefinition.id);
        const firearmModel = baseRegistry.models.get(firearmDefinition.model!);
        for (const slot of firearmModel?.attachmentSlots ?? []) {
          if (firearm.slots?.[slot.id]) {
            inventory.fitSlot(firearm, slot.id, undefined);
          }
        }
        const pile = { kind: 'pile' as const, pos: [0, 0, 0] as [number, number, number] };
        if (!(inventory.add(firearm, pile) && inventory.add(optic, pile))) {
          throw new Error('Base firearm and optic could not be placed for fitting');
        }
        const handling = new FirearmAttachmentHandling(inventory, new HandlingQueue(inventory), () => [0, 0, 0]);
        return (firearmModel?.attachmentSlots ?? []).some(
          (slot) => slot.mount === 'rail-top' && handling.fitReason(firearm, slot.id, optic) === undefined,
        );
      });
      expect(fitsSomeFirearm, opticDefinition.id).toBe(true);
    }
  });

  it('rejects two fitted rail footprints that overlap', () => {
    const fixture = makeFixture();
    const [firstSlot, secondSlot] = bottomRailSlots(fixture.model);
    const gripModelId = defOf(fixture.registry, fixture.foregrip.type).model!;
    const gripModel = fixture.registry.models.get(gripModelId)!;
    fixture.registry.models.set(gripModelId, {
      ...gripModel,
      attachment: {
        ...gripModel.attachment!,
        properties: { ...gripModel.attachment!.properties, railSpanNotches: { minOffset: 0, maxOffset: 1 } },
      },
    });
    const second = fixture.inventory.create(fixture.foregrip.type);
    fixture.withModel((model) => ({
      ...model,
      compatibility: { ...model.compatibility, [firstSlot!]: ['foregrip'], [secondSlot!]: ['foregrip'] },
      compatibilityPairs: [
        pair([firstSlot!, 'foregrip'], [secondSlot!, 'foregrip']),
        pair([fixture.model.attachments![0]!.mountedAt, fixture.model.attachments![0]!.id], [firstSlot!, 'foregrip']),
        pair([fixture.model.attachments![0]!.mountedAt, fixture.model.attachments![0]!.id], [secondSlot!, 'foregrip']),
      ],
    }));
    fitAttachmentInFixture(fixture.inventory, fixture.firearm, firstSlot!, fixture.foregrip);

    expect(() => fitAttachmentInFixture(fixture.inventory, fixture.firearm, secondSlot!, second)).toThrow(
      OVERLAP_DENIED,
    );
  });
});
