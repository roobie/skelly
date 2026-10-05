import { readdirSync, readFileSync } from 'node:fs';
import { PerspectiveCamera, Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { buildRegistry, type ContentSource } from '../src/core/content.ts';
import { Inventory } from '../src/core/inventory.ts';
import { toggleLight } from '../src/core/lights.ts';
import { LightPool, POINT_LIGHT_POOL_SIZE } from '../src/render/lightPool.ts';

const read = (source: string): ContentSource => ({ source, data: JSON.parse(readFileSync(source, 'utf8')) });
const { registry } = buildRegistry(
  readdirSync('src/content/base')
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => read(`src/content/base/${file}`)),
);

describe('made-light point pool', () => {
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

    pool.update(inventory, held, camera, 1, 1);
    expect(pool.lights).toHaveLength(POINT_LIGHT_POOL_SIZE);
    expect(pool.lights.filter((light) => light.intensity > 0)).toHaveLength(1);

    inventory.consume(first);
    pool.update(inventory, held, camera, 1, 1);
    expect(pool.lights).toHaveLength(POINT_LIGHT_POOL_SIZE);
    expect(pool.lights.every((light) => light.intensity === 0)).toBe(true);
  });

  it('keeps both hands ahead of pockets and stable pocket order at the carried-source limit', () => {
    const pool = new LightPool(new Scene());
    const inventory = new Inventory(registry);
    const camera = new PerspectiveCamera();
    const held = { lightPositionOf: () => false };
    const right = inventory.create('torch');
    const left = inventory.create('candle');
    const hoodie = inventory.create('hoodie');
    expect(inventory.add(right, { kind: 'hand', side: 'right' })).toBe(true);
    expect(inventory.add(left, { kind: 'hand', side: 'left' })).toBe(true);
    expect(inventory.add(hoodie, { kind: 'worn' })).toBe(true);
    const pocketed = ['lighter', 'glowstick', 'matches'].map((type) => inventory.create(type));
    for (const item of pocketed) {
      expect(inventory.add(item, { kind: 'pocket', owner: hoodie, pocket: 0 })).toBe(true);
    }
    for (const item of [right, left, ...pocketed]) {
      expect(toggleLight(registry, item, 0)).toBeUndefined();
    }

    pool.update(inventory, held, camera, 1, 1);
    const expected = [right, left, ...pocketed.slice(0, 2)].map(
      (item) => registry.items.get(item.type)!.light!.intensity,
    );
    expect(pool.lights.slice(0, expected.length).map((light) => light.intensity)).toEqual(expected);
    expect(pool.lights.at(-1)!.intensity).toBe(0);
  });
});
