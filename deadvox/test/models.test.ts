import { readdirSync, readFileSync } from 'node:fs';
import { Box3, type Loader, LoadingManager, Mesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { buildRegistry, type ContentSource } from '../src/core/content.ts';
import { Inventory, PILE_GRID, type Pile } from '../src/core/inventory.ts';
import { pileLayout } from '../src/core/pileLayout.ts';
import { itemLook } from '../src/render/itemLook.ts';
import { fittedPartFrame } from '../src/render/models.ts';
import { spentCaseItemId } from '../src/game/firearmHandling.ts';
import { prepareModel } from '../src/render/models.ts';

const BASE = 'src/content/base';
const MODEL_FILE = /^assets\/models\/[a-z0-9_]+\.glb$/;
const AXIS_INDEX = { x: 0, y: 1, z: 2 } as const;
const read = (source: string): ContentSource => ({ source, data: JSON.parse(readFileSync(source, 'utf8')) });
const base = (file: string): ContentSource => {
  const source = `${BASE}/${file}`;
  return { source, data: JSON.parse(readFileSync(source, 'utf8')) };
};
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
  ...readdirSync(BASE)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map(base),
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

it('loads the curated pump through preparation and resolves separate movers by glTF node index, not sanitized name', async () => {
  const def = registry.models.get('shotgun_pump')!;
  const gltf = await parseGlb(readFileSync(`${BASE}/${def.file}`));
  expect(def.calibre).toBe('12-gauge-00-buck');
  expect(def.tube?.capacity).toBe(4);
  expect(def.action?.fire).toBeUndefined();
  expect(def.grip?.turn).toEqual([0, 0, 0]);
  expect(def.sight?.kind).toBe('iron');
  expect(def.sight?.direction[0]).toBeGreaterThan(0);
  for (const part of Object.values(def.action!.parts)) {
    const index = gltf.parser.json.nodes.findIndex((node: { name?: string }) => node.name === part.node);
    expect(index).toBeGreaterThanOrEqual(0);
    let found = false;
    gltf.scene.traverse((object) => {
      if (gltf.parser.associations.get(object)?.nodes === index) {
        found = true;
        expect(object.name).not.toBe(part.node); // Three.js strips the colon.
      }
    });
    expect(found, part.node).toBe(true);
    expect(part.modes).toEqual(['hand']);
    expect(part.strokeMetres).toBe(0.063_25);
  }
  const raw = new Box3().setFromObject(gltf.scene);
  expect(def.anchors!.muzzle![0]).toBeCloseTo(raw.max.x, 5);
  const prepared = prepareModel(def, gltf.scene);
  const ground = new Box3().setFromObject(prepared.ground);
  expect(ground.min.y).toBeCloseTo(0, 9);
  expect(ground.max.x - ground.min.x).toBeCloseTo(raw.max.x - raw.min.x, 9);
  const held = new Box3().setFromObject(prepared.held);
  expect(held.isEmpty()).toBe(false);
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

  it('exposes shared ground mesh resources with the prepared root transforms for instancing', async () => {
    const { ground, groundParts } = await load();
    const meshes: Mesh[] = [];
    ground.traverse((object) => {
      if (object instanceof Mesh) {
        meshes.push(object);
      }
    });
    expect(groundParts).toHaveLength(meshes.length);
    expect(groundParts.length).toBeGreaterThan(0);
    const bounds = new Box3();
    for (const [index, part] of groundParts.entries()) {
      expect(part.geometry).toBe(meshes[index]!.geometry);
      expect(part.material).toBe(meshes[index]!.material);
      part.geometry.computeBoundingBox();
      bounds.union(part.geometry.boundingBox!.clone().applyMatrix4(part.matrix));
    }
    const groundBounds = new Box3().setFromObject(ground);
    expect(bounds.min.distanceTo(groundBounds.min)).toBeLessThan(1e-8);
    expect(bounds.max.distanceTo(groundBounds.max)).toBeLessThan(1e-8);
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

describe('fitted attachment model frames', () => {
  it('maps every exported connector frame to the firearm slot frame', () => {
    const attachments = [...registry.models.values()].filter((model) => model.attachment);
    expect(attachments.length).toBeGreaterThan(0);
    for (const model of attachments) {
      const mountFrame = model.attachment!.mountFrame;
      const frame = fittedPartFrame({
        slot: 'fixture',
        at: [0, 0, 0],
        direction: [0, 1, 0],
        up: [1, 0, 0],
        mountFrame,
        model: model.id,
      });
      const normal = new Vector3(...mountFrame.normal).applyQuaternion(frame.quaternion);
      const up = new Vector3(...mountFrame.up).applyQuaternion(frame.quaternion);
      expect(normal.dot(new Vector3(0, -1, 0)), model.id).toBeCloseTo(1, 8);
      expect(up.dot(new Vector3(1, 0, 0)), model.id).toBeCloseTo(1, 8);
    }
  });

  it('keeps the default fitted optic along the bore and seated on its rail', async () => {
    const firearm = registry.models.get('rifle_assault')!;
    const optic = firearm.attachments?.find(({ kind }) => kind === 'optic');
    if (!optic) throw new Error('Exported firearm has no default optic');
    const attachmentModelId = registry.items.get('optic_lpvo_1_6x')?.model;
    if (!attachmentModelId) throw new Error('Default optic item has no exported model');
    const mount = firearm.attachmentSlots!.find(({ id }) => id === optic.mountedAt)!;
    const look = itemLook(registry, new Inventory(registry).create('rifle_assault'))!;
    const slot = look.slots.find(({ slot: id }) => id === optic.mountedAt)!;
    if (slot.model !== attachmentModelId || !slot.mountFrame) throw new Error('Default optic look is incomplete');
    const gunScene = (await parseGlb(readFileSync(`${BASE}/${firearm.file}`))).scene;
    const opticScene = (await parseGlb(readFileSync(`${BASE}/${registry.models.get(attachmentModelId)!.file}`))).scene;
    const held = prepareModel(firearm, gunScene).held;
    const modelFrame = held.children[0]!.children[0]!;
    const fitted = fittedPartFrame(slot).add(opticScene);
    modelFrame.add(fitted);
    held.updateMatrixWorld(true);
    const origin = fitted.getWorldPosition(new Vector3());
    const bore = modelFrame.localToWorld(new Vector3(1, 0, 0)).sub(modelFrame.localToWorld(new Vector3())).normalize();
    const tube = new Vector3(1, 0, 0).transformDirection(opticScene.matrixWorld);
    expect(Math.abs(tube.dot(bore))).toBeCloseTo(1, 6);

    const railNormal = modelFrame
      .localToWorld(new Vector3(...mount.direction))
      .sub(modelFrame.localToWorld(new Vector3()))
      .normalize();
    const railPosition = origin.dot(railNormal);
    const corners = new Box3().setFromObject(opticScene);
    const lowest = [
      new Vector3(corners.min.x, corners.min.y, corners.min.z),
      new Vector3(corners.min.x, corners.min.y, corners.max.z),
      new Vector3(corners.min.x, corners.max.y, corners.min.z),
      new Vector3(corners.min.x, corners.max.y, corners.max.z),
      new Vector3(corners.max.x, corners.min.y, corners.min.z),
      new Vector3(corners.max.x, corners.min.y, corners.max.z),
      new Vector3(corners.max.x, corners.max.y, corners.min.z),
      new Vector3(corners.max.x, corners.max.y, corners.max.z),
    ].reduce((min, point) => Math.min(min, point.dot(railNormal)), Number.POSITIVE_INFINITY);
    expect(lowest).toBeCloseTo(railPosition, 6);
  });
});

describe('base pack melee', () => {
  const melee = buildRegistry([read(`${BASE}/models-melee.json`)]).registry;
  const models = [...melee.models.values()];
  const heldAnchor = async (id: string, name: string): Promise<Vector3> => {
    const def = melee.models.get(id)!;
    const bytes = readFileSync(`${BASE}/${def.file}`);
    const { scene } = await parseGlb(bytes);
    const { held } = prepareModel(def, scene);
    held.updateMatrixWorld(true);
    const offset = held.children[0]!.children[0]!;
    return new Vector3(...def.anchors![name]!).applyMatrix4(offset.matrixWorld);
  };

  it('maps the seven matching Slice 1 items to their melee models', () => {
    expect(
      ['crowbar', 'hammer', 'kitchen_knife', 'baseball_bat', 'steel_pipe', 'machete', 'kabar'].map(
        (id) => registry.items.get(id)?.model,
      ),
    ).toEqual(['crowbar', 'hammer', 'kitchen_knife', 'baseball_bat', 'steel_pipe', 'machete', 'kabar']);
  });

  it('assigns forward holds to stabbing blades and the machete slash', () => {
    const forward = models
      .filter((model) => model.hold === 'forward')
      .map((model) => model.id)
      .sort();
    expect(forward).toEqual(['kabar', 'kitchen_knife', 'machete', 'pocket_knife', 'tanto']);
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
      const anchors = Object.values(def.anchors ?? {});
      expect(
        [grip!, ...anchors].every((anchor) => anchorIsInBounds(anchor, sourceBox)),
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

  it('keeps melee-model cross-sections at hand scale', async () => {
    const dimensions = async (id: string): Promise<Vector3> => {
      const model = melee.models.get(id)!;
      const bytes = readFileSync(`${BASE}/${model.file}`);
      const { scene } = await parseGlb(bytes);
      return new Box3().setFromObject(scene).getSize(new Vector3());
    };
    const pipe = await dimensions('steel_pipe');
    expect(pipe.x).toBeGreaterThanOrEqual(0.9);
    expect(pipe.x).toBeLessThanOrEqual(1.0);
    expect(pipe.y).toBeGreaterThanOrEqual(0.025);
    expect(pipe.y).toBeLessThanOrEqual(0.045);
    // The elbow is the pipe's other short axis after conversion; keep its full reach <= 13 cm.
    expect(pipe.z).toBeGreaterThanOrEqual(0.1);
    expect(pipe.z).toBeLessThanOrEqual(0.13);

    const bat = await dimensions('baseball_bat');
    expect(bat.y).toBeGreaterThanOrEqual(0.05);
    expect(bat.y).toBeLessThanOrEqual(0.08);
    expect(bat.z).toBeGreaterThanOrEqual(0.05);
    expect(bat.z).toBeLessThanOrEqual(0.08);

    const crowbar = await dimensions('crowbar');
    expect(crowbar.z).toBeGreaterThanOrEqual(0.025);
    expect(crowbar.z).toBeLessThanOrEqual(0.04);
    // The hook spans Y; this is its maximum extent, not shaft thickness.
    expect(crowbar.y).toBeLessThanOrEqual(0.26);
  });

  it('points the hammer striking face forward and its claw back', async () => {
    const face = await heldAnchor('hammer', 'face');
    const claw = await heldAnchor('hammer', 'claw');
    // From the grip, the face must be at least 8 cm down -z; the claw must be at least 8 cm back.
    expect(face.z * 100).toBeLessThanOrEqual(-8);
    expect(claw.z * 100).toBeGreaterThanOrEqual(8);
  });

  it('points the fire-axe cutting edge forward', async () => {
    const edge = await heldAnchor('fire_axe', 'edge');
    expect(edge.z * 100).toBeLessThanOrEqual(-9);
  });

  it('points the sledgehammer striking face forward', async () => {
    const face = await heldAnchor('sledgehammer', 'face');
    expect(face.z * 100).toBeLessThanOrEqual(-7.5);
  });

  it('points the hand-axe cutting edge forward', async () => {
    const edge = await heldAnchor('hand_axe', 'edge');
    expect(edge.z * 100).toBeLessThanOrEqual(-8);
  });

  it('points the machete cutting edge forward', async () => {
    const edge = await heldAnchor('machete', 'edge');
    expect(edge.z * 100).toBeLessThanOrEqual(-3);
  });

  it('points the Kabar strike tip forward from its held grip', async () => {
    const strike = await heldAnchor('kabar', 'strike');
    expect(strike.z * 100).toBeLessThanOrEqual(-20);
  });

  it('points the pickaxe point forward', async () => {
    const point = await heldAnchor('pickaxe', 'point');
    expect(point.z * 100).toBeLessThanOrEqual(-27);
  });

  it('points the crowbar claw forward', async () => {
    const claw = await heldAnchor('crowbar', 'claw');
    expect(claw.z * 100).toBeLessThanOrEqual(-10);
  });

  it('holds the pipe elbow forward while its shaft stays upright', async () => {
    const def = melee.models.get('steel_pipe')!;
    const bytes = readFileSync(`${BASE}/${def.file}`);
    const { scene } = await parseGlb(bytes);
    const { held } = prepareModel(def, scene);
    held.updateMatrixWorld(true);
    const offset = held.children[0]!.children[0]!;
    const strike = new Vector3(...def.anchors!.strike!).applyMatrix4(offset.matrixWorld);
    expect(strike.y).toBeGreaterThanOrEqual(0.9);
    expect(strike.z).toBeLessThanOrEqual(-0.09);
  });

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

describe('base pack shotshells', () => {
  it('links stackable ammo and the spent-case counter identity to their real-scale models', () => {
    const loaded = registry.items.get('shell_12_gauge_00_buck')!;
    const fired = registry.items.get(spentCaseItemId('12-gauge-00-buck'))!;
    expect(loaded).toMatchObject({ category: 'ammo', model: 'round_12_h_gauge_h_00_h_buck', stack: 25, weight: 40 });
    expect(fired).toMatchObject({ model: 'case_12_h_gauge_h_00_h_buck', stack: 10_000, weight: 5 });
    expect(loaded.description).toContain('estimate');
    expect(fired.description).toContain('estimate');
  });
  it.each([
    ['round_12_h_gauge_h_00_h_buck', 0.062_23],
    ['case_12_h_gauge_h_00_h_buck', 0.0701],
  ] as const)('%s loads through prepareModel and rests at its sourced dimensions', async (id, length) => {
    const def = registry.models.get(id)!;
    expect(def.calibre).toBe('12-gauge-00-buck');
    expect(def.grip).toBeUndefined();
    const { scene } = await parseGlb(readFileSync(`${BASE}/${def.file}`));
    const { ground, groundParts } = prepareModel(def, scene);
    const bounds = new Box3().setFromObject(ground);
    expect(bounds.getSize(new Vector3()).x).toBeCloseTo(length, 7);
    expect(bounds.getSize(new Vector3()).y).toBeCloseTo(0.0225, 7);
    expect(bounds.min.y).toBeCloseTo(0, 7);
    expect(bounds.getCenter(new Vector3()).x).toBeCloseTo(0, 7);
    expect(groundParts.length).toBeGreaterThan(0);
  });
});

describe('base pack guns', () => {
  const firearms = registry;
  const { models } = firearms;
  const guns = [...models.values()].filter((m) => m.anchors?.muzzle);

  it.each(guns.map((m) => [m.id, m] as const))('%s is held muzzle forward, top up', async (_, def) => {
    const bytes = readFileSync(`src/content/base/${def.file}`);
    const gltf = await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer, '');
    if (gltf.parser.json.asset.generator === 'skelly gungen glb export') {
      expect(def.sight, `${def.id} Gungen exports need sight metadata`).toBeDefined();
    }
    const { held } = prepareModel(def, gltf.scene);
    held.updateMatrixWorld(true);
    // held > turned > offset: the offset group maps the file's coordinates into the hand's.
    const offset = held.children[0]!.children[0]!;
    const muzzle = new Vector3(...def.anchors!.muzzle!).applyMatrix4(offset.matrixWorld);
    // The files lie on their side; grip.turn stands them up, so the muzzle sits above the grip.
    expect(muzzle.z).toBeLessThan(-0.05);
    expect(muzzle.y).toBeGreaterThan(0.01);
    expect(Math.abs(muzzle.x)).toBeLessThan(0.02);
  });

  it('uses the exported AR with zero turn and its muzzle at the forward end', async () => {
    const def = models.get('rifle_assault')!;
    const bytes = readFileSync(`src/content/base/${def.file}`);
    const { scene } = await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer, '');
    const bounds = new Box3().setFromObject(scene);
    const size = bounds.getSize(new Vector3());
    expect(def.grip?.turn).toEqual([0, 0, 0]);
    expect(def.anchors?.muzzle?.[0]).toBeGreaterThan(def.grip!.at[0]);
    expect(def.anchors?.muzzle?.[0]).toBeCloseTo(bounds.max.x, 5);
    expect(size.x).toBeGreaterThanOrEqual(0.75);
    expect(size.x).toBeLessThanOrEqual(0.85);

    const { held } = prepareModel(def, scene);
    held.updateMatrixWorld(true);
    const offset = held.children[0]!.children[0]!;
    const muzzle = new Vector3(...def.anchors!.muzzle!).applyMatrix4(offset.matrixWorld);
    const top = new Vector3(def.grip!.at[0], def.grip!.at[1] + 0.1, def.grip!.at[2]).applyMatrix4(offset.matrixWorld);
    expect(muzzle.z).toBeLessThan(-0.05);
    expect(muzzle.y).toBeGreaterThan(0.01);
    expect(top.y).toBeGreaterThan(0.09);
  });

  it('lays the debug AR model in piles', () => {
    const inventory = new Inventory(firearms);
    const { models: pileModels, bundle } = pileLayout(
      firearms,
      {
        pos: [0, 0, 0],
        items: [{ item: inventory.create('rifle_assault'), x: 0, y: 0, rotated: false }],
      },
      0.5,
    );
    expect(pileModels.map((model) => model.model)).toEqual(['rifle_assault']);
    expect(bundle).toEqual([]);
  });
});
