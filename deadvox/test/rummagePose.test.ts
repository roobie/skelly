import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Group, PerspectiveCamera, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import { FirearmMechanics } from '../src/game/firearmHandling.ts';
import { Unpacking } from '../src/game/unpacking.ts';
import { HeldItems } from '../src/render/hands.ts';
import type { ModelLibrary } from '../src/render/models.ts';

it('rummage converges around the active held job, returns on completion or cancellation, and leaves dedicated poses and game state alone', () => {
  const base = 'src/content/base';
  const { registry, issues } = buildRegistry([
    ...readdirSync(base)
      .filter((file) => file.endsWith('.json'))
      .sort()
      .map((file) => ({
        source: file,
        data: JSON.parse(readFileSync(join(base, file), 'utf8')) as unknown,
      })),
    {
      source: 'rummage-fixture.json',
      data: {
        items: [
          {
            id: 'fixture_package',
            name: 'Fixture package',
            category: 'misc',
            weight: 50,
            size: [2, 2],
            unpack: { item: 'fixture_payload', count: 3 },
          },
          { id: 'fixture_payload', name: 'Fixture payload', category: 'misc', weight: 10, size: [1, 1], stack: 7 },
          {
            id: 'fixture_twohanded',
            name: 'Fixture two-handed item',
            category: 'misc',
            weight: 100,
            size: [2, 3],
            twoHanded: true,
          },
        ],
      },
    },
  ]);
  expect(issues).toEqual([]);
  const inventory = new Inventory(registry);
  const box = inventory.create('fixture_package');
  expect(inventory.add(box, { kind: 'hand', side: 'right' })).toBe(true);
  const queue = new HandlingQueue(inventory);
  const unpacking = new Unpacking(inventory, queue, () => [0, 0, 0]);
  const mechanics = new FirearmMechanics(inventory, queue, {
    blockSize: 0.5,
    pose: () => undefined,
    onEjection: () => undefined,
  });
  const models = { version: 0, held: () => ({ root: new Group(), parts: [] }) } as unknown as ModelLibrary;
  const held = new HeldItems(inventory, models, { skin: '#bbaa99', shirt: '#556677', trousers: '#334455' });
  const camera = new PerspectiveCamera();
  const update = (job = queue.jobs[0]) => {
    const before = structuredClone({
      inventory: inventory.snapshotState(),
      jobs: queue.jobs,
      version: inventory.version,
    });
    held.update(camera, undefined, 0, { firearms: mechanics.frames(), job });
    expect({ inventory: inventory.snapshotState(), jobs: queue.jobs, version: inventory.version }).toEqual(before);
    const { scene } = held.warmUpTarget;
    const wrists = (['right', 'left'] as const).map((side) => {
      const arm = scene.getObjectByName(`first-person-arm-${side}`);
      expect(arm).toBeDefined();
      return arm!.getObjectByName('grip-anchor')!.getWorldPosition(new Vector3());
    });
    return { wrists, separation: wrists[0]!.distanceTo(wrists[1]!) };
  };
  const rest = update();
  expect(unpacking.activate(box)).toBeUndefined();
  queue.tick(queue.remaining / 2);
  const working = update();
  expect(working.separation).toBeLessThan(rest.separation);
  for (let side = 0; side < rest.wrists.length; side++) {
    expect(working.wrists[side]!.distanceTo(rest.wrists[side]!)).toBeGreaterThan(0);
  }
  queue.cancel();
  expect(update().wrists).toEqual(rest.wrists);
  expect(unpacking.activate(box)).toBeUndefined();
  queue.tick(queue.remaining / 2);
  expect(update().separation).toBeLessThan(rest.separation);
  expect(queue.tick(queue.remaining).failed).toEqual([]);
  expect(inventory.itemByUid(box.uid)).toBeUndefined();
  expect(update().wrists).toEqual(rest.wrists);

  const gunDef = [...registry.items.values()].find((def) => def.firearm?.pump);
  expect(gunDef).toBeDefined();
  const gun = inventory.create(gunDef!.id);
  expect(inventory.add(gun, { kind: 'hand', side: 'right' })).toBe(true);
  expect(mechanics.cock(gun.uid, 0)).toBeUndefined();
  queue.tick(queue.remaining / 2);
  const rackTime = queue.jobs[0]!.elapsed;
  mechanics.advanceTo(rackTime);
  expect(mechanics.frames().some((frame) => frame.uid === gun.uid && frame.mode === 'hand')).toBe(true);
  const dedicated = update();
  const before = structuredClone({ inventory: inventory.snapshotState(), jobs: queue.jobs });
  held.update(camera, undefined, 0, { firearms: mechanics.frames() });
  expect({ inventory: inventory.snapshotState(), jobs: queue.jobs }).toEqual(before);
  for (let side = 0; side < dedicated.wrists.length; side++) {
    const arm = held.warmUpTarget.scene.getObjectByName(`first-person-arm-${side === 0 ? 'right' : 'left'}`)!;
    expect(arm.getObjectByName('grip-anchor')!.getWorldPosition(new Vector3())).toEqual(dedicated.wrists[side]);
  }
  queue.cancel();
  mechanics.advanceTo(rackTime);
  expect(inventory.move(gun, { kind: 'pile', pos: [2, 0, 0] }).ok).toBe(true);
  const twoHanded = inventory.create('fixture_twohanded');
  expect(inventory.add(twoHanded, { kind: 'hand', side: 'right' })).toBe(true);
  const supportRest = update();
  expect(queue.enqueue(twoHanded, { kind: 'pile', pos: [2, 0, 0] }).ok).toBe(true);
  queue.tick(queue.remaining / 2);
  expect(update().separation).toBeLessThan(supportRest.separation);
  queue.cancel();
  expect(update().wrists).toEqual(supportRest.wrists);
  expect(inventory.move(twoHanded, { kind: 'pile', pos: [2, 0, 0] }).ok).toBe(true);
  const emptyRest = update();
  expect(queue.enqueue(twoHanded, { kind: 'hand', side: 'right' }).ok).toBe(true);
  queue.tick(queue.remaining / 2);
  expect(update().wrists).toEqual(emptyRest.wrists);
});
