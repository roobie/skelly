import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { InstancedMesh, Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { pickInteractionTarget } from '../src/core/interactionPick.ts';
import { Inventory, PILE_GRID } from '../src/core/inventory.ts';
import type { SolidAt } from '../src/core/raycast.ts';
import { PILE_DISPLAY_KIND } from '../src/core/schema.ts';
import { PileMeshes } from '../src/render/piles.ts';

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
const [modelItemType, secondModelItemType] = [...registry.items.values()]
  .filter(
    (def) =>
      def.model !== undefined &&
      def.size[0] === 1 &&
      def.size[1] === 1 &&
      def.pileDisplay !== PILE_DISPLAY_KIND.scatter,
  )
  .map(({ id }) => id);
if (modelItemType === undefined || secondModelItemType === undefined) {
  throw new Error('Interaction picking fixture needs two one-cell modeled items');
}
const scatterItemType = [...registry.items.values()].find((def) => def.pileDisplay === PILE_DISPLAY_KIND.scatter)?.id;
if (scatterItemType === undefined) {
  throw new Error('Interaction picking fixture needs a scatter item');
}

const options = (inventory: Inventory, origin: Vec3, direction: Vec3, isSolid: SolidAt = () => false) => ({
  inventory,
  entities: inventory.entities,
  origin,
  direction,
  maxDistance: 4,
  blockSize: 0.5,
  worldSeed: 1,
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

  it('resolves equal-distance modeled items by uid even when the higher uid enters the pile first', () => {
    const inventory = new Inventory(registry);
    const lowerUid = inventory.create(modelItemType!);
    const higherUid = inventory.create(secondModelItemType!);
    expect(higherUid.uid).toBeGreaterThan(lowerUid.uid);
    expect(inventory.add(higherUid, { kind: 'pile', pos: [0, 0, 0] })).toBe(true);
    expect(inventory.add(lowerUid, { kind: 'pile', pos: [0, 0, 0] })).toBe(true);

    const target = pickInteractionTarget({
      ...options(inventory, [1 / PILE_GRID.w, 0.05, -1], [0, 0, 1]),
      hasModel: () => true,
    });
    expect(target).toMatchObject({ kind: 'item', item: { uid: lowerUid.uid } });
    expect(target?.distanceBlocks).toBe(1);
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

  it('lets furniture win when its face and a ground item start at the same ray distance', () => {
    const inventory = new Inventory(registry);
    const item = inventory.create(modelItemType!);
    expect(inventory.add(item, { kind: 'pile', pos: [0, 0, 1] })).toBe(true);
    const ray: Vec3 = [0.1, 0.05, 0];
    const direction: Vec3 = [0, 0, 1];
    const itemHit = pickInteractionTarget({
      ...options(inventory, ray, direction),
      hasModel: () => true,
    });
    expect(itemHit).toMatchObject({ kind: 'item', item: { uid: item.uid } });

    const cupboard = inventory.furnish({ type: 'kitchen_cupboard', pos: [0, 0, 1], size: [2, 2, 1], facing: 'n' }, []);
    expect(cupboard).toBeDefined();
    const target = pickInteractionTarget({
      ...options(inventory, ray, direction),
      hasModel: () => true,
    });
    expect(target).toMatchObject({ kind: 'furniture', entity: { uid: cupboard!.uid } });
    expect(target?.distanceBlocks).toBe(itemHit?.distanceBlocks);
  });

  it('targets scatter at the instance position drawn by PileMeshes', () => {
    const inventory = new Inventory(registry);
    const item = inventory.create(scatterItemType!);
    expect(inventory.add(item, { kind: 'pile', pos: [2, 1, -3] })).toBe(true);
    const piles = new PileMeshes(0.5, undefined, 1);
    piles.sync(inventory);
    const cases = piles.group.children.find((child) => child instanceof InstancedMesh);
    if (!(cases instanceof InstancedMesh)) {
      throw new Error('Scatter fixture did not render an instanced case');
    }
    const matrix = new Matrix4();
    cases.getMatrixAt(0, matrix);
    const position = new Vector3().setFromMatrixPosition(matrix);
    const target = pickInteractionTarget(
      options(inventory, [position.x / 0.5, position.y / 0.5 + 0.5, position.z / 0.5], [0, -1, 0]),
    );
    expect(target).toMatchObject({ kind: 'item', item: { uid: item.uid } });
    piles.dispose();
  });

  it('does not target a ground item through an opaque block', () => {
    const inventory = new Inventory(registry);
    const item = inventory.create(itemType!);
    expect(inventory.add(item, { kind: 'pile', pos: [0, 0, 0] })).toBe(true);

    const target = pickInteractionTarget(options(inventory, [0.5, 2, 0.5], [0, -1, 0], (_x, y) => y === 1));
    expect(target).toBeUndefined();
  });
});
