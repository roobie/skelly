import { readdirSync, readFileSync } from 'node:fs';
import { PerspectiveCamera, Scene, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { buildRegistry, type ContentSource } from '../src/core/content.ts';
import { Inventory } from '../src/core/inventory.ts';
import { toggleLight } from '../src/core/lights.ts';
import { HeldItems } from '../src/render/hands.ts';
import { LightPool, POINT_LIGHT_POOL_SIZE } from '../src/render/lightPool.ts';

const read = (source: string): ContentSource => ({ source, data: JSON.parse(readFileSync(source, 'utf8')) });
const { registry } = buildRegistry(
  readdirSync('src/content/base')
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => read(`src/content/base/${file}`)),
);
const TEST_LIGHTS = [
  { id: 'test_light_1', intensity: 11 },
  { id: 'test_light_2', intensity: 22 },
  { id: 'test_light_3', intensity: 33 },
  { id: 'test_light_4', intensity: 44 },
  { id: 'test_light_5', intensity: 55 },
] as const;
const registryWithTestLights = () => {
  const items = new Map(registry.items);
  const source = registry.items.get('glowstick')!;
  for (const { id, intensity } of TEST_LIGHTS) {
    items.set(id, { ...source, id, name: id, light: { ...source.light!, intensity } });
  }
  return { ...registry, items };
};

describe('made-light point pool', () => {
  it.each(['right', 'left'] as const)('places carried burning lights at their held %s-hand position', (side) => {
    for (const type of ['candle', 'torch', 'glowstick']) {
      const scene = new Scene();
      const pool = new LightPool(scene);
      const inventory = new Inventory(registry);
      const light = inventory.create(type);
      expect(toggleLight(registry, light, 0)).toBeUndefined();
      expect(inventory.add(light, { kind: 'hand', side })).toBe(true);
      const held = new HeldItems(inventory, undefined, registry.figures.get('player')!.palette);
      const camera = new PerspectiveCamera();
      camera.position.set(2, 1, -3);
      held.update(camera);

      pool.update(inventory, { held, camera, blockSize: 1, daylightScale: 1 });

      const expected = new Vector3();
      expect(held.lightPositionOf(light, camera, expected)).toBe(true);
      expect(pool.lights[0]!.intensity, `${type} in ${side} hand`).toBeGreaterThan(0);
      expect(pool.lights[0]!.position.distanceTo(expected), `${type} in ${side} hand`).toBeLessThan(1e-9);
      held.dispose();
    }
  });

  it('keeps all eight shader-light slots allocated as sources change', () => {
    const scene = new Scene();
    const pool = new LightPool(scene);
    const inventory = new Inventory(registry);
    const camera = new PerspectiveCamera();
    camera.position.set(0, 1, 0);
    const held = { lightPositionOf: () => false };
    const first = inventory.create('glowstick');
    expect(toggleLight(registry, first, 0)).toBeUndefined();
    inventory.add(first, { kind: 'pile', pos: [1, 0, 0] });

    pool.update(inventory, { held, camera, blockSize: 1, daylightScale: 1 });
    expect(pool.lights).toHaveLength(POINT_LIGHT_POOL_SIZE);
    expect(pool.lights.filter((light) => light.intensity > 0)).toHaveLength(1);

    inventory.consume(first);
    pool.update(inventory, { held, camera, blockSize: 1, daylightScale: 1 });
    expect(pool.lights).toHaveLength(POINT_LIGHT_POOL_SIZE);
    expect(pool.lights.every((light) => light.intensity === 0)).toBe(true);
  });

  it('assigns the carried partition to both hands and the first pockets, excluding a fifth source', () => {
    const fixtureRegistry = registryWithTestLights();
    const pool = new LightPool(new Scene());
    const inventory = new Inventory(fixtureRegistry);
    const camera = new PerspectiveCamera();
    const held = { lightPositionOf: () => false };
    const [rightId, leftId, ...pocketIds] = TEST_LIGHTS.map(({ id }) => id);
    const right = inventory.create(rightId!);
    const left = inventory.create(leftId!);
    const hoodie = inventory.create('hoodie');
    expect(inventory.add(right, { kind: 'hand', side: 'right' })).toBe(true);
    expect(inventory.add(left, { kind: 'hand', side: 'left' })).toBe(true);
    expect(inventory.add(hoodie, { kind: 'worn' })).toBe(true);
    const pocketed = pocketIds.map((id) => inventory.create(id));
    for (const item of pocketed) {
      expect(inventory.add(item, { kind: 'pocket', owner: hoodie, pocket: 0 })).toBe(true);
      expect(toggleLight(fixtureRegistry, item, 0)).toBeUndefined();
    }
    for (const item of [right, left]) {
      expect(toggleLight(fixtureRegistry, item, 0)).toBeUndefined();
    }

    pool.update(inventory, { held, camera, blockSize: 1, daylightScale: 1 });
    const pocketIntensities = [...inventory.items()]
      .filter(({ location }) => location.kind === 'pocket' && location.owner === hoodie)
      .map(({ item }) => fixtureRegistry.items.get(item.type)!.light!.intensity);
    const handIntensities = [right, left].map((item) => fixtureRegistry.items.get(item.type)!.light!.intensity);
    expect(pocketIntensities).toHaveLength(3);
    expect(pool.lights.map((light) => light.intensity)).toEqual([
      ...handIntensities,
      ...pocketIntensities.slice(0, 2),
      0,
      0,
      0,
      0,
    ]);
  });

  it('assigns the dropped partition to the nearest four stay-lit lights', () => {
    const fixtureRegistry = registryWithTestLights();
    const pool = new LightPool(new Scene());
    const inventory = new Inventory(fixtureRegistry);
    const camera = new PerspectiveCamera();
    const held = { lightPositionOf: () => false };
    const distances = [5, 2, 9, 1, 4];
    for (const [index, { id }] of TEST_LIGHTS.entries()) {
      const item = inventory.create(id);
      expect(toggleLight(fixtureRegistry, item, 0)).toBeUndefined();
      expect(inventory.add(item, { kind: 'pile', pos: [distances[index]!, 0, 0] })).toBe(true);
    }

    pool.update(inventory, { held, camera, blockSize: 1, daylightScale: 1 });
    const selectedIntensities = pool.lights.map((light) => light.intensity).filter((intensity) => intensity > 0);
    const farthestIndex = distances.indexOf(Math.max(...distances));
    const nearestIntensities = TEST_LIGHTS.filter((_, index) => index !== farthestIndex).map(
      ({ intensity }) => intensity,
    );
    expect(selectedIntensities).toHaveLength(4);
    expect(new Set(selectedIntensities)).toEqual(new Set(nearestIntensities));
    expect(selectedIntensities).not.toContain(TEST_LIGHTS[farthestIndex]!.intensity);
  });
});
