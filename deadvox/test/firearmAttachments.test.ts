import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { firearmAttachmentResponse, muzzleLoad, wearFirearmAttachments } from '../src/core/firearmAttachments.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import { defOf, weightOf } from '../src/core/items.ts';
import { slotsReason } from '../src/core/magazine.ts';
import { FirearmMechanics } from '../src/game/firearmHandling.ts';
import { withDefaultAttachment } from './firearmAttachmentFixture.ts';

const base = 'src/content/base';
const sources = readdirSync(base)
  .filter((file) => file.endsWith('.json'))
  .sort()
  .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(base, file), 'utf8')) as unknown }));
const { registry: baseRegistry, issues } = buildRegistry(sources);
if (issues.length > 0) {
  throw new Error(`Fixture content is invalid: ${JSON.stringify(issues)}`);
}
const freshRegistry = () => ({
  ...baseRegistry,
  items: new Map(baseRegistry.items),
  models: new Map(baseRegistry.models),
});

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

const fixture = (massKg = 0.4) => {
  const registry = freshRegistry();
  const exported = exportedDefault(registry);
  const model = registry.models.get(exported.modelId)!;
  registry.models.set(exported.modelId, {
    ...model,
    attachment: { ...model.attachment!, massKg },
  });
  const inventory = new Inventory(registry);
  return { registry, inventory, rifle: inventory.create('rifle_assault'), ...exported };
};

const attachmentFixture = (itemType: string) => {
  const fitted = withDefaultAttachment(baseRegistry, 'rifle_assault', itemType);
  const inventory = new Inventory(fitted.registry);
  const rifle = inventory.create('rifle_assault');
  if (slotsReason(fitted.registry, rifle.type, rifle.slots)) {
    throw new Error('Factory-created fitted attachment is not accepted by slotsReason');
  }
  return { ...fitted, inventory, rifle };
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
    const lightFixture = fixture(0.01);
    const loadedFixture = fixture();
    expect(lightFixture.inventory.add(lightFixture.rifle, { kind: 'hand', side: 'right' })).toBe(true);
    expect(loadedFixture.inventory.add(loadedFixture.rifle, { kind: 'hand', side: 'right' })).toBe(true);
    const mechanicsFor = (inventory: Inventory) =>
      new FirearmMechanics(inventory, new HandlingQueue(inventory), {
        blockSize: 1,
        pose: () => undefined,
        onEjection: () => undefined,
      });
    const lightMechanics = mechanicsFor(lightFixture.inventory);
    const loadedMechanics = mechanicsFor(loadedFixture.inventory);
    const lighter = lightMechanics.skillZeroHandlingFor(lightFixture.rifle.uid);
    const lighterStance = lightMechanics.stanceEffectsFor(lightFixture.rifle.uid);
    expect(muzzleLoad(loadedFixture.registry, loadedFixture.rifle)).toBeGreaterThan(0);
    const loaded = loadedMechanics.skillZeroHandlingFor(loadedFixture.rifle.uid);
    const loadedStance = loadedMechanics.stanceEffectsFor(loadedFixture.rifle.uid);

    expect(loaded.singleShot.variance).toBeGreaterThan(lighter.singleShot.variance);
    expect(loaded.singleShot.recoilRecoveryScale).toBeLessThan(lighter.singleShot.recoilRecoveryScale);
    expect(loadedStance.raiseDurationSimSeconds).toBeGreaterThan(lighterStance.raiseDurationSimSeconds);
    expect(loadedStance.readyMovementFactor).toBeLessThan(lighterStance.readyMovementFactor);
  });

  it('gives an improvised suppressor less recoil and noise reduction and faster wear', () => {
    const realFixture = attachmentFixture('real_suppressor');
    const real = realFixture.rifle.slots?.[realFixture.fitted.mountedAt];
    if (!real) {
      throw new Error('Factory-created suppressor default is missing');
    }
    const realResponse = firearmAttachmentResponse(realFixture.registry, realFixture.rifle);
    wearFirearmAttachments(realFixture.registry, realFixture.rifle);
    const realWear = 1 - real.condition;
    const wornRealResponse = firearmAttachmentResponse(realFixture.registry, realFixture.rifle);

    const improvisedFixture = attachmentFixture('improvised_suppressor');
    const improvised = improvisedFixture.rifle.slots?.[improvisedFixture.fitted.mountedAt];
    if (!improvised) {
      throw new Error('Factory-created suppressor default is missing');
    }
    const improvisedResponse = firearmAttachmentResponse(improvisedFixture.registry, improvisedFixture.rifle);
    wearFirearmAttachments(improvisedFixture.registry, improvisedFixture.rifle);

    expect(improvisedResponse.recoilScale).toBeGreaterThan(realResponse.recoilScale);
    expect(improvisedResponse.noiseFactor).toBeGreaterThan(realResponse.noiseFactor);
    expect(wornRealResponse.noiseFactor).toBeGreaterThan(realResponse.noiseFactor);
    expect(wornRealResponse.recoilScale).toBeGreaterThan(realResponse.recoilScale);
    expect(1 - improvised.condition).toBeGreaterThan(realWear);
  });

  it('maps the foregrip to improved aim and stance response', () => {
    const fitted = attachmentFixture('foregrip');

    const response = firearmAttachmentResponse(fitted.registry, fitted.rifle);

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

  it('uses exported attachment mass for muzzle load and inventory weight', () => {
    const registry = freshRegistry();
    const rifle = new Inventory(registry).create('rifle_assault');
    const child = Object.values(rifle.slots ?? {}).find((candidate) => candidate !== undefined);
    if (!child) {
      throw new Error('Factory-created rifle has no default attachment child');
    }
    const modelId = defOf(registry, child.type).model;
    const model = modelId === undefined ? undefined : registry.models.get(modelId);
    if (!model?.attachment) {
      throw new Error('Factory-created attachment has no exported mass metadata');
    }
    const initialLoad = muzzleLoad(registry, rifle);
    const initialWeight = weightOf(registry, child);
    if (initialLoad === undefined) {
      throw new Error('Factory-created rifle has no measurable attachment load');
    }

    registry.models.set(model.id, {
      ...model,
      attachment: { ...model.attachment, massKg: model.attachment.massKg * 2 },
    });

    expect(muzzleLoad(registry, rifle)).toBeGreaterThan(initialLoad);
    expect(weightOf(registry, child)).toBeGreaterThan(initialWeight);
  });
});
