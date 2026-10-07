import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { pickInteractionTarget } from '../src/core/interactionPick.ts';
import { Inventory } from '../src/core/inventory.ts';
import type { SolidAt } from '../src/core/raycast.ts';
import { PILE_DISPLAY_KIND } from '../src/core/schema.ts';

const BASE = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(BASE)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown })),
);
const itemType = [...registry.items.values()].find(
  (def) => def.model === undefined && def.pileDisplay !== PILE_DISPLAY_KIND.scatter,
)?.id;
if (!itemType) {
  throw new Error('Interaction picking fixture needs a bundled item');
}

const options = (inventory: Inventory, origin: Vec3, direction: Vec3, isSolid: SolidAt = () => false) => ({
  inventory,
  entities: inventory.entities,
  origin,
  direction,
  maxDistance: 4,
  blockSize: 0.5,
  isSolid,
  hasModel: () => false,
});

describe('F interaction target selection', () => {
  it('targets the visible bundle and resolves overlapping bundled items by uid', () => {
    const inventory = new Inventory(registry);
    const first = inventory.create(itemType!);
    const second = inventory.create(itemType!);
    expect(inventory.add(first, { kind: 'pile', pos: [0, 0, 0] })).toBe(true);
    expect(inventory.add(second, { kind: 'pile', pos: [0, 0, 0] })).toBe(true);

    const target = pickInteractionTarget(options(inventory, [0.5, 1, 0.5], [0, -1, 0]));
    expect(target).toMatchObject({ kind: 'item', item: { uid: first.uid } });
  });

  it('lets the nearer ground bundle beat a farther container under the same ray', () => {
    const inventory = new Inventory(registry);
    const item = inventory.create(itemType!);
    expect(inventory.add(item, { kind: 'pile', pos: [0, 0, 0] })).toBe(true);
    const cupboard = inventory.furnish({ type: 'kitchen_cupboard', pos: [0, 0, 2], size: [2, 2, 1], facing: 'n' }, []);
    expect(cupboard).toBeDefined();

    const target = pickInteractionTarget(options(inventory, [0.5, 0.05, -1], [0, 0, 1]));
    expect(target).toMatchObject({ kind: 'item', item: { uid: item.uid } });
  });

  it('does not target a ground item through an opaque block', () => {
    const inventory = new Inventory(registry);
    const item = inventory.create(itemType!);
    expect(inventory.add(item, { kind: 'pile', pos: [0, 0, 0] })).toBe(true);

    const target = pickInteractionTarget(options(inventory, [0.5, 2, 0.5], [0, -1, 0], (_x, y) => y === 1));
    expect(target).toBeUndefined();
  });
});
