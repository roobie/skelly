import { describe, expect, it, vi } from 'vitest';
import { Character, type HandedCharacter } from '../src/core/character.ts';
import type { FurnitureDef, ItemDef, Registry } from '../src/core/content.ts';
import { SLING_SLOT } from '../src/core/firearmFitting.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import { defOf, type Item } from '../src/core/items.ts';
import { opticViewSettings } from '../src/core/opticView.ts';
import { bindReach } from '../src/core/reach.ts';
import type { GunModelDef } from '../src/core/schema.ts';
import { simSeconds } from '../src/core/time.ts';
import { FirearmAttachmentHandling } from '../src/game/firearmAttachmentHandling.ts';
import { baseRegistry as loadBaseRegistry } from './baseRegistry.ts';
import { BASE_CLOCK } from './dayPhaseFixture.ts';
import { FIXTURE_MATERIAL, fixtureBreach } from './economyFixtures.ts';

type Pair = NonNullable<GunModelDef['compatibilityPairs']>[number];
type Choice = Pair[number];

const baseRegistry = loadBaseRegistry();

const makeFixture = (character?: HandedCharacter, prepareRegistry?: (registry: Registry) => void) => {
  const registry: Registry = {
    ...baseRegistry,
    furniture: new Map(baseRegistry.furniture),
    items: new Map(baseRegistry.items),
    models: new Map(baseRegistry.models),
  };
  prepareRegistry?.(registry);
  const firearmType = 'rifle_assault';
  const modelId = defOf(registry, firearmType).model!;
  const entry = registry.models.get(modelId)!;
  const model = entry.gun!;
  const attachmentType = [...registry.items.values()].find((candidate) => {
    const attachmentModel = candidate.model === undefined ? undefined : registry.models.get(candidate.model);
    return attachmentModel?.gun?.attachment?.kind === 'foregrip';
  })!.id;
  const inventory = new Inventory(registry, undefined, undefined, character);
  const firearm = inventory.create(firearmType);
  const foregrip = inventory.create(attachmentType);
  const withModel = (change: (model: GunModelDef) => GunModelDef): void => {
    registry.models.set(modelId, { ...entry, gun: change(model) });
  };
  return { registry, model, modelId, inventory, firearm, foregrip, withModel };
};

/** The first two bottom-rail slots the export certifies for the foregrip, so a multi-notch span stays on the rail. */
const bottomRailSlots = (model: GunModelDef): string[] =>
  (model.attachmentSlots ?? [])
    .filter((slot) => slot.mount === 'rail-bottom' && model.compatibility?.[slot.id]?.includes('foregrip'))
    .map((slot) => slot.id)
    .slice(0, 2);

const pair = (a: Choice, b: Choice): Pair => [b, a];

const CANDIDATE_CABINET = 'test_attachment_candidate_cabinet';

const makeCandidateFixture = (attachmentCount: number, includeOutOfReach = false) => {
  const fixture = makeFixture(undefined, (registry) => {
    const cabinet: FurnitureDef = {
      id: CANDIDATE_CABINET,
      name: 'Test attachment cabinet',
      size: [1, 1, 1],
      color: '#444444',
      container: {
        pockets: [{ grid: [attachmentCount * 4 + 8, 4], handlingSimSeconds: simSeconds(0) }],
        wideReason: 'Test-owned grid for candidate discovery',
      },
      breach: fixtureBreach(),
      material: FIXTURE_MATERIAL,
    };
    registry.furniture.set(cabinet.id, cabinet);
  });
  const slot = bottomRailSlots(fixture.model)[0]!;
  const defaultSlot = fixture.model.attachments![0]!.mountedAt;
  fixture.withModel((model) => ({
    ...model,
    compatibility: { ...model.compatibility, [slot]: ['foregrip'] },
    compatibilityPairs: [pair([slot, 'foregrip'], [defaultSlot, fixture.model.attachments![0]!.id])],
  }));
  const queue = new HandlingQueue(fixture.inventory);
  const handling = new FirearmAttachmentHandling(fixture.inventory, queue, () => [0, 0, 0]);
  if (!fixture.inventory.add(fixture.firearm, { kind: 'hand', side: 'right' })) {
    throw new Error('Fixture firearm could not be held');
  }
  const nearby = fixture.inventory.furnish({
    type: CANDIDATE_CABINET,
    pos: [0, 0, 0],
    size: [1, 1, 1],
    facing: 'n',
  });
  const remote = includeOutOfReach
    ? fixture.inventory.furnish({ type: CANDIDATE_CABINET, pos: [20, 0, 0], size: [1, 1, 1], facing: 'n' })
    : undefined;
  if (!nearby || (includeOutOfReach && !remote)) {
    throw new Error('Fixture cabinets could not be placed');
  }
  fixture.inventory.entities.markSearched(nearby);
  if (remote) {
    fixture.inventory.entities.markSearched(remote);
  }
  let playerPosition: [number, number, number] = [0, 0, 0];
  bindReach({
    inventory: fixture.inventory,
    get position() {
      return playerPosition;
    },
    blockSize: 1,
    clock: BASE_CLOCK,
  });
  const attachments = [
    fixture.foregrip,
    ...Array.from({ length: attachmentCount - 1 }, () => fixture.inventory.create(fixture.foregrip.type)),
  ];
  for (const attachment of attachments) {
    if (!fixture.inventory.add(attachment, { kind: 'furniture', entity: nearby, pocket: 0 })) {
      throw new Error('A fixture attachment could not be placed in the nearby cabinet');
    }
  }
  const sling = fixture.inventory.create('weapon_sling');
  if (!fixture.inventory.add(sling, { kind: 'furniture', entity: nearby, pocket: 0 })) {
    throw new Error('Fixture sling could not be placed in the nearby cabinet');
  }
  let remoteAttachment: Item | undefined;
  let remoteSling: Item | undefined;
  if (remote) {
    playerPosition = [20, 0, 0];
    remoteAttachment = fixture.inventory.create(fixture.foregrip.type);
    remoteSling = fixture.inventory.create('weapon_sling');
    if (
      !(
        fixture.inventory.add(remoteAttachment, { kind: 'furniture', entity: remote, pocket: 0 }) &&
        fixture.inventory.add(remoteSling, { kind: 'furniture', entity: remote, pocket: 0 })
      )
    ) {
      throw new Error('Out-of-reach fixture items could not be placed');
    }
    playerPosition = [0, 0, 0];
  }
  return { ...fixture, slot, handling, attachments, sling, remoteAttachment, remoteSling };
};

