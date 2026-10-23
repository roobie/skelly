import { readdirSync, readFileSync } from 'node:fs';
import {
  Box3,
  BoxGeometry,
  type CircleGeometry,
  Group,
  InstancedMesh,
  type Loader,
  LoadingManager,
  Mesh,
  type MeshBasicMaterial,
  type MeshStandardMaterial,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ContentSource } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { Inventory, type Pile } from '../src/core/inventory.ts';
import { PILE_GRID } from '../src/core/inventoryScale.ts';
import { toggleLight } from '../src/core/lights.ts';
import { pileLayout } from '../src/core/pileLayout.ts';
import { spentCaseItemId } from '../src/game/firearmHandling.ts';
import { createCompass } from '../src/render/compass.ts';
import { HeldItems } from '../src/render/hands.ts';
import { presentHeldDisplay } from '../src/render/heldDisplay.ts';
import { itemLook } from '../src/render/itemLook.ts';
import {
  fittedPartFrame,
  groundModelFrame,
  heldModelFrame,
  type ModelLibrary,
  prepareModel,
} from '../src/render/models.ts';
import { PileMeshes } from '../src/render/piles.ts';
import { FIRST_PERSON_PALM } from '../src/render/playerFigure.ts';
import { buildFixtureRegistry as buildRegistry } from './economyFixtures.ts';

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
  {
    source: 'bundle-fixture',
    data: { items: [{ id: 'fixture_bundle', name: 'Bundle fixture', category: 'misc', weight: 1, size: [1, 2] }] },
  },
]);

it('prepares every thing recipe export for ground and held drawing with its grip at the hand origin', async () => {
  const recipe: { id: string }[] = JSON.parse(readFileSync('../thing-authoring-tool/exports/deadvox.json', 'utf8'));
  expect(recipe.length).toBeGreaterThan(0);
  await Promise.all(
    recipe.map(async ({ id }) => {
      const definition = registry.models.get(id)!;
      const { scene } = await parseGlb(readFileSync(`${BASE}/${definition.file}`));
      const { ground, held, groundParts } = prepareModel(definition, scene);
      const groundBounds = new Box3().setFromObject(ground);
      expect(groundBounds.isEmpty(), id).toBe(false);
      expect(groundBounds.min.y, id).toBeCloseTo(0);
      expect(groundParts.length, id).toBeGreaterThan(0);
      expect(new Box3().setFromObject(held).isEmpty(), id).toBe(false);
      if (definition.grip) {
        held.updateMatrixWorld(true);
        const grip = heldModelFrame(held).localToWorld(new Vector3(...definition.grip.at));
        expect(grip.length(), id).toBeCloseTo(0);
      }
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

it.each<[string, Vec3]>([
  ['right', [0.14, -0.13, -0.3]],
  ['left', [-0.14, -0.13, -0.3]],
])(
  'turns a %s-held compass screen to the eye, upright, with the whole model in front of the palm',
  async (_side, heldAt) => {
    const definition = registry.models.get('compass')!;
    const { scene } = await parseGlb(readFileSync(`${BASE}/${definition.file}`));
    const { held } = prepareModel(definition, scene);
    // Every canvas call is a no-op: the test observes Three transforms, not painted pixels.
    const context = new Proxy({}, { get: () => vi.fn() });
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => context }) });
    const compass = createCompass({
      root: held,
      display: definition.display!,
      needleMount: definition.anchors!.needle_mount!,
      dial: definition.dial!,
    });
    const hand = new Group().add(held);
    hand.position.set(...heldAt);
    const palm = presentHeldDisplay(held, definition.display!, heldAt);
    hand.add(palm);
    hand.updateMatrixWorld(true);
    const toEye = new Vector3(...heldAt).negate().normalize();
    const card = compass.group.getObjectByName('compass-live-dial')!;
    expect(card.getWorldDirection(new Vector3()).dot(toEye)).toBeGreaterThan(0.99);
    // The card's top is north, so at its default bearing it stands upright.
    const top = new Vector3(0, 1, 0).applyQuaternion(card.getWorldQuaternion(new Quaternion()));
    expect(top.y).toBeGreaterThan(0.9);
    const palmFront = FIRST_PERSON_PALM[2] / 2;
    const palmForward = new Vector3(0, 0, 1).applyQuaternion(palm.getWorldQuaternion(new Quaternion()));
    expect(palmForward.dot(toEye)).toBeGreaterThan(0.99);
    const handAt = new Vector3(...heldAt);
    let nearestToPalm = Number.POSITIVE_INFINITY;
    held.traverse((child) => {
      if (child instanceof Mesh) {
        const position = child.geometry.getAttribute('position');
        for (let index = 0; index < position.count; index += 1) {
          const vertex = new Vector3().fromBufferAttribute(position, index).applyMatrix4(child.matrixWorld);
          nearestToPalm = Math.min(nearestToPalm, vertex.sub(handAt).dot(toEye));
        }
      }
    });
    expect(nearestToPalm).toBeGreaterThanOrEqual(palmFront - 1e-6);
    compass.dispose();
  },
);

it.each(['right', 'left'] as const)('keeps the %s arm out of every sight line to a held compass card', async (side) => {
  const definition = registry.models.get('compass')!;
  const { scene } = await parseGlb(readFileSync(`${BASE}/${definition.file}`));
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => new Proxy({}, { get: () => vi.fn() }) }) });
  const inventory = new Inventory(registry);
  expect(inventory.add(inventory.create('compass'), { kind: 'hand', side })).toBeTruthy();
  const models = {
    version: 0,
    has: () => true,
    heldLook: () => ({ root: prepareModel(definition, scene.clone()).held, parts: [], slots: {} }),
  } as unknown as ModelLibrary;
  const held = new HeldItems(inventory, models, { skin: '#bbaa99', shirt: '#556677', trousers: '#334455' });
  held.update(new PerspectiveCamera(), undefined, 0, { firearms: [] });
  const { scene: view } = held.warmUpTarget;
  view.updateMatrixWorld(true);
  const card = view.getObjectByName('compass-live-dial') as Mesh<CircleGeometry>;
  const arm = view.getObjectByName(`first-person-arm-${side}`)!;
  const eye = new Vector3();
  const raycaster = new Raycaster();
  // Sight lines from the eye to the card's rim and rings inside it.
  const blocked: string[] = [];
  for (const ring of [1, 0.66, 0.33]) {
    for (let step = 0; step < 24; step += 1) {
      const angle = (step / 24) * Math.PI * 2;
      const radius = card.geometry.parameters.radius * ring;
      const target = card.localToWorld(new Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0));
      raycaster.set(eye, target.clone().sub(eye).normalize());
      raycaster.far = target.distanceTo(eye);
      const [hit] = raycaster.intersectObject(arm, true);
      if (hit) {
        blocked.push(`${ring}@${step}: arm part ${arm.children.indexOf(hit.object)}`);
      }
    }
  }
  expect(blocked).toEqual([]);
  held.dispose();
});

