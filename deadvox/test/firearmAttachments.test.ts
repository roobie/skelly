import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { firearmAttachmentResponse, muzzleLoad, wearFirearmAttachments } from '../src/core/firearmAttachments.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import { defOf, weightOf } from '../src/core/items.ts';
import { FirearmMechanics } from '../src/game/firearmHandling.ts';

const base = 'src/content/base';
const sources = readdirSync(base)
  .filter((file) => file.endsWith('.json'))
  .sort()
  .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(base, file), 'utf8')) as unknown }));

const exportedDefault = (registry: ReturnType<typeof buildRegistry>['registry']) => {
  const firearmModel = registry.models.get(defOf(registry, 'rifle_assault').model!)!;
  const [attachment] = firearmModel.attachments ?? [];
  if (!attachment) {
    throw new Error('Fixture firearm has no exported default attachment');
  }
  const item = [...registry.items.values()].find((candidate) => {
    const model = candidate.model === undefined ? undefined : registry.models.get(candidate.model);
    return model?.attachment?.id === attachment.id;
  });
  if (!(item?.model && registry.models.get(item.model)?.attachment)) {
    throw new Error('Fixture attachment has no registered standalone model');
  }
  return { attachment, item, modelId: item.model };
};

const fixture = () => {
  const { registry, issues } = buildRegistry(sources);
  if (issues.length > 0) {
    throw new Error(`Fixture content is invalid: ${JSON.stringify(issues)}`);
  }
  const exported = exportedDefault(registry);
  const model = registry.models.get(exported.modelId)!;
  registry.models.set(exported.modelId, {
    ...model,
    attachment: { ...model.attachment!, massKg: 0.4 },
  });
  const inventory = new Inventory(registry);
  return { registry, rifle: inventory.create('rifle_assault'), ...exported };
};

const attachAtExportedMount = (
  registry: ReturnType<typeof buildRegistry>['registry'],
  firearm: ReturnType<Inventory['create']>,
  item: ReturnType<Inventory['create']>,
) => {
  const hostModel = registry.models.get(defOf(registry, firearm.type).model!)!;
  const mount = registry.models.get(defOf(registry, item.type).model!)?.attachment?.mount;
  const slot = hostModel.attachmentSlots?.find((candidate) => candidate.mount === mount);
  if (!slot) {
    throw new Error('Fixture firearm has no slot for the attachment mount');
  }
  firearm.slots = { ...firearm.slots, [slot.id]: item };
};

