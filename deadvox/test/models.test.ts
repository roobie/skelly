import { readFileSync } from 'node:fs';
import { Box3, type Loader, LoadingManager, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { buildRegistry, type ContentSource } from '../src/core/content.ts';
import { Inventory, PILE_GRID, type Pile } from '../src/core/inventory.ts';
import { pileLayout } from '../src/core/pileLayout.ts';
import { prepareModel } from '../src/render/models.ts';

const BASE = 'src/content/base';
const MODEL_FILE = /^assets\/models\/[a-z0-9_]+\.glb$/;
const AXIS_INDEX = { x: 0, y: 1, z: 2 } as const;
const read = (source: string): ContentSource => ({ source, data: JSON.parse(readFileSync(source, 'utf8')) });
const imageLoader = {
  isImageBitmapLoader: true,
  load(_url: string, onLoad: (image: ImageBitmap) => void) {
    onLoad({ width: 8, height: 8 } as ImageBitmap);
  },
};
const loader = new GLTFLoader(new LoadingManager());
Object.defineProperty(globalThis, 'self', { configurable: true, value: globalThis });
loader.manager.addHandler(/.*/, imageLoader as unknown as Loader);
const parseGlb = async (bytes: Buffer) => loader.parseAsync(Uint8Array.from(bytes).buffer, '');
const anchorIsInBounds = (anchor: readonly [number, number, number], bounds: Box3): boolean =>
  (['x', 'y', 'z'] as const).every((axis) => {
    const coordinate = anchor[AXIS_INDEX[axis]];
    return coordinate >= bounds.min[axis] - 0.02 && coordinate <= bounds.max[axis] + 0.02;
  });
const { registry, issues } = buildRegistry([
  ...['items-food.json', 'items-other.json', 'items-tools.json', 'items-wearables.json'].map((f) =>
    read(`${BASE}/${f}`),
  ),
  read(`${BASE}/models-melee.json`),
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
    const gltf = await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer, '');
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

describe('base pack melee', () => {
  const melee = buildRegistry([read(`${BASE}/models-melee.json`)]).registry;
  const models = [...melee.models.values()];

  it('maps the five matching Slice 1 items', () => {
    expect(
      ['crowbar', 'hammer', 'kitchen_knife', 'baseball_bat', 'steel_pipe'].map((id) => registry.items.get(id)?.model),
    ).toEqual(['crowbar', 'hammer', 'kitchen_knife', 'baseball_bat', 'steel_pipe']);
  });

  it('assigns the forward pose only to the four stabbing blades', () => {
    const forward = models
      .filter((model) => model.hold === 'forward')
      .map((model) => model.id)
      .sort();
    expect(forward).toEqual(['kabar', 'kitchen_knife', 'pocket_knife', 'tanto']);
    expect(models.filter((model) => model.hold !== 'forward').every((model) => model.hold === 'upright')).toBe(true);
  });

  it('requires a hold pose for every melee model', () => {
    const { hold, ...missingHold } = models[0]!;
    expect(hold).toBeDefined();
    const source = `${BASE}/models-melee.json`;
    const { issues: found } = buildRegistry([{ source, data: { models: [missingHold] } }]);
    expect(found).toContainEqual({ source, path: 'models[0].hold', message: 'missing' });
  });

  it.each(models.map((model) => [model.id, model] as const))(
    '%s loads, rests on x, and has usable palm and strike anchors at real-world scale',
    async (_, def) => {
      const bytes = readFileSync(`${BASE}/${def.file}`);
      const { scene } = await parseGlb(bytes);
      const sourceBox = new Box3().setFromObject(scene);
      const { ground } = prepareModel(def, scene);
      ground.updateMatrixWorld(true);
      const groundBox = new Box3().setFromObject(ground);
      const length = sourceBox.max.x - sourceBox.min.x;
      const grip = def.grip?.at;
      const strike = def.anchors?.strike;

      expect(grip).toBeDefined();
      expect(strike).toBeDefined();
      expect(strike![0]).toBeGreaterThan(grip![0]);
      expect(
        [grip!, strike!].every((anchor) => anchorIsInBounds(anchor, sourceBox)),
        `${def.id} anchors`,
      ).toBe(true);
      expect(groundBox.min.y).toBeCloseTo(0, 5);
      expect(groundBox.getCenter(new Vector3()).x).toBeCloseTo(0, 5);
      expect(groundBox.getCenter(new Vector3()).z).toBeCloseTo(0, 5);
      expect(length).toBeGreaterThan(0.15);
      expect(length).toBeLessThan(1.0);
      expect(def.file).toMatch(MODEL_FILE);
    },
  );

  it('holds the knife forward and hammer upright within centimetre bounds', async () => {
    const strikeInHand = async (id: string): Promise<Vector3> => {
      const def = melee.models.get(id)!;
      const bytes = readFileSync(`${BASE}/${def.file}`);
      const { scene } = await parseGlb(bytes);
      const { held } = prepareModel(def, scene);
      held.updateMatrixWorld(true);
      const offset = held.children[0]!.children[0]!;
      return new Vector3(...def.anchors!.strike!).applyMatrix4(offset.matrixWorld);
    };
    const knife = await strikeInHand('kitchen_knife');
    const hammer = await strikeInHand('hammer');

    // Relative to the grip at the origin: knife strike 29–31 cm ahead; hammer strike 27–29 cm above.
    expect(knife.z * 100).toBeGreaterThanOrEqual(-31);
    expect(knife.z * 100).toBeLessThanOrEqual(-29);
    expect(Math.abs(knife.x * 100)).toBeLessThan(1);
    expect(Math.abs(knife.y * 100)).toBeLessThan(1);
    expect(hammer.y * 100).toBeGreaterThanOrEqual(27);
    expect(hammer.y * 100).toBeLessThanOrEqual(29);
    expect(Math.abs(hammer.x * 100)).toBeLessThan(1);
    expect(Math.abs(hammer.z * 100)).toBeLessThan(1);
  });

  it('keeps the kitchen knife under 0.4 m, baseball bat within 0.7–1.1 m, and steel pipe at 0.9–1.0 m', async () => {
    const dimensions = async (id: string): Promise<number> => {
      const model = melee.models.get(id)!;
      const bytes = readFileSync(`${BASE}/${model.file}`);
      const { scene } = await parseGlb(bytes);
      const box = new Box3().setFromObject(scene);
      const { max, min } = box;
      return max.x - min.x;
    };
    expect(await dimensions('kitchen_knife')).toBeLessThan(0.4);
    expect(await dimensions('baseball_bat')).toBeGreaterThanOrEqual(0.7);
    expect(await dimensions('baseball_bat')).toBeLessThanOrEqual(1.1);
    expect(await dimensions('steel_pipe')).toBeGreaterThanOrEqual(0.9);
    expect(await dimensions('steel_pipe')).toBeLessThanOrEqual(1.0);
  });
});

describe('base pack guns', () => {
  const base = buildRegistry([read('src/content/base/models-firearms.json')]).registry;
  const guns = [...base.models.values()].filter((m) => m.anchors?.muzzle);

  it.each(guns.map((m) => [m.id, m] as const))('%s is held muzzle forward, top up', async (_, def) => {
    const bytes = readFileSync(`src/content/base/${def.file}`);
    const { scene } = await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer, '');
    const { held } = prepareModel(def, scene);
    held.updateMatrixWorld(true);
    // held > turned > offset: the offset group maps the file's coordinates into the hand's.
    const offset = held.children[0]!.children[0]!;
    const muzzle = new Vector3(...def.anchors!.muzzle!).applyMatrix4(offset.matrixWorld);
    // The files lie on their side; grip.turn stands them up, so the muzzle sits above the grip.
    expect(muzzle.z).toBeLessThan(-0.05);
    expect(muzzle.y).toBeGreaterThan(0.01);
    expect(Math.abs(muzzle.x)).toBeLessThan(0.02);
  });
});