/** A firearm in hand or on the ground with a certified free bottom-rail slot, and a foregrip on the ground. */
const handlingFixture = (location: 'hand' | 'pile', character?: HandedCharacter) => {
  const fixture = makeFixture(character);
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
  return { ...fixture, slot, queue, handling };
};
const SINGLE_FIT_DENIED = /does not certify foregrip/;
const PAIR_FIT_DENIED = /combined attachment fit/;
const NOTCH_FIT_DENIED = /does not fit the exported notches/;
const OVERLAP_DENIED = /footprints overlap/;

const fitAttachmentInFixture = (inventory: Inventory, firearm: Item, slot: string, attachment: Item): void => {
  inventory.fitSlot(firearm, slot, attachment);
};

const baseOpticFitsFirearm = (opticDefinition: ItemDef, firearmDefinition: ItemDef): boolean => {
  const inventory = new Inventory(baseRegistry);
  const firearm = inventory.create(firearmDefinition.id);
  const optic = inventory.create(opticDefinition.id);
  const firearmModel = baseRegistry.models.get(firearmDefinition.model!);
  for (const slot of firearmModel?.gun?.attachmentSlots ?? []) {
    if (firearm.slots?.[slot.id]) {
      inventory.fitSlot(firearm, slot.id, undefined);
    }
  }
  const pile = { kind: 'pile' as const, pos: [0, 0, 0] as [number, number, number] };
  if (!(inventory.add(firearm, pile) && inventory.add(optic, pile))) {
    throw new Error('Base firearm and optic could not be placed for fitting');
  }
  const handling = new FirearmAttachmentHandling(inventory, new HandlingQueue(inventory), () => [0, 0, 0]);
  return (firearmModel?.gun?.attachmentSlots ?? []).some(
    (slot) => slot.mount === 'rail-top' && handling.fitReason(firearm, slot.id, optic) === undefined,
  );
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
      gun: {
        ...gripModel.gun,
        attachment: {
          ...gripModel.gun!.attachment!,
          properties: { ...gripModel.gun!.attachment!.properties, railSpanNotches: { minOffset: 0, maxOffset: 1 } },
        },
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
      const { slot, queue, handling, ...fixture } = handlingFixture(location);

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

  it('fits a sling to a long gun by handling and keeps it fitted while the gun is slung', () => {
    const inventory = new Inventory(baseRegistry);
    const queue = new HandlingQueue(inventory);
    const handling = new FirearmAttachmentHandling(inventory, queue, () => [0, 0, 0]);
    const shotgun = inventory.create('pump_shotgun');
    const sling = inventory.create('weapon_sling');
    inventory.add(shotgun, { kind: 'hand', side: 'right' });
    inventory.add(sling, { kind: 'pile', pos: [0, 0, 0] });

    expect(handling.fit(shotgun.uid, SLING_SLOT, sling.uid)).toBeUndefined();
    queue.tick(10);
    expect(shotgun.slots?.[SLING_SLOT]).toBe(sling);
    expect(inventory.move(shotgun, { kind: 'worn' }).ok).toBe(true);
    expect(handling.remove(shotgun.uid, SLING_SLOT)).toBeDefined();
    expect(shotgun.slots?.[SLING_SLOT]).toBe(sling);

    inventory.move(shotgun, { kind: 'hand', side: 'right' });
    expect(handling.remove(shotgun.uid, SLING_SLOT)).toBeUndefined();
    queue.tick(10);
    expect(shotgun.slots?.[SLING_SLOT]).toBeUndefined();
  });

  it('visits inventory entries linearly when listing many attachment candidates', () => {
    const visits = (attachmentCount: number): number => {
      const fixture = makeCandidateFixture(attachmentCount);
      const originalItems = fixture.inventory.items.bind(fixture.inventory);
      let entryVisits = 0;
      const iterator = vi.spyOn(fixture.inventory, 'items').mockImplementation(function* () {
        for (const entry of originalItems()) {
          entryVisits += 1;
          yield entry;
        }
      });
      try {
        expect(fixture.handling.candidates(fixture.firearm.uid, fixture.slot)).toHaveLength(attachmentCount);
      } finally {
        iterator.mockRestore();
      }
      return entryVisits;
    };

    const small = visits(16);
    const medium = visits(32);
    const large = visits(64);
    expect(medium).toBeLessThanOrEqual(small * 2.2);
    expect(large).toBeLessThanOrEqual(medium * 2.2);
  });

  it('returns native reachable attachments and slings but excludes out-of-reach candidates', () => {
    const fixture = makeCandidateFixture(2, true);
    expect(fixture.remoteAttachment).toBeDefined();
    expect(fixture.remoteSling).toBeDefined();

    expect(
      fixture.handling
        .candidates(fixture.firearm.uid, fixture.slot)
        .map(({ uid }) => uid)
        .sort(),
    ).toEqual(fixture.attachments.map(({ uid }) => uid).sort());
    expect(fixture.handling.candidates(fixture.firearm.uid, SLING_SLOT).map(({ uid }) => uid)).toEqual([
      fixture.sling.uid,
    ]);
  });

  it('times attachment fitting and removal by Firearms Combat, not Inventory Management', () => {
    const durations = (firearmsCombat: number, inventoryManagement: number) => {
      const character = new Character(baseRegistry);
      character.skills.firearms_combat = firearmsCombat;
      character.skills.inventory_management = inventoryManagement;
      const { firearm, foregrip, slot, queue, handling } = handlingFixture('hand', character);
      const fitRefusal = handling.fit(firearm.uid, slot, foregrip.uid);
      if (fitRefusal) {
        throw new Error(fitRefusal);
      }
      const fit = queue.jobs[0]!.duration;
      queue.tick(fit);
      const removeRefusal = handling.remove(firearm.uid, slot);
      if (removeRefusal) {
        throw new Error(removeRefusal);
      }
      return { fit, remove: queue.jobs[0]!.duration };
    };
    const untrained = durations(0, 0);
    const trained = durations(10, 0);

    expect(trained.fit).toBeLessThan(untrained.fit);
    expect(trained.remove).toBeLessThan(untrained.remove);
    expect(durations(0, 10)).toEqual(untrained);
  });

  it('keeps an unconfigured variable-power optic out of fitting', () => {
    const fixture = makeFixture();
    const optic = [...fixture.registry.items.values()].find((item) => {
      const model = item.model === undefined ? undefined : fixture.registry.models.get(item.model);
      const range = model?.gun?.attachment?.properties.magnification;
      return (
        model?.gun?.attachment?.kind === 'optic' &&
        range !== undefined &&
        range.min < range.max &&
        Object.values(fixture.model.compatibility ?? {}).some((ids) => ids.includes(model.gun!.attachment!.id))
      );
    });
    if (!optic) {
      throw new Error('Fixture registry needs a variable-power optic');
    }
    fixture.registry.items.set(optic.id, { ...optic, opticMagnification: undefined });
    const opticModel = fixture.registry.models.get(optic.model!)!;
    const firearmSlot = fixture.model.attachmentSlots!.find(({ id }) =>
      fixture.model.compatibility?.[id]?.includes(opticModel.gun!.attachment!.id),
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
    expect(handling.fit(fixture.firearm.uid, firearmSlot.id, thermal.uid)).toBeDefined();
    expect(queue.jobs).toHaveLength(0);
  });

  it('lets every base optic with a supported view fit at least one base firearm', () => {
    const firearms = [...baseRegistry.items.values()].filter((item) => item.firearm && item.model);
    const optics = [...baseRegistry.items.values()].filter((item) => {
      const model = item.model === undefined ? undefined : baseRegistry.models.get(item.model);
      return model?.gun?.attachment?.kind === 'optic' && opticViewSettings(item, model) !== undefined;
    });
    if (!(firearms.length > 0 && optics.length > 0)) {
      throw new Error('Base content needs firearms and optics');
    }

    for (const optic of optics) {
      expect(
        firearms.some((firearm) => baseOpticFitsFirearm(optic, firearm)),
        optic.id,
      ).toBe(true);
    }
  });

  it('rejects two fitted rail footprints that overlap', () => {
    const fixture = makeFixture();
    const [firstSlot, secondSlot] = bottomRailSlots(fixture.model);
    const gripModelId = defOf(fixture.registry, fixture.foregrip.type).model!;
    const gripModel = fixture.registry.models.get(gripModelId)!;
    fixture.registry.models.set(gripModelId, {
      ...gripModel,
      gun: {
        ...gripModel.gun,
        attachment: {
          ...gripModel.gun!.attachment!,
          properties: { ...gripModel.gun!.attachment!.properties, railSpanNotches: { minOffset: 0, maxOffset: 1 } },
        },
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
