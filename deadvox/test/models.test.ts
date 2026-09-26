import { readFileSync } from 'node:fs';
import { Box3, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { buildRegistry, type ContentSource } from '../src/core/content.ts';
import { Inventory, PILE_GRID, type Pile } from '../src/core/inventory.ts';
import { pileLayout } from '../src/core/pileLayout.ts';
import { prepareModel } from '../src/render/models.ts';

const BASE = 'src/content/base';
const read = (source: string): ContentSource => ({ source, data: JSON.parse(readFileSync(source, 'utf8')) });
const { registry, issues } = buildRegistry([
  ...['items-food.json', 'items-other.json', 'items-tools.json', 'items-wearables.json'].map((f) =>
    read(`${BASE}/${f}`),
  ),
  read('test/fixtures/packs/lamp/lamp.json'),
]);

describe('piles with models', () => {
  const inventory = new Inventory(registry);
  const S = 0.5;
  const pile: Pile = {
    pos: [10, 4, -3],
    items: [
      // The lamp is 3 × 1 cells, long along the grid's x.
      { item: inventory.create('lamp'), x: 2, y: 1, rotated: false },
      { item: inventory.create('lamp'), x: 6, y: 2, rotated: true },
      { item: inventory.create('canned_beans'), x: 0, y: 4, rotated: false },
    ],
  };

  it('lays each item with a model at the middle of its cells, turned as it lies', () => {
    expect(issues).toEqual([]);
    const { models, bundle } = pileLayout(registry, pile, S);
    expect(models.map((m) => [m.model, m.at, m.yaw])).toEqual([
      ['lamp', [(10 + 3.5 / PILE_GRID.w) * S, 4 * S, (-3 + 1.5 / PILE_GRID.h) * S], 0],
      ['lamp', [(10 + 6.5 / PILE_GRID.w) * S, 4 * S, (-3 + 3.5 / PILE_GRID.h) * S], Math.PI / 2],
    ]);
    expect(bundle.map((p) => p.item.type)).toEqual(['canned_beans']);
  });

  it("keeps items in the bundle while their model can't be drawn", () => {
    const { models, bundle } = pileLayout(registry, pile, S, () => false);
    expect(models).toEqual([]);
    expect(bundle.map((p) => p.item.type)).toEqual(['lamp', 'lamp', 'canned_beans']);
  });

  it('turns an item whose long side is its height the other way', () => {
    const flashlight = registry.items.get('flashlight')!; // 1 × 2 cells
    const lamp = registry.models.get('lamp')!;
    const withModel = new Map(registry.items).set('flashlight', { ...flashlight, model: lamp.id });
    const layout = pileLayout(
      { ...registry, items: withModel },
      {
        pos: [0, 0, 0],
        items: [
          { item: inventory.create('flashlight'), x: 0, y: 0, rotated: false },
          { item: inventory.create('flashlight'), x: 2, y: 0, rotated: true },
        ],
      },
      S,
    );
    expect(layout.models.map((m) => m.yaw)).toEqual([Math.PI / 2, 0]);
  });
});

describe('model forms', () => {
  const load = async () => {
    const bytes = readFileSync('test/fixtures/packs/lamp/assets/models/lamp.glb');
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const gltf = await new GLTFLoader().parseAsync(buffer, '');
    return prepareModel(registry.models.get('lamp')!, gltf.scene);
  };

  it('lies centred over its origin, resting on the ground', async () => {
    const { ground } = await load();
    const box = new Box3().setFromObject(ground);
    expect(box.min.y).toBeCloseTo(0);
    expect(box.getCenter(new Vector3()).x).toBeCloseTo(0);
    expect(box.getCenter(new Vector3()).z).toBeCloseTo(0);
    expect(box.max.x - box.min.x).toBeCloseTo(0.3); // long side along x
  });

  it('is held at its grip, pointing forward', async () => {
    const { held } = await load();
    held.updateMatrixWorld(true);
    // The fixture's box runs 0.3 m along x; the grip is 0.05 m from its back end.
    const box = new Box3().setFromObject(held);
    expect(box.min.z).toBeCloseTo(-0.25);
    expect(box.max.z).toBeCloseTo(0.05);
    expect(box.max.x - box.min.x).toBeCloseTo(0.1);
  });
});