it.each(['right', 'left'] as const)('keeps the held oil lamp flame visible beyond the %s palm', async (side) => {
  const definition = registry.models.get(registry.items.get('oil_lamp')!.model!)!;
  const { scene } = await parseGlb(readFileSync(`${BASE}/${definition.file}`));
  const inventory = new Inventory(registry);
  const lamp = inventory.create('oil_lamp');
  expect(inventory.add(lamp, { kind: 'hand', side })).toBe(true);
  expect(toggleLight(registry, lamp, 0)).toBeUndefined();
  const models = {
    version: 0,
    has: () => true,
    heldLook: () => ({ root: prepareModel(definition, scene.clone()).held, parts: [], slots: {} }),
  } as unknown as ModelLibrary;
  const held = new HeldItems(inventory, models, registry.figures.get('player')!.palette);
  try {
    held.update(new PerspectiveCamera());
    const { scene: view, camera } = held.warmUpTarget;
    view.updateMatrixWorld(true);
    const flame = view.getObjectByName('held-light-flame')!;
    expect(flame).toBeDefined();
    const eye = camera.getWorldPosition(new Vector3());
    const target = flame.localToWorld(new Vector3(0, 0.35, 0));
    const ray = new Raycaster(eye, target.clone().sub(eye).normalize());
    expect(ray.intersectObjects(view.children, true)[0]?.object === flame).toBe(true);
  } finally {
    held.dispose();
  }
});

