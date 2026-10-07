// A gun is drawn with the magazine it really has, in every view (DESIGN.md, "One item, one look").
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type BufferGeometry, Mesh, type Object3D, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { expect, it, vi } from 'vitest';
import { dominantSide } from '../src/core/character.ts';
import { buildRegistry, type Registry } from '../src/core/content.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import { FirearmMechanics } from '../src/game/firearmHandling.ts';
import { HeldItems } from '../src/render/hands.ts';
import { ModelLibrary } from '../src/render/models.ts';
import { PileMeshes } from '../src/render/piles.ts';
import { rifleAmmunition, rifleInHand, settle } from './rifleFixture.ts';

const BASE = 'src/content/base';
const RIFLE = 'rifle_assault';
const SPARE = 'look-fixture-magazine';
const SPARE_MODEL = 'look-fixture-magazine-model';
const { registry, issues } = buildRegistry(
  readdirSync(BASE)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown })),
);

/** A library of just `ids`, its files parsed from disk and awaited rather than fetched after a wall-clock wait. */
const library = async (content: Registry, ids: readonly string[]): Promise<ModelLibrary> => {
  const defs = ids.map((id) => content.models.get(id)!);
  const loads: Promise<void>[] = [];
  const spy = vi.spyOn(GLTFLoader.prototype, 'load').mockImplementation((path, onLoad, _onProgress, onError) => {
    loads.push(new GLTFLoader().parseAsync(Uint8Array.from(readFileSync(path)).buffer, '').then(onLoad, onError));
  });
  const errors: string[] = [];
  const models = new ModelLibrary(
    { ...content, models: new Map(defs.map((def) => [def.id, def])) },
    (message) => errors.push(message),
    Object.fromEntries(defs.map(({ file }) => [file, join(BASE, file)])),
  );
  spy.mockRestore();
  await Promise.all(loads);
  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }
  return models;
};

it('draws the magazine a rifle really has, in hand and on the ground: its own model at the slot, none once removed', async () => {
  expect(issues).toEqual([]);
  const magazineType = rifleAmmunition(registry, RIFLE).magazine;
  const magazineDef = registry.items.get(magazineType)!;
  const magazineModel = registry.models.get(magazineDef.model!)!;
  // A spare that fits the same well but looks like another magazine, so a change shows a different model.
  const otherLook = [...registry.models.values()].find((model) => model.rounds && model.file !== magazineModel.file)!;
  const content = {
    ...registry,
    models: new Map(registry.models).set(SPARE_MODEL, { ...magazineModel, id: SPARE_MODEL, file: otherLook.file }),
    items: new Map(registry.items).set(SPARE, { ...magazineDef, id: SPARE, model: SPARE_MODEL }),
  };
  const modelOf = (type: string) => content.items.get(type)!.model!;
  const magazineModels = [modelOf(magazineType), SPARE_MODEL];
  const models = await library(content, [modelOf(RIFLE), ...magazineModels]);

  // A magazine model's meshes share their loaded geometry, and its glTF node has the name of the rifle's own
  // magazine node, so every magazine drawn is found by node name and told apart by geometry.
  const owner = new Map<BufferGeometry, string>();
  const nodeNames = new Set<unknown>();
  for (const id of magazineModels) {
    models.ground(id)!.traverse((object) => {
      if (object instanceof Mesh) {
        owner.set(object.geometry, id);
        let node: Object3D | null = object;
        while (node && node.userData.name === undefined) {
          node = node.parent;
        }
        nodeNames.add(node?.userData.name);
      }
    });
  }
  const magazineNodes = (root: Object3D, visibleOnly: boolean): Object3D[] => {
    const nodes: Object3D[] = [];
    root.updateMatrixWorld(true);
    root[visibleOnly ? 'traverseVisible' : 'traverse']((object) => {
      if (nodeNames.has(object.userData.name)) {
        nodes.push(object);
      }
    });
    return nodes;
  };
  const modelOfNode = (node: Object3D): string => {
    let id: string | undefined;
    node.traverse((object) => {
      id ??= object instanceof Mesh ? owner.get(object.geometry) : undefined;
    });
    return id ?? modelOf(RIFLE);
  };
  const expectDrawn = (root: Object3D, type?: string) => {
    const drawn = magazineNodes(root, true);
    expect(drawn.map(modelOfNode)).toEqual(type ? [modelOf(type)] : []);
    if (type) {
      // The fitted magazine sits exactly where the rifle's own, hidden, magazine node is.
      const baked = magazineNodes(root, false).find((node) => modelOfNode(node) === modelOf(RIFLE))!;
      const at = (node: Object3D) => node.getWorldPosition(new Vector3());
      const turn = (node: Object3D) => node.getWorldQuaternion(new Quaternion());
      expect(at(drawn[0]!).distanceTo(at(baked))).toBeCloseTo(0, 6);
      expect(turn(drawn[0]!).angleTo(turn(baked))).toBeCloseTo(0, 6);
    }
  };

  const inventory = new Inventory(content);
  const queue = new HandlingQueue(inventory);
  const mechanics = new FirearmMechanics(inventory, queue, {
    blockSize: 0.5,
    // A magazine taken out goes to a pocket, or to the ground at these feet.
    pose: () => ({
      feet: [0, 1, 0],
      eye: [0, 4, 0],
      yaw: 0,
      pitch: 0,
      aimFrame: { yaw: 0, pitch: 0 },
      blockSize: 0.5,
      ready: true,
      sprinting: false,
    }),
    onEjection: () => undefined,
  });
  const { rifle, magazine, bag } = rifleInHand(inventory, queue, { type: RIFLE });
  const spare = inventory.create(magazine.type === SPARE ? magazineType : SPARE);
  expect(inventory.add(spare, { kind: 'pocket', owner: bag, pocket: 0 })).toBe(true);
  const hand = { kind: 'hand', side: dominantSide(inventory.character) } as const;
  const held = new HeldItems(inventory, models, content.figures.get('player')!.palette);
  const piles = new PileMeshes(0.5, models);
  const camera = new PerspectiveCamera();
  const inHand = () => {
    held.update(camera, undefined, 0, { firearms: mechanics.frames() });
    return held.warmUpTarget.scene;
  };
  const onGround = (check: (root: Object3D) => void) => {
    expect(inventory.piles.size).toBe(0); // The rifle is all that lies on the ground.
    expect(inventory.move(rifle, { kind: 'pile', pos: [0, 0, 0] }).ok).toBe(true);
    piles.sync(inventory);
    check(piles.group);
    expect(inventory.move(rifle, hand).ok).toBe(true);
  };
  try {
    expect(mechanics.loadNext(rifle.uid, 0)).toBeUndefined();
    settle(queue);
    expectDrawn(inHand(), magazine.type);
    onGround((root) => expectDrawn(root, magazine.type));

    expect(mechanics.loadNext(rifle.uid, 0)).toBeUndefined();
    settle(queue);
    expect(rifle.slots?.magazine?.uid).toBe(spare.uid);
    expectDrawn(inHand(), spare.type);

    expect(mechanics.removeMagazine(rifle.uid, 0)).toBeUndefined();
    settle(queue);
    expectDrawn(inHand());
    onGround((root) => expectDrawn(root));
  } finally {
    held.dispose();
    piles.dispose();
  }
});
