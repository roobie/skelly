import { readdirSync, readFileSync } from 'node:fs';
import { PerspectiveCamera, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { buildRegistry, type ContentSource } from '../src/core/content.ts';
import { Inventory } from '../src/core/inventory.ts';
import { toggleLight } from '../src/core/lights.ts';
import { HeldItems } from '../src/render/hands.ts';
import { withDefaultMountedLight } from './firearmAttachmentFixture.ts';

const read = (source: string): ContentSource => ({ source, data: JSON.parse(readFileSync(source, 'utf8')) });
const { registry } = buildRegistry(
  readdirSync('src/content/base')
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => read(`src/content/base/${file}`)),
);

it('resolves the lens of a light mounted on a held weapon through the weapon model', () => {
  const mounted = withDefaultMountedLight(registry, 'rifle_assault', 'flashlight');
  const inventory = new Inventory(mounted.registry);
  const gun = inventory.create('rifle_assault');
  const light = gun.slots![mounted.fitted.mountedAt]!;
  expect(inventory.add(gun, { kind: 'hand', side: 'right' })).toBe(true);
  expect(toggleLight(mounted.registry, light, 0)).toBeUndefined();
  const held = new HeldItems(inventory, undefined, mounted.registry.figures.get('player')!.palette);
  held.update(new PerspectiveCamera());
  expect(held.lensOf(light, new Vector3())).toBe(true);
  held.dispose();
});

it('gives a light in a pocket of a held container no lens', () => {
  const inventory = new Inventory(registry);
  const bag = inventory.create('school_backpack');
  const light = inventory.create('flashlight');
  expect(inventory.add(bag, { kind: 'hand', side: 'right' })).toBe(true);
  expect(inventory.add(light, { kind: 'pocket', owner: bag, pocket: 0 })).toBe(true);
  expect(toggleLight(registry, light, 0)).toBeUndefined();
  const held = new HeldItems(inventory, undefined, registry.figures.get('player')!.palette);
  held.update(new PerspectiveCamera());
  expect(held.lensOf(light, new Vector3())).toBe(false);
  held.dispose();
});