describe('muzzle load', () => {
  it('increases with attachment mass and mount distance from the grip', () => {
    const near = fixture();
    const nearLoad = muzzleLoad(near.registry, near.rifle)!;

    const heavy = fixture();
    const optic = heavy.registry.models.get(heavy.modelId)!;
    heavy.registry.models.set(heavy.modelId, {
      ...optic,
      attachment: { ...optic.attachment!, massKg: optic.attachment!.massKg! * 2 },
    });
    const heavyLoad = muzzleLoad(heavy.registry, heavy.rifle)!;

    const farther = fixture();
    const rifleModelId = defOf(farther.registry, farther.rifle.type).model!;
    const rifleModel = farther.registry.models.get(rifleModelId)!;
    farther.registry.models.set(rifleModelId, {
      ...rifleModel,
      attachmentSlots: rifleModel.attachmentSlots!.map((slot) =>
        slot.id === farther.attachment.mountedAt
          ? {
              ...slot,
              position: [slot.position[0] + 1, slot.position[1], slot.position[2]] as [number, number, number],
            }
          : slot,
      ),
    });
    const fartherLoad = muzzleLoad(farther.registry, farther.rifle)!;

    expect(heavyLoad).toBeGreaterThan(nearLoad);
    expect(fartherLoad).toBeGreaterThan(nearLoad);
  });

  it('increases sway and raise time while reducing recovery and ready movement', () => {
    const { registry } = fixture();
    const inventory = new Inventory(registry);
    const gun = inventory.create('rifle_assault');
    expect(inventory.add(gun, { kind: 'hand', side: 'right' })).toBe(true);
    const fittedSlots = gun.slots!;
    gun.slots = {};
    const mechanics = new FirearmMechanics(inventory, new HandlingQueue(inventory), {
      blockSize: 1,
      pose: () => undefined,
      onEjection: () => undefined,
    });
    const unloaded = mechanics.skillZeroHandlingFor(gun.uid);
    const unloadedStance = mechanics.stanceEffectsFor(gun.uid);
    gun.slots = fittedSlots;
    expect(muzzleLoad(registry, gun)).toBeGreaterThan(0);
    const loaded = mechanics.skillZeroHandlingFor(gun.uid);
    const loadedStance = mechanics.stanceEffectsFor(gun.uid);

    expect(loaded.singleShot.variance).toBeGreaterThan(unloaded.singleShot.variance);
    expect(loaded.singleShot.recoilRecoveryScale).toBeLessThan(unloaded.singleShot.recoilRecoveryScale);
    expect(loadedStance.raiseDurationSimSeconds).toBeGreaterThan(unloadedStance.raiseDurationSimSeconds);
    expect(loadedStance.readyMovementFactor).toBeLessThan(unloadedStance.readyMovementFactor);
  });

  it('gives an improvised suppressor less recoil and noise reduction and faster wear', () => {
    const { registry } = fixture();
    const inventory = new Inventory(registry);
    const firearm = inventory.create('rifle_assault');
    expect(inventory.add(firearm, { kind: 'hand', side: 'right' })).toBe(true);
    const real = inventory.create('real_suppressor');
    attachAtExportedMount(registry, firearm, real);
    const realResponse = firearmAttachmentResponse(registry, firearm);
    wearFirearmAttachments(registry, firearm);
    const realWear = 1 - real.condition;
    const wornRealResponse = firearmAttachmentResponse(registry, firearm);

    const improvised = inventory.create('improvised_suppressor');
    attachAtExportedMount(registry, firearm, improvised);
    const improvisedResponse = firearmAttachmentResponse(registry, firearm);
    wearFirearmAttachments(registry, firearm);

    expect(improvisedResponse.recoilScale).toBeGreaterThan(realResponse.recoilScale);
    expect(improvisedResponse.noiseFactor).toBeGreaterThan(realResponse.noiseFactor);
    expect(wornRealResponse.noiseFactor).toBeGreaterThan(realResponse.noiseFactor);
    expect(wornRealResponse.recoilScale).toBeGreaterThan(realResponse.recoilScale);
    expect(1 - improvised.condition).toBeGreaterThan(realWear);
  });

  it('maps the foregrip to improved aim and stance response', () => {
    const { registry } = fixture();
    const inventory = new Inventory(registry);
    const firearm = inventory.create('rifle_assault');
    attachAtExportedMount(registry, firearm, inventory.create('foregrip'));

    const response = firearmAttachmentResponse(registry, firearm);

    expect(response.swayScale).toBeLessThan(1);
    expect(response.recoveryScale).toBeGreaterThan(1);
    expect(response.raiseScale).toBeLessThan(1);
    expect(response.swingScale).toBeGreaterThan(1);
  });

  it('derives inventory attachment weight from exported mass in kilograms', () => {
    const { registry, rifle, modelId } = fixture();
    const original = weightOf(registry, rifle);
    const optic = registry.models.get(modelId)!;
    registry.models.set(modelId, {
      ...optic,
      attachment: { ...optic.attachment!, massKg: optic.attachment!.massKg! * 2 },
    });

    expect(weightOf(registry, rifle)).toBeGreaterThan(original);
  });

  it('does not fabricate a load when an exported attachment mass is missing', () => {
    const { registry, rifle, modelId } = fixture();
    const optic = registry.models.get(modelId)!;
    registry.models.set(modelId, {
      ...optic,
      attachment: { ...optic.attachment!, massKg: undefined },
    });

    expect(muzzleLoad(registry, rifle)).toBeUndefined();
  });
});