describe('piles with models', () => {
  const inventory = new Inventory(registry);
  const S = 0.5;
  const pile: Pile = {
    pos: [10, 4, -3],
    items: [
      // The lamp is 3 × 1 cells, long along the grid's x.
      { item: inventory.create('lamp'), x: 2, y: 1, rotated: false },
      { item: inventory.create('lamp'), x: 6, y: 2, rotated: true },
      { item: inventory.create('fixture_bundle'), x: 0, y: 4, rotated: false },
    ],
  };

  it('lays each item with a model at the middle of its cells, turned as it lies', () => {
    expect(issues).toEqual([]);
    const { models, bundle } = pileLayout(registry, pile, S);
    expect(models.map((m) => [m.model, m.at, m.yaw])).toEqual([
      ['lamp', [(10 + 3.5 / PILE_GRID.w) * S, 4 * S, (-3 + 1.5 / PILE_GRID.h) * S], 0],
      ['lamp', [(10 + 6.5 / PILE_GRID.w) * S, 4 * S, (-3 + 3.5 / PILE_GRID.h) * S], Math.PI / 2],
    ]);
    expect(bundle.map((p) => p.item.type)).toEqual(['fixture_bundle']);
  });

  it("keeps items in the bundle while their model can't be drawn", () => {
    const { models, bundle } = pileLayout(registry, pile, S, () => false);
    expect(models).toEqual([]);
    expect(bundle.map((p) => p.item.type)).toEqual(['lamp', 'lamp', 'fixture_bundle']);
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

  it('keeps a glowstick’s lit look on its model, and uses a marker only for the bundle fallback', async () => {
    const definition = registry.items.get('glowstick')!;
    expect(definition.model).toBeDefined();
    const modelDefinition = registry.models.get(definition.model!)!;
    expect(modelDefinition.emissiveMaterial).toBeDefined();
    const { scene } = await parseGlb(readFileSync(`${BASE}/${modelDefinition.file}`));
    const { ground } = prepareModel(modelDefinition, scene);
    expect(new Box3().setFromObject(ground).isEmpty()).toBe(false);
    let authoredTube = false;
    ground.traverse((object) => {
      if (!(object instanceof Mesh)) {
        return;
      }
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      authoredTube ||= materials.some((material) => material.name === modelDefinition.emissiveMaterial);
    });
    expect(authoredTube).toBe(true);

    const models = {
      version: 1,
      has: (id: string) => id === modelDefinition.id,
      groundLook: () => ground.clone(),
    } as unknown as import('../src/render/models.ts').ModelLibrary;
    const render = (on: boolean, withModel = true) => {
      const source = withModel
        ? registry
        : {
            ...registry,
            items: new Map(registry.items).set('glowstick', { ...definition, model: undefined }),
          };
      const items = new Inventory(source);
      const glowstick = items.create('glowstick');
      if (on) {
        expect(toggleLight(source, glowstick, 0)).toBeUndefined();
      }
      expect(items.add(glowstick, { kind: 'pile', pos: [0, 0, 0] })).toBe(true);
      const piles = new PileMeshes(S, withModel ? models : undefined);
      piles.sync(items);
      return piles;
    };

    const unlit = render(false);
    expect(unlit.group.children.some((child) => child instanceof InstancedMesh)).toBe(false);
    unlit.dispose();

    const lit = render(true);
    const itemModel = lit.group.children.find((child) => !(child instanceof InstancedMesh))!;
    const modelBounds = new Box3().setFromObject(itemModel);
    let litTube: Mesh | undefined;
    itemModel.traverse((object) => {
      if (!(object instanceof Mesh)) {
        return;
      }
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (materials.some((material) => material.name === modelDefinition.emissiveMaterial)) {
        litTube = object;
      }
    });
    expect(litTube).toBeDefined();
    const tubeBounds = new Box3().setFromObject(litTube!);
    expect(modelBounds.containsPoint(tubeBounds.min)).toBe(true);
    expect(modelBounds.containsPoint(tubeBounds.max)).toBe(true);
    const litMaterial = (Array.isArray(litTube!.material) ? litTube!.material : [litTube!.material]).find(
      (material) => material.name === modelDefinition.emissiveMaterial,
    ) as MeshStandardMaterial;
    expect(litMaterial.emissive.getHexString()).not.toBe('000000');
    expect(litMaterial.toneMapped).toBe(false);
    expect(lit.group.children.some((child) => child instanceof InstancedMesh)).toBe(false);
    lit.dispose();

    const bundle = render(true, false);
    const marker = bundle.group.children.find((child) => child instanceof InstancedMesh) as InstancedMesh;
    expect(marker).toBeDefined();
    expect((marker.material as MeshBasicMaterial).toneMapped).toBe(false);
    expect((marker.material as MeshBasicMaterial).vertexColors).toBe(false);
    bundle.dispose();
  });

  it('keeps a set-down flame burning upright over its model’s flame anchor, and shines from there', async () => {
    const flameLights = [...registry.items.values()].filter(
      ({ light, model }) =>
        light?.burning?.ignition === 'firestarter' &&
        light.flame !== undefined &&
        model !== undefined &&
        registry.models.get(model)?.anchors?.flame !== undefined,
    );
    expect(flameLights.length).toBeGreaterThan(0);
    const scenes = await Promise.all(
      flameLights.map(
        async ({ model }) => (await parseGlb(readFileSync(`${BASE}/${registry.models.get(model!)!.file}`))).scene,
      ),
    );
    for (const [index, definition] of flameLights.entries()) {
      const modelDefinition = registry.models.get(definition.model!)!;
      const { ground } = prepareModel(modelDefinition, scenes[index]!);
      const models = {
        version: 1,
        has: (id: string) => id === modelDefinition.id,
        groundLook: () => ground.clone(),
      } as unknown as import('../src/render/models.ts').ModelLibrary;
      const render = (on: boolean) => {
        const items = new Inventory(registry);
        const light = items.create(definition.id);
        if (on && definition.tool?.fuel) {
          const canister = items.create(definition.tool.fuel.canister);
          canister.charges = registry.items.get(canister.type)!.canister!.capacity;
          items.fitSlot(light, 'canister', canister);
        }
        if (on) {
          expect(toggleLight(registry, light, 0)).toBeUndefined();
        }
        expect(items.add(light, { kind: 'pile', pos: [2, 1, -1] })).toBe(true);
        const piles = new PileMeshes(S, models);
        piles.sync(items);
        const model = piles.group.children.find((child) => !(child instanceof InstancedMesh))!;
        return { piles, light, model, flame: model.getObjectByName('pile-light-flame') };
      };

      const unlit = render(false);
      expect(unlit.flame, definition.id).toBeUndefined();
      expect(unlit.piles.lightPositionOf(unlit.light, new Vector3()), definition.id).toBe(false);
      unlit.piles.dispose();

      const { piles, light, model, flame } = render(true);
      expect(flame, definition.id).toBeDefined();
      const at = new Vector3();
      expect(piles.lightPositionOf(light, at), definition.id).toBe(true);
      const anchor = groundModelFrame(model).localToWorld(new Vector3(...modelDefinition.anchors!.flame!));
      expect(at.distanceTo(anchor), definition.id).toBeLessThan(1e-9);
      const flameBounds = new Box3().setFromObject(flame!);
      const centre = flameBounds.getCenter(new Vector3());
      expect(flameBounds.min.y, definition.id).toBeCloseTo(at.y);
      expect(flameBounds.max.y - flameBounds.min.y, definition.id).toBeCloseTo(definition.light!.flame!.heightMetres);
      expect(centre.x, definition.id).toBeCloseTo(at.x);
      expect(centre.z, definition.id).toBeCloseTo(at.z);
      piles.dispose();
    }
  });
});

it('prepares integral-magazine manual exports and binds movers by glTF node index, not sanitized name', async () => {
  const models = [...registry.models.values()].filter(
    (model) => model.gun?.internalMagazine && model.gun.action && !model.gun.action.fire,
  );
  expect(models.length).toBeGreaterThan(0);
  await Promise.all(
    models.map(async (def) => {
      const gltf = await parseGlb(readFileSync(`${BASE}/${def.file}`));
      expect(def.gun!.internalMagazine!.capacity).toBeGreaterThan(0);
      expect(def.gun?.calibre).toBeDefined();
      expect(def.gun?.sight?.kind).toBe('iron');
      expect(def.gun?.sight?.direction[0]).toBeGreaterThan(0);
      for (const part of Object.values(def.gun!.action!.parts)) {
        const index = gltf.parser.json.nodes.findIndex((node: { name?: string }) => node.name === part.node);
        expect(index).toBeGreaterThanOrEqual(0);
        let found = false;
        gltf.scene.traverse((object) => {
          if (gltf.parser.associations.get(object)?.nodes === index) {
            found = true;
            expect(object.name).not.toBe(part.node);
          }
        });
        expect(found, part.node).toBe(true);
        expect(part.modes).toEqual(['hand']);
        expect(part.strokeMetres).toBeGreaterThan(0);
      }
      const raw = new Box3().setFromObject(gltf.scene);
      expect(def.anchors!.muzzle![0]).toBeCloseTo(raw.max.x, 5);
      const prepared = prepareModel(def, gltf.scene);
      const ground = new Box3().setFromObject(prepared.ground);
      expect(ground.min.y).toBeCloseTo(0, 9);
      expect(ground.max.x - ground.min.x).toBeCloseTo(raw.max.x - raw.min.x, 9);
      expect(new Box3().setFromObject(prepared.held).isEmpty()).toBe(false);
    }),
  );
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

  it('stands a model that rests upright on its back end, its front end up and centred over its origin', async () => {
    const bytes = readFileSync('test/fixtures/packs/lamp/assets/models/lamp.glb');
    const { scene } = await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer, '');
    const raw = new Box3().setFromObject(scene);
    const { ground } = prepareModel({ ...registry.models.get('lamp')!, rest: 'upright' }, scene);
    ground.updateMatrixWorld(true);
    const box = new Box3().setFromObject(ground);
    expect(box.min.y).toBeCloseTo(0);
    expect(box.max.y - box.min.y).toBeCloseTo(raw.max.x - raw.min.x);
    expect(box.getCenter(new Vector3()).x).toBeCloseTo(0);
    expect(box.getCenter(new Vector3()).z).toBeCloseTo(0);
    const front = groundModelFrame(ground).localToWorld(new Vector3(raw.max.x, 0, 0));
    expect(front.y).toBeCloseTo(box.max.y);
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
    const attachments = [...registry.models.values()].filter((model) => model.gun?.attachment);
    expect(attachments.length).toBeGreaterThan(0);
    for (const model of attachments) {
      const { mountFrame } = model.gun!.attachment!;
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
    const optic = firearm.gun?.attachments?.find(({ kind }) => kind === 'optic');
    if (!optic) {
      throw new Error('Exported firearm has no default optic');
    }
    const mount = firearm.gun!.attachmentSlots!.find(({ id }) => id === optic.mountedAt)!;
    const look = itemLook(registry, new Inventory(registry).create('rifle_assault'))!;
    const slot = look.slots.find(({ slot: id }) => id === optic.mountedAt)!;
    if (!(slot.model && slot.mountFrame)) {
      throw new Error('Default optic look is incomplete');
    }
    const gunScene = (await parseGlb(readFileSync(`${BASE}/${firearm.file}`))).scene;
    const opticScene = (await parseGlb(readFileSync(`${BASE}/${registry.models.get(slot.model)!.file}`))).scene;
    const { held } = prepareModel(firearm, gunScene);
    const modelFrame = held.children[0]!.children[0]!;
    const fitted = fittedPartFrame(slot).add(opticScene);
    modelFrame.add(fitted);
    held.updateMatrixWorld(true);
    const origin = fitted.getWorldPosition(new Vector3());
    const bore = modelFrame
      .localToWorld(new Vector3(1, 0, 0))
      .sub(modelFrame.localToWorld(new Vector3()))
      .normalize();
    const tube = new Vector3(1, 0, 0).transformDirection(opticScene.matrixWorld);
    expect(tube.dot(bore)).toBeCloseTo(1, 6);

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

describe('fitted magazine model frame', () => {
  it('keeps the carried-magazine overlay aligned with the firearm export', async () => {
    const firearm = registry.models.get('rifle_assault');
    if (!firearm?.gun?.slots?.magazine) {
      throw new Error('Exported rifle has no magazine slot');
    }
    const look = itemLook(registry, new Inventory(registry).create('rifle_assault'));
    const slot = look?.slots.find(({ slot: id }) => id === 'magazine');
    if (!slot) {
      throw new Error('Rifle magazine look is incomplete');
    }
    const gltf = await parseGlb(readFileSync(`${BASE}/${firearm.file}`));
    const node = gltf.parser.json.nodes.find(
      (candidate: { name?: string; translation?: number[] }) => candidate.name === 'magazine:magazine',
    ) as unknown as { translation?: number[] } | undefined;
    if (!node?.translation) {
      throw new Error('Exported rifle has no magazine node transform');
    }
    node.translation.forEach((coordinate, axis) => {
      expect(coordinate).toBeCloseTo(firearm.gun!.slots!.magazine!.at[axis]!, 12);
    });
    expect(slot.at).toEqual(firearm.gun.slots.magazine.at);
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

  it('maps melee weapons to models with attack-compatible hold poses', () => {
    expect(models.length).toBeGreaterThan(0);
    for (const model of models) {
      expect(['forward', 'upright']).toContain(model.hold);
    }

    const weapons = [...registry.items.values()].filter((item) => item.weapon?.melee);
    expect(weapons.length).toBeGreaterThan(0);
    for (const item of weapons) {
      expect(item.model, `${item.id} model`).toBeDefined();
      const model = melee.models.get(item.model!);
      expect(model, `${item.id} melee model`).toBeDefined();
      if (model!.hold === 'forward') {
        expect(item.weapon!.melee!.type, `${item.id} forward hold`).not.toBe('blunt');
      }
    }
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
      expect(sourceBox.isEmpty()).toBe(false);
      expect(def.file).toMatch(MODEL_FILE);
    },
  );

  it('points the hammer striking face forward and its claw back', async () => {
    const face = await heldAnchor('hammer', 'face');
    const claw = await heldAnchor('hammer', 'claw');
    expect(face.z).toBeLessThan(0);
    expect(claw.z).toBeGreaterThan(0);
  });

  it('points the machete cutting edge forward', async () => {
    const edge = await heldAnchor('machete', 'edge');
    expect(edge.z).toBeLessThan(0);
  });

  it('points the Kabar strike tip forward from its held grip', async () => {
    const strike = await heldAnchor('kabar', 'strike');
    expect(strike.z).toBeLessThan(0);
  });

  it('points the crowbar claw forward', async () => {
    const claw = await heldAnchor('crowbar', 'claw');
    expect(claw.z).toBeLessThan(0);
  });

  it('holds the pipe elbow forward while its shaft stays upright', async () => {
    const def = melee.models.get('steel_pipe')!;
    const bytes = readFileSync(`${BASE}/${def.file}`);
    const { scene } = await parseGlb(bytes);
    const { held } = prepareModel(def, scene);
    held.updateMatrixWorld(true);
    const offset = held.children[0]!.children[0]!;
    const strike = new Vector3(...def.anchors!.strike!).applyMatrix4(offset.matrixWorld);
    expect(strike.y).toBeGreaterThan(0);
    expect(strike.z).toBeLessThan(0);
  });

  it.each(['forward', 'upright'] as const)(
    'preserves fixture scale and palm-to-strike displacement when held %s',
    (hold) => {
      const scene = new Mesh(new BoxGeometry(0.8, 0.12, 0.06));
      const grip: [number, number, number] = [-0.3, 0, 0];
      const strike: [number, number, number] = [0.4, 0, 0];
      const { held, ground } = prepareModel({ id: 'fixture', file: 'fixture.glb', hold, grip: { at: grip } }, scene);
      held.updateMatrixWorld(true);
      const frame = heldModelFrame(held);
      expect(frame.localToWorld(new Vector3(...grip)).length()).toBeCloseTo(0);
      const contact = frame.localToWorld(new Vector3(...strike));
      expect(contact.length()).toBeCloseTo(strike[0] - grip[0]);
      expect(contact.x).toBeCloseTo(0);
      expect(hold === 'forward' ? contact.z : contact.y).toBeCloseTo(
        (hold === 'forward' ? -1 : 1) * (strike[0] - grip[0]),
      );
      const bounds = new Box3().setFromObject(ground);
      expect(bounds.min.y).toBeCloseTo(0);
      expect(bounds.getSize(new Vector3()).toArray()).toEqual(
        new Box3().setFromObject(scene).getSize(new Vector3()).toArray(),
      );
    },
  );
});

describe('base pack modeled ammunition and spent cases', () => {
  it('links modeled ammo to a stackable spent-case item of the same calibre', () => {
    const cartridges = [...registry.items.values()].filter((item) => item.ammo && item.model);
    expect(cartridges.length).toBeGreaterThan(0);
    for (const loaded of cartridges) {
      const { calibre } = loaded.ammo!;
      const fired = registry.items.get(spentCaseItemId(calibre));
      expect(fired).toBeDefined();
      expect(registry.models.get(loaded.model!)?.gun?.calibre).toBe(calibre);
      expect(registry.models.get(fired!.model!)?.gun?.calibre).toBe(calibre);
      expect(loaded.stack).toBeGreaterThan(1);
      expect(fired!.stack).toBeGreaterThan(1);
    }
  });
  it('loads every ammunition and spent-case model through prepareModel resting on the ground, centred', async () => {
    const ids = new Set<string>();
    for (const item of registry.items.values()) {
      if (item.ammo && item.model) {
        ids.add(item.model);
        const fired = registry.items.get(spentCaseItemId(item.ammo.calibre));
        if (fired?.model) {
          ids.add(fired.model);
        }
      }
    }
    expect(ids.size).toBeGreaterThan(0);
    const loaded = await Promise.all(
      [...ids].map(async (id) => ({
        id,
        def: registry.models.get(id)!,
        ...(await parseGlb(readFileSync(`${BASE}/${registry.models.get(id)!.file}`))),
      })),
    );
    for (const { id, def, scene } of loaded) {
      expect(def.gun?.calibre, id).toBeDefined();
      expect(def.grip, id).toBeUndefined();
      const { ground, groundParts } = prepareModel(def, scene);
      const bounds = new Box3().setFromObject(ground);
      const size = bounds.getSize(new Vector3());
      const centre = bounds.getCenter(new Vector3());
      expect(size.x, id).toBeGreaterThan(0);
      expect(size.y, id).toBeGreaterThan(0);
      expect(size.z, id).toBeGreaterThan(0);
      // Hand-held ammunition: well under half a metre on any axis.
      expect(Math.max(size.x, size.y, size.z), id).toBeLessThan(0.5);
      expect(bounds.min.y, id).toBeCloseTo(0, 7);
      expect(centre.x, id).toBeCloseTo(0, 7);
      expect(centre.z, id).toBeCloseTo(0, 7);
      expect(groundParts.length, id).toBeGreaterThan(0);
    }
  });
});

it('loads both exported STANAG magazine GLBs with the same body width', async () => {
  const sizes = await Promise.all(
    ['magazine_stanag_20', 'magazine_stanag_30'].map(async (id) => {
      const definition = registry.models.get(id);
      expect(definition).toBeDefined();
      const { scene } = await parseGlb(readFileSync(`${BASE}/${definition!.file}`));
      scene.updateMatrixWorld(true);
      const size = new Box3().setFromObject(scene).getSize(new Vector3());
      expect(size.x).toBeGreaterThan(0);
      expect(size.y).toBeGreaterThan(0);
      expect(size.z).toBeGreaterThan(0);
      expect(size.z).toBeLessThan(size.x);
      expect(size.z).toBeLessThan(size.y);
      return size;
    }),
  );
  expect(sizes[0]!.z).toBeCloseTo(sizes[1]!.z, 7);
});

describe('base pack guns', () => {
  const firearms = registry;
  const { models } = firearms;
  const guns = [...models.values()].filter((m) => m.anchors?.muzzle);

  it.each(guns.map((m) => [m.id, m] as const))('%s is held muzzle forward, top up', async (_, def) => {
    const bytes = readFileSync(`src/content/base/${def.file}`);
    const gltf = await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer, '');
    if (gltf.parser.json.asset.generator === 'skelly gungen glb export') {
      expect(def.gun?.sight, `${def.id} Gungen exports need sight metadata`).toBeDefined();
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
    expect(def.grip?.turn).toEqual([0, 0, 0]);
    expect(def.anchors?.muzzle?.[0]).toBeGreaterThan(def.grip!.at[0]);
    expect(def.anchors?.muzzle?.[0]).toBeCloseTo(bounds.max.x, 5);

    const { held } = prepareModel(def, scene);
    held.updateMatrixWorld(true);
    const offset = held.children[0]!.children[0]!;
    const top = new Vector3(def.grip!.at[0], def.grip!.at[1] + 0.1, def.grip!.at[2]).applyMatrix4(offset.matrixWorld);
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
