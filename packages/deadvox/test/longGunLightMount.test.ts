import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { Registry } from '../src/core/content.ts';
import { LIGHT_MOUNT_SLOT } from '../src/core/firearmFitting.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import { toggleLight } from '../src/core/lights.ts';
import { FirearmAttachmentHandling } from '../src/game/firearmAttachmentHandling.ts';
import { HeldItems } from '../src/render/hands.ts';
import { baseRegistry } from './baseRegistry.ts';

const SITE_KIND = 'fixture-strap';

// Fixture ids derived from real content so the model, lens and light come from authored data.
const fixtureRegistry = (): Registry => {
  const base = baseRegistry();
  const gun = base.items.get('pump_shotgun')!;
  const mount = base.items.get('taped_flashlight_mount')!;
  const items = new Map(base.items);
  items.set('fixture_gun', {
    ...gun,
    id: 'fixture_gun',
    lightMountSite: { kind: SITE_KIND, at: gun.lightMountSite!.at, turn: gun.lightMountSite!.turn },
  });
  items.set('fixture_bare_gun', { ...gun, id: 'fixture_bare_gun', lightMountSite: undefined });
  items.set('fixture_mount', { ...mount, id: 'fixture_mount', lightMount: { kind: SITE_KIND } });
  items.set('fixture_other_mount', { ...mount, id: 'fixture_other_mount', lightMount: { kind: 'fixture-other' } });
  return { ...base, items };
};

const setup = () => {
  const registry = fixtureRegistry();
  const inventory = new Inventory(registry);
  const queue = new HandlingQueue(inventory);
  const handling = new FirearmAttachmentHandling(inventory, queue, () => [0, 0, 0]);
  return { registry, inventory, queue, handling };
};

const fitted = (inventory: Inventory) => {
  const gun = inventory.create('fixture_gun');
  const mount = inventory.create('fixture_mount');
  inventory.add(gun, { kind: 'hand', side: 'right' });
  inventory.add(mount, { kind: 'pile', pos: [0, 0, 0] });
  return { gun, mount };
};

describe('a light mount on a long gun', () => {
  it('is fitted and removed through the timed attachment path', () => {
    const { inventory, queue, handling } = setup();
    const { gun, mount } = fitted(inventory);
    expect(handling.fit(gun.uid, LIGHT_MOUNT_SLOT, mount.uid)).toBeUndefined();
    expect(gun.slots?.[LIGHT_MOUNT_SLOT]).toBeUndefined();
    queue.tick(60);
    expect(gun.slots?.[LIGHT_MOUNT_SLOT]).toBe(mount);
    expect(handling.remove(gun.uid, LIGHT_MOUNT_SLOT)).toBeUndefined();
    queue.tick(60);
    expect(gun.slots?.[LIGHT_MOUNT_SLOT]).toBeUndefined();
  });

  it('refuses a mount whose kind the gun does not take', () => {
    const { inventory, handling } = setup();
    const { gun } = fitted(inventory);
    const other = inventory.create('fixture_other_mount');
    inventory.add(other, { kind: 'pile', pos: [0, 0, 0] });
    expect(handling.fit(gun.uid, LIGHT_MOUNT_SLOT, other.uid)).toBeTypeOf('string');
  });

  it('refuses a gun that content gives no place for a light', () => {
    const { inventory, handling } = setup();
    const bare = inventory.create('fixture_bare_gun');
    const mount = inventory.create('fixture_mount');
    inventory.add(bare, { kind: 'hand', side: 'right' });
    inventory.add(mount, { kind: 'pile', pos: [0, 0, 0] });
    expect(handling.fit(bare.uid, LIGHT_MOUNT_SLOT, mount.uid)).toBeTypeOf('string');
  });

  it('shines from the held gun and switches with the light toggle', () => {
    const { registry, inventory, queue, handling } = setup();
    const { gun, mount } = fitted(inventory);
    handling.fit(gun.uid, LIGHT_MOUNT_SLOT, mount.uid);
    queue.tick(60);
    const light = gun.slots![LIGHT_MOUNT_SLOT]!;
    expect(toggleLight(registry, light, 0)).toBeUndefined();
    expect(light.on).toBe(true);
    const held = new HeldItems(inventory, undefined, registry.figures.get('player')!.palette);
    held.update(new PerspectiveCamera());
    expect(held.lensOf(light, new Vector3())).toBe(true);
    held.dispose();
  });

  it('keeps the fitted light and its on state through a save round trip', () => {
    const { registry, inventory, queue, handling } = setup();
    const { gun, mount } = fitted(inventory);
    handling.fit(gun.uid, LIGHT_MOUNT_SLOT, mount.uid);
    queue.tick(60);
    const light = gun.slots![LIGHT_MOUNT_SLOT]!;
    expect(toggleLight(registry, light, 0)).toBeUndefined();
    const restored = Inventory.restoreState(registry, structuredClone(inventory.snapshotState()) as never);
    const restoredLight = restored.itemByUid(gun.uid)!.slots?.[LIGHT_MOUNT_SLOT];
    expect(restoredLight?.uid).toBe(light.uid);
    expect(restoredLight?.on).toBe(true);
  });
});
