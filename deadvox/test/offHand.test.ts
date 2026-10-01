import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { Inventory } from '../src/core/inventory.ts';
import { offHandUse } from '../src/core/lights.ts';

const BASE = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(BASE)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown })),
);

describe('offHandUse', () => {
  it('picks a light in the left hand', () => {
    const inventory = new Inventory(registry);
    const light = inventory.create('flashlight');
    expect(inventory.add(light, { kind: 'hand', side: 'left' })).toBe(true);
    expect(offHandUse(registry, inventory)).toBe(light);
  });

  it('ignores an empty left hand, a light only in the right hand, and a left item with no instant use', () => {
    const inventory = new Inventory(registry);
    expect(offHandUse(registry, inventory)).toBeUndefined();
    expect(inventory.add(inventory.create('flashlight'), { kind: 'hand', side: 'right' })).toBe(true);
    expect(offHandUse(registry, inventory)).toBeUndefined();
    const other = new Inventory(registry);
    expect(other.add(other.create('baseball_bat'), { kind: 'hand', side: 'left' })).toBe(true);
    expect(offHandUse(registry, other)).toBeUndefined();
  });
});
