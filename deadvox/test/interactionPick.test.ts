import { Box3, BoxGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { worldOpaque, worldSolid } from '../src/core/collision.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { interactionAffordance } from '../src/core/interactionAffordance.ts';
import { pickInteractionTarget } from '../src/core/interactionPick.ts';
import { Inventory, PILE_GRID } from '../src/core/inventory.ts';
import type { SolidAt } from '../src/core/raycast.ts';
import { PILE_DISPLAY_KIND } from '../src/core/schema.ts';
import { World } from '../src/core/world.ts';
import { FurnitureMeshes } from '../src/render/furniture.ts';
import { markInteractionTarget } from '../src/render/interactionMarker.ts';
import type { ModelLibrary } from '../src/render/models.ts';
import { PileMeshes } from '../src/render/piles.ts';
import { baseRegistry } from './baseRegistry.ts';

const registry = baseRegistry();
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
  isOpaque: () => false,
  hasModel: () => false,
});

describe('F interaction target selection', () => {
  it('blocks furniture interaction behind solid see-through wire and passable opaque foliage', () => {
    const world = new World();
    const inventory = new Inventory(registry);
    const can = inventory.furnish({ type: 'ammo_can', pos: [2, 0, 0], size: [1, 1, 1], facing: 'n' }, []);
    expect(can).toBeDefined();
    const pick = () =>
      pickInteractionTarget({
        ...options(inventory, [0.5, 0.5, 0.5], [1, 0, 0], worldSolid(world, registry, inventory.entities)),
        isOpaque: worldOpaque(world, registry, inventory.entities),
      });
    expect(pick()).toMatchObject({ kind: 'furniture', entity: can });
    for (const block of ['chain_link', 'leaves']) {
      world.setBlock(1, 0, 0, registry.blockIds.get(block)!);
      expect(pick(), block).toBeUndefined();
    }
  });

  it('encloses the drawn bundle and refreshes its bounds with the same selected item', () => {
    const fixture = { ...registry, items: new Map(registry.items) };
    fixture.items.set('marker_fixture', {
      ...registry.items.get(itemType!)!,
      id: 'marker_fixture',
      size: [1, 1],
      model: undefined,
      stack: undefined,
      pileDisplay: undefined,
    });
    const inventory = new Inventory(fixture);
    const first = inventory.create('marker_fixture');
    const destination = { kind: 'pile' as const, pos: [0, 0, 0] as Vec3 };
    expect(inventory.add(first, destination)).toBe(true);
    for (let index = 0; index < 23; index++) {
      expect(inventory.add(inventory.create('marker_fixture'), destination)).toBe(true);
    }
    const piles = new PileMeshes(0.5);
    const furniture = new FurnitureMeshes(0.5);
    const target = pickInteractionTarget(options(inventory, [0.5, 1, 0.5], [0, -1, 0]));
    expect(target?.kind).toBe('item');
    const check = () => {
      piles.sync(inventory);
      markInteractionTarget(target, true, {
        furniture,
        piles,
        definition: (entity) => inventory.entities.defOf(entity),
        body: () => undefined,
        blockSize: 0.5,
      });
      const marker = furniture.group.children[0]!;
      expect(marker.visible).toBe(true);
      const drawn = new Box3().setFromObject(piles.group);
      const marked = new Box3().setFromObject(marker);
      for (const axis of ['x', 'y', 'z'] as const) {
        expect(marked.min[axis]).toBeLessThan(drawn.min[axis]);
        expect(marked.max[axis]).toBeGreaterThan(drawn.max[axis]);
      }
      return marker.scale.y;
    };
    const initialHeight = check();
    expect(inventory.add(inventory.create('marker_fixture'), destination)).toBe(true);
    expect(check()).toBeGreaterThan(initialHeight);
    markInteractionTarget(undefined, true, {
      furniture,
      piles,
      blockSize: 0.5,
      definition: (entity) => inventory.entities.defOf(entity),
      body: () => undefined,
    });
    expect(furniture.group.children[0]!.visible).toBe(false);
    piles.dispose();
  });

  it('keeps the furniture marker and prompt on the picked interaction owner', () => {
    const inventory = new Inventory(registry);
    const cupboard = inventory.furnish({ type: 'kitchen_cupboard', pos: [0, 0, 1], size: [2, 2, 1], facing: 'n' }, []);
    expect(cupboard).toBeDefined();
    const target = pickInteractionTarget(options(inventory, [0.5, 0.05, 0], [0, 0, 1]));
    const affordance = interactionAffordance(() => target, true, true, false);

    expect(affordance.target).toBe(target);
    expect(interactionAffordance(() => undefined, true, true, false)).toEqual({ target: undefined });
    expect(interactionAffordance(() => target, false, true, false)).toEqual({ target: undefined });
  });

  it('refreshes a selected item envelope when its model loads instead of the bundle', () => {
    const inventory = new Inventory(registry);
    const item = inventory.create(modelItemType!);
    expect(inventory.add(item, { kind: 'pile', pos: [2, 0, 3] })).toBe(true);
    const geometry = new BoxGeometry(0.4, 0.3, 0.2);
    const material = new MeshBasicMaterial();
    const model = new Group();
    const mesh = new Mesh(geometry, material);
    mesh.position.set(0.15, 0.15, -0.1);
    model.add(mesh);
    const library = { version: 0, has: () => library.version > 0, groundLook: () => model.clone() };
    const piles = new PileMeshes(0.5, library as unknown as ModelLibrary);
    const furniture = new FurnitureMeshes(0.5);
    const target = pickInteractionTarget(options(inventory, [2.5, 1, 3.5], [0, -1, 0]));
    expect(target).toMatchObject({ kind: 'item', item: { uid: item.uid } });
    const services = {
      furniture,
      piles,
      blockSize: 0.5,
      definition: (entity: import('../src/core/blockEntities.ts').BlockEntity) => inventory.entities.defOf(entity),
      body: () => undefined,
    };
    piles.sync(inventory);
    markInteractionTarget(target, true, services);
    const marker = furniture.group.children[0]!;
    const bundlePosition = marker.position.clone();
    library.version += 1;
    piles.sync(inventory);
    markInteractionTarget(target, true, services);
    expect(marker.visible).toBe(true);
    expect(marker.position.distanceTo(bundlePosition)).toBeGreaterThan(0);
    const marked = new Box3().setFromObject(marker);
    const drawn = new Box3().setFromObject(piles.group);
    for (const axis of ['x', 'y', 'z'] as const) {
      expect(marked.min[axis]).toBeLessThan(drawn.min[axis]);
      expect(marked.max[axis]).toBeGreaterThan(drawn.max[axis]);
    }
    piles.dispose();
    geometry.dispose();
    material.dispose();
  });

  it('targets the visible bundle', () => {
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

  it('lets a nearer downed body beat a farther container under the same ray', () => {
    const inventory = new Inventory(registry);
    const cupboard = inventory.furnish({ type: 'kitchen_cupboard', pos: [0, 0, 2], size: [2, 2, 1], facing: 'n' }, []);
    expect(cupboard).toBeDefined();
    const downedBodies = [{ id: 7, body: { pos: [0.5, 0, 0.5] as Vec3, halfWidth: 0.25, height: 3 } }];

    const target = pickInteractionTarget({ ...options(inventory, [0.5, 0.05, -1], [0, 0, 1]), downedBodies });
    expect(target).toMatchObject({ kind: 'body', id: 7 });
    const furniture = new FurnitureMeshes(0.5);
    const piles = new PileMeshes(0.5);
    markInteractionTarget(target, true, {
      furniture,
      piles,
      blockSize: 0.5,
      definition: (entity) => inventory.entities.defOf(entity),
      body: (id) => downedBodies.find((entry) => entry.id === id)?.body,
    });
    const marker = furniture.group.children[0]!;
    expect(marker.visible).toBe(true);
    const marked = new Box3().setFromObject(marker);
    const { pos, halfWidth, height } = downedBodies[0]!.body;
    expect(
      marked.containsPoint(new Vector3((pos[0] - halfWidth) * 0.5, pos[1] * 0.5, (pos[2] - halfWidth) * 0.5)),
    ).toBe(true);
    expect(
      marked.containsPoint(
        new Vector3((pos[0] + halfWidth) * 0.5, (pos[1] + height) * 0.5, (pos[2] + halfWidth) * 0.5),
      ),
    ).toBe(true);
    piles.dispose();
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
    const furniture = new FurnitureMeshes(0.5);
    markInteractionTarget(target, true, {
      furniture,
      piles,
      blockSize: 0.5,
      definition: (entity) => inventory.entities.defOf(entity),
      body: () => undefined,
    });
    const marker = furniture.group.children[0]!;
    expect(marker.visible).toBe(true);
    expect(new Box3().setFromObject(marker).containsBox(new Box3().setFromObject(cases))).toBe(true);
    piles.sync(inventory, new Set([item.uid]));
    markInteractionTarget(target, true, {
      furniture,
      piles,
      blockSize: 0.5,
      definition: (entity) => inventory.entities.defOf(entity),
      body: () => undefined,
    });
    expect(marker.visible).toBe(false);
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
