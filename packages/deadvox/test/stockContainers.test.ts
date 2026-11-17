import { coreMessage } from '@skelly/engine/internal/core/coreText.ts';
import { Inventory } from '@skelly/engine/inventory';
import { FurnitureMeshes } from '@skelly/presentation/internal/render/furniture.ts';
import { stockShapeStep } from '@skelly/presentation/internal/render/stockShape.ts';
import { InstancedMesh, Mesh } from 'three';
import { expect, it } from 'vitest';
import { baseRegistry } from './baseRegistry.ts';
import { buildFixtureRegistry } from './economyFixtures.ts';

const own = 'fixture_stock_material';
const other = 'fixture_other_material';
const pieceType = 'fixture_stock_piece';
const boxType = 'fixture_stock_box';
const container = { accepts: [own], pockets: [{ grid: [2, 2], handlingSimSeconds: 0 }] };
const shape = (height: number) => [{ position: [0, 0, 0], size: [2, height, 2] }];
const source = {
  inventory: [...baseRegistry().inventory.values()],
  items: [
    { id: own, name: 'Fixture material', category: 'material', weight: 1, size: [1, 1], stack: 10 },
    { id: other, name: 'Other material', category: 'material', weight: 1, size: [1, 1], stack: 10 },
    { id: boxType, name: 'Stock box', category: 'bag', weight: 1, size: [2, 2], container },
  ],
  furniture: [
    {
      id: pieceType,
      name: 'Stock',
      size: [2, 2, 2],
      color: '#888888',
      container,
      shape: shape(2),
      solidFill: 0.5,
      stockAppearance: {
        fullCount: 10,
        steps: [
          { from: 0, shape: shape(0.1) },
          { from: 0.1, shape: shape(1) },
          { from: 0.8, shape: shape(2) },
        ],
      },
    },
  ],
};
const fixture = () => {
  const built = buildFixtureRegistry([{ source: 'stock-fixture', data: source }]);
  if (built.issues.length > 0) {
    throw new Error(JSON.stringify(built.issues));
  }
  const inventory = new Inventory(built.registry);
  const piece = inventory.furnish({ type: pieceType, pos: [0, 0, 0], size: [2, 2, 2], facing: 'n' })!;
  inventory.entities.markSearched(piece);
  return { inventory, piece, registry: built.registry };
};

it.each(['furniture', 'pocket'] as const)(
  'filters %s additions, moves and swaps without changing rejected stock',
  (kind) => {
    const { inventory, piece, registry } = fixture();
    const box = inventory.create(boxType);
    expect(inventory.add(box, { kind: 'hand', side: 'left' })).toBe(true);
    const target = kind === 'furniture' ? { kind, entity: piece, pocket: 0 } : { kind, owner: box, pocket: 0 };
    const accepted = inventory.create(own);
    const rejected = inventory.create(other);
    expect(inventory.add(accepted, target)).toBe(true);
    expect(inventory.add(rejected, { kind: 'hand', side: 'right' })).toBe(true);
    const before = inventory.snapshotState();
    const reason = coreMessage(registry, 'containerAcceptsOnly', {
      items: registry.items.get(own)!.name.toLowerCase(),
    });
    expect(inventory.plan(rejected, target)).toMatchObject({ ok: false, reason });
    expect(inventory.move(rejected, { ...target, at: { x: 0, y: 0, rotated: false } })).toMatchObject({ ok: false });
    expect(inventory.planAdd(rejected, target)).toMatchObject({ ok: false, reason });
    expect(inventory.snapshotState()).toEqual(before);
    expect(inventory.consume(rejected)).toBe(true);
    expect(inventory.move(accepted, { kind: 'hand', side: 'right' }).ok).toBe(true);
    expect(inventory.move(accepted, target).ok).toBe(true);
  },
);

it('restages smaller stock geometry as fill falls and reuses the matching cached step on refill', () => {
  const { inventory, piece, registry } = fixture();
  const material = inventory.create(own, 10);
  expect(inventory.add(material, { kind: 'furniture', entity: piece, pocket: 0 })).toBe(true);
  const def = registry.furniture.get(pieceType)!;
  const view = new FurnitureMeshes(0.5);
  const full = view.pieceMesh(piece, def);
  expect(full).toBeInstanceOf(Mesh);
  const fullGeometry = (full as Mesh).geometry;
  view.sync(inventory.entities);
  const drawnGeometry = () =>
    (view.group.children.find((child) => child instanceof InstancedMesh) as InstancedMesh).geometry;
  expect(drawnGeometry()).toBe(fullGeometry);
  let previous = stockShapeStep(piece, def);
  for (let remaining = material.count - 1; remaining >= 0; remaining--) {
    expect(inventory.consume(material)).toBe(true);
    const step = stockShapeStep(piece, def);
    expect(step).toBeLessThanOrEqual(previous);
    previous = step;
    view.sync(inventory.entities);
  }
  const emptyGeometry = drawnGeometry();
  expect(emptyGeometry).not.toBe(fullGeometry);
  expect(emptyGeometry.boundingBox!.max.y).toBeLessThan(fullGeometry.boundingBox!.max.y);
  expect(inventory.add(inventory.create(own, 10), { kind: 'furniture', entity: piece, pocket: 0 })).toBe(true);
  view.sync(inventory.entities);
  expect(drawnGeometry()).toBe(fullGeometry);
  view.dispose();
});

it('rejects an unknown accepted type at content admission', () => {
  const built = buildFixtureRegistry([
    {
      source: 'bad-filter',
      data: {
        items: [{ ...source.items[2], container: { ...container, accepts: ['fixture_missing'] } }],
      },
    },
  ]);
  expect(built.issues.some(({ path }) => path.includes('.container.accepts'))).toBe(true);
});
