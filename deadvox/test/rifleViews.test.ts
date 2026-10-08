// A rifle as the player sees it: drawn with the magazine it really has in every view (DESIGN.md, "One item, one
// look"), and its handling played on it from the job alone.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  Box3,
  type BufferGeometry,
  type Matrix4,
  Mesh,
  type Object3D,
  PerspectiveCamera,
  Quaternion,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { expect, it, vi } from 'vitest';
import { AimController, NEUTRAL_AIM } from '../src/core/aim.ts';
import { dominantSide } from '../src/core/character.ts';
import { buildRegistry, type Registry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { crosshairAimPoint } from '../src/core/crosshairTarget.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { heldFirearmTransform } from '../src/core/heldPose.ts';
import { Inventory } from '../src/core/inventory.ts';
import { Rng } from '../src/core/random.ts';
import { type FirearmBoreRay, firearmBoreRay } from '../src/game/firearmAim.ts';
import { FirearmMechanics, firearmHandlingFor } from '../src/game/firearmHandling.ts';
import { handlingRotation } from '../src/render/handlingTurn.ts';
import { type HeldHandlingFrame, HeldItems } from '../src/render/hands.ts';
import { ModelLibrary } from '../src/render/models.ts';
import { PileMeshes } from '../src/render/piles.ts';
import { rifleAmmunition, rifleInHand, settle } from './rifleFixture.ts';

const BASE = 'src/content/base';
const BLOCK = 0.5;
const RIFLE = 'rifle_assault';
const PUMP = 'pump_shotgun';
const SPARE = 'look-fixture-magazine';
const SPARE_MODEL = 'look-fixture-magazine-model';
const { registry, issues } = buildRegistry(
  readdirSync(BASE)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown })),
);
const magazineType = rifleAmmunition(registry, RIFLE).magazine;
const magazineDef = registry.items.get(magazineType)!;
const magazineModel = registry.models.get(magazineDef.model!)!;
// A spare that fits the same well but looks like another magazine, so a change shows a different model.
const otherLook = [...registry.models.values()].find((model) => model.rounds && model.file !== magazineModel.file)!;
const content: Registry = {
  ...registry,
  models: new Map(registry.models).set(SPARE_MODEL, { ...magazineModel, id: SPARE_MODEL, file: otherLook.file }),
  items: new Map(registry.items).set(SPARE, { ...magazineDef, id: SPARE, model: SPARE_MODEL }),
};
const modelOf = (type: string): string => content.items.get(type)!.model!;
const standing = () => ({
  feet: [0, 1, 0] as Vec3,
  eye: [0, 4, 0] as Vec3,
  yaw: 0,
  pitch: 0,
  aimFrame: NEUTRAL_AIM,
  blockSize: BLOCK,
  ready: true,
  sprinting: false,
});

/** A library of just `ids`, its files parsed from disk and awaited rather than fetched after a wall-clock wait. */
const library = async (ids: readonly string[]): Promise<ModelLibrary> => {
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

interface DrawnMagazine {
  readonly model: string;
  /** Distance and turn from the rifle's own magazine node, the slot a fitted magazine replaces. */
  readonly offset: number;
  readonly angle: number;
}

/** A held rifle with one loaded magazine and one empty spare carried, drawn in hand and on the ground. */
const rig = async () => {
  const magazineModels = [modelOf(magazineType), SPARE_MODEL];
  const models = await library([modelOf(RIFLE), ...magazineModels]);
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
  const magazinesIn = (root: Object3D): DrawnMagazine[] => {
    const slot = magazineNodes(root, false).find((node) => modelOfNode(node) === modelOf(RIFLE))!;
    const at = (node: Object3D) => node.getWorldPosition(new Vector3());
    const turn = (node: Object3D) => node.getWorldQuaternion(new Quaternion());
    return magazineNodes(root, true).map((node) => ({
      model: modelOfNode(node),
      offset: at(node).distanceTo(at(slot)),
      angle: turn(node).angleTo(turn(slot)),
    }));
  };

  const inventory = new Inventory(content);
  const queue = new HandlingQueue(inventory);
  // A magazine taken out goes to a pocket, or to the ground at the standing feet.
  const mechanics = new FirearmMechanics(inventory, queue, {
    blockSize: BLOCK,
    pose: standing,
    onEjection: () => undefined,
  });
  const { rifle, magazine, bag } = rifleInHand(inventory, queue, { type: RIFLE });
  const spare = inventory.create(magazine.type === SPARE ? magazineType : SPARE);
  if (!inventory.add(spare, { kind: 'pocket', owner: bag, pocket: 0 })) {
    throw new Error('The spare magazine does not fit the bag');
  }
  const hand = { kind: 'hand', side: dominantSide(inventory.character) } as const;
  const held = new HeldItems(inventory, models, content.figures.get('player')!.palette);
  const piles = new PileMeshes(BLOCK, models);
  const camera = new PerspectiveCamera();
  const pose = (): Object3D => {
    held.update(camera, undefined, 0, { firearms: mechanics.frames() });
    return held.warmUpTarget.scene;
  };
  return {
    inventory,
    queue,
    mechanics,
    rifle,
    magazine,
    spare,
    pose,
    inHand: (): DrawnMagazine[] => magazinesIn(pose()),
    /** Drops the rifle where nothing else lies, draws the ground, and picks it back up. */
    onGround: (): DrawnMagazine[] => {
      if (!(inventory.piles.size === 0 && inventory.move(rifle, { kind: 'pile', pos: [0, 0, 0] }).ok)) {
        throw new Error('The rifle cannot lie alone on the ground');
      }
      piles.sync(inventory);
      const drawn = magazinesIn(piles.group);
      if (!inventory.move(rifle, hand).ok) {
        throw new Error('The rifle cannot be picked back up');
      }
      return drawn;
    },
    dispose: () => {
      held.dispose();
      piles.dispose();
    },
  };
};

/** Exactly the magazine of `type`, seated where the rifle's own magazine node is. */
const seated = (type: string) => [{ model: modelOf(type), offset: expect.closeTo(0, 6), angle: expect.closeTo(0, 6) }];

it('draws the magazine a rifle really has, in hand and on the ground: its own model at the slot, none once removed', async () => {
  expect(issues).toEqual([]);
  const { queue, mechanics, rifle, magazine, spare, inHand, onGround, dispose } = await rig();
  try {
    expect(mechanics.loadNext(rifle.uid, 0)).toBeUndefined();
    settle(queue);
    expect(inHand()).toEqual(seated(magazine.type));
    expect(onGround()).toEqual(seated(magazine.type));

    expect(mechanics.loadNext(rifle.uid, 0)).toBeUndefined();
    settle(queue);
    expect(rifle.slots?.magazine?.uid).toBe(spare.uid);
    expect(inHand()).toEqual(seated(spare.type));

    expect(mechanics.removeMagazine(rifle.uid, 0)).toBeUndefined();
    settle(queue);
    expect(inHand()).toEqual([]);
    expect(onGround()).toEqual([]);
  } finally {
    dispose();
  }
});

it('animates a change from the job alone: the fitted magazine leaves the well, then the new one seats', async () => {
  const { inventory, queue, mechanics, rifle, magazine, spare, inHand, dispose } = await rig();
  const state = () =>
    structuredClone({ inventory: inventory.snapshotState(), version: inventory.version, queue: queue.jobs });
  try {
    expect(mechanics.loadNext(rifle.uid, 0)).toBeUndefined();
    settle(queue);
    expect(mechanics.loadNext(rifle.uid, 0)).toBeUndefined();
    const { duration } = queue.jobs[0]!;
    const samples = 24;
    const seen: DrawnMagazine[] = [];
    for (let step = 1; step < samples; step++) {
      queue.tick(duration / samples);
      const before = state();
      const drawn = inHand();
      expect(state()).toEqual(before);
      expect(drawn).toHaveLength(1); // One magazine at a time, never none mid-change.
      seen.push(drawn[0]!);
    }
    const switchAt = seen.findIndex(({ model }) => model === modelOf(spare.type));
    expect(switchAt).toBeGreaterThan(0);
    const leaving = seen.slice(0, switchAt);
    const seating = seen.slice(switchAt);
    expect(leaving.every(({ model }) => model === modelOf(magazine.type))).toBe(true);
    expect(seating.every(({ model }) => model === modelOf(spare.type))).toBe(true);
    const offsets = (drawn: readonly DrawnMagazine[]) => drawn.map(({ offset }) => offset);
    expect(offsets(leaving)).toEqual(offsets(leaving).toSorted((a, b) => a - b));
    expect(offsets(seating)).toEqual(offsets(seating).toSorted((a, b) => b - a));
    expect(leaving.at(-1)!.offset).toBeGreaterThan(leaving[0]!.offset);
    expect(seating[0]!.offset).toBeGreaterThan(seating.at(-1)!.offset);
    settle(queue);
    expect(inHand()).toEqual(seated(spare.type));
  } finally {
    dispose();
  }
});

it('works the charging handle with the off hand through a rack, from the cycle alone', async () => {
  const { inventory, queue, mechanics, rifle, pose, dispose } = await rig();
  const support = dominantSide(inventory.character) === 'right' ? 'left' : 'right';
  const { action } = firearmHandlingFor(rifle, content);
  // The part only a hand moves is the handle; the hand reaches for its middle.
  const handle = Object.values(action.parts).find((part) => !part.modes.includes('fire'))!.node;
  const reachLeft = (): number => {
    const scene = pose();
    const grip = scene.getObjectByName(`first-person-arm-${support}`)?.getObjectByName('grip-anchor');
    let node: Object3D | undefined;
    scene.traverse((object) => {
      node ??= object.userData.name === handle ? object : undefined;
    });
    if (!(grip && node)) {
      throw new Error('Missing the off hand or the charging handle');
    }
    return grip.getWorldPosition(new Vector3()).distanceTo(new Box3().setFromObject(node).getCenter(new Vector3()));
  };
  let now = 0;
  const advance = (to: number) => {
    queue.tick(to - now);
    mechanics.advanceTo(to);
    now = to;
  };
  try {
    expect(mechanics.loadNext(rifle.uid, 0)).toBeUndefined();
    settle(queue);
    const rest = reachLeft();
    expect(mechanics.cock(rifle.uid, 0)).toBeUndefined();
    advance(action.hand.rearwardSimSeconds + action.hand.dwellSimSeconds / 2);
    expect(reachLeft()).toBeLessThan(rest / 10); // Holding the handle back.
    advance(action.hand.durationSimSeconds);
    expect(queue.busy).toBe(false);
    expect(reachLeft()).toBeCloseTo(rest, 6);
  } finally {
    dispose();
  }
});

/** An empty `type` alone in the dominant hand, drawn lowered from an unturned camera at the origin. */
const heldGun = async (type: string) => {
  const models = await library([modelOf(type)]);
  const inventory = new Inventory(content);
  const queue = new HandlingQueue(inventory);
  const mechanics = new FirearmMechanics(inventory, queue, {
    blockSize: BLOCK,
    pose: standing,
    onEjection: () => undefined,
  });
  const gun = inventory.create(type);
  const side = dominantSide(inventory.character);
  if (!inventory.add(gun, { kind: 'hand', side })) {
    throw new Error(`Cannot hold ${type}`);
  }
  const held = new HeldItems(inventory, models, content.figures.get('player')!.palette);
  const camera = new PerspectiveCamera();
  return {
    queue,
    mechanics,
    gun,
    side,
    camera,
    held,
    /** The drawn gun's world transform, read from its barrel node, which no action moves. */
    heldFrame: (handling: HeldHandlingFrame = { firearms: mechanics.frames() }): Matrix4 => {
      held.update(camera, undefined, 0, handling);
      const { scene } = held.warmUpTarget;
      scene.updateMatrixWorld(true);
      let barrel: Object3D | undefined;
      scene.traverse((object) => {
        barrel ??= object.userData.name === 'barrel:barrel' ? object : undefined;
      });
      if (!barrel) {
        throw new Error(`No barrel node drawn for ${type}`);
      }
      return barrel.matrixWorld.clone();
    },
    dispose: () => held.dispose(),
  };
};

it('keeps over-limit view pitch changes in ADS while the held pose takes the recoil frame', async () => {
  const { mechanics, gun, camera, heldFrame, dispose } = await heldGun(RIFLE);
  const tuning = registry.skills.get('firearms_combat')!.combat!.firearms!;
  const aim = new AimController({
    wobbleLimitRadians: tuning.wobbleLimitRadians,
    wobbleShape: {
      verticalToHorizontalRatio: tuning.wobbleVerticalToHorizontalRatio,
      archPower: tuning.wobbleLuneArchPower,
      phaseOffsetRadians: tuning.wobbleLunePhaseOffsetRadians,
    },
    wobbleSeed: Rng.stream(73, 'rifle-view-tests').int(0, 0xff_ff_ff_ff),
    wobbleNoise: {
      reversionRatePerSimSecond: tuning.wobbleNoiseReversionRatePerSimSecond,
      sigmaRadiansPerSqrtSecond: tuning.wobbleNoiseSigmaRadiansPerSqrtSecond,
      smoothingSimSeconds: tuning.wobbleNoiseSmoothingSimSeconds,
    },
  });
  aim.recordShot(1, 0.3);
  aim.advance({
    dt: 1 / 60,
    velocity: [0, 0, 0],
    blockSize: BLOCK,
    yaw: 0,
    pitch: 0,
    variance: 1,
    firing: true,
    recoilRecoveryRate: 1,
    stridePhase: 0,
  });
  const viewShift = aim.pendingViewPitchShift;
  expect(viewShift).toBeGreaterThan(0);
  aim.applyViewPitchShift(viewShift, viewShift);
  camera.rotation.x = viewShift;
  camera.updateMatrixWorld(true);
  const shiftedView = camera.quaternion.clone();
  const shiftedPitch = camera.rotation.x;
  const readiness = { uid: gun.uid, progress: 1, aimingDownSights: true };
  try {
    const restingFrame = heldFrame({ firearms: mechanics.frames(), readiness, aim: NEUTRAL_AIM });
    const recoilFrame = heldFrame({ firearms: mechanics.frames(), readiness, aim: aim.frame });
    expect(recoilFrame.equals(restingFrame)).toBe(false);
    expect(camera.quaternion.angleTo(shiftedView)).toBeLessThan(1e-6);
    expect(camera.rotation.x).toBeCloseTo(shiftedPitch, 12);
  } finally {
    dispose();
  }
});

// The rifle turns muzzle-in for a rack; the pump cants its port into view instead.
it.each([RIFLE, PUMP])('keeps the crosshair on the drawn %s bore through a rack, turned mid-rack', async (type) => {
  const { queue, mechanics, gun, side, camera, heldFrame, dispose } = await heldGun(type);
  const model = content.models.get(modelOf(type))!;
  const { loweredPitchRadians } = content.skills.get('firearms_combat')!.combat!.firearms!;
  const viewpoint = { eye: [0, 0, 0] as Vec3, yaw: 0, pitch: 0 };
  // The unturned bore shots use, and the crosshair's as play.ts turns it.
  const unturned = (): FirearmBoreRay =>
    firearmBoreRay({
      model,
      ...viewpoint,
      blockSize: BLOCK,
      side,
      leadingSide: side,
      twoHanded: Boolean(content.items.get(type)!.twoHanded),
      aimFrame: NEUTRAL_AIM,
      progress: 0,
      loweredPitchRadians,
    });
  const crosshair = (): FirearmBoreRay => {
    const basePose = heldFirearmTransform({
      model,
      side,
      leadingSide: side,
      twoHanded: Boolean(content.items.get(type)!.twoHanded),
      progress: 0,
      aimingDownSights: false,
      aimFrame: NEUTRAL_AIM,
      loweredPitchRadians,
    });
    const frame = mechanics.frames().find((entry) => entry.uid === gun.uid);
    const handlingTurn = handlingRotation(model, side, frame, {
      x: basePose.rootOffset[0],
      y: basePose.rootOffset[1],
    });
    return firearmBoreRay({
      model,
      ...viewpoint,
      blockSize: BLOCK,
      side,
      leadingSide: side,
      twoHanded: Boolean(content.items.get(type)!.twoHanded),
      aimFrame: NEUTRAL_AIM,
      progress: 0,
      handlingTurn,
      loweredPitchRadians,
    });
  };
  const onScreen = ({ muzzle, direction }: { muzzle: Vec3; direction: Vec3 }): Vector3 =>
    new Vector3(...crosshairAimPoint(muzzle, direction, undefined)).multiplyScalar(BLOCK).project(camera).setZ(0);
  const { action } = firearmHandlingFor(gun, content);
  try {
    const restFrame = heldFrame();
    const rest = unturned();
    expect(crosshair()).toEqual(rest);
    expect(mechanics.cock(gun.uid, 0)).toBeUndefined();
    const midRack = action.hand.rearwardSimSeconds + action.hand.dwellSimSeconds / 2;
    queue.tick(midRack);
    mechanics.advanceTo(midRack);
    // The bore the drawn gun has now: the rest bore, moved as the drawn gun has moved since rest.
    const moved = heldFrame().multiply(restFrame.clone().invert());
    const drawnMuzzle = new Vector3(...rest.muzzle).multiplyScalar(BLOCK).applyMatrix4(moved).divideScalar(BLOCK);
    const drawnDirection = new Vector3(...rest.direction).transformDirection(moved);
    const drawn = { muzzle: drawnMuzzle.toArray() as Vec3, direction: drawnDirection.toArray() as Vec3 };
    const mark = crosshair();
    expect(onScreen(mark).distanceTo(onScreen(drawn))).toBeCloseTo(0, 6);
    expect(new Vector3(...mark.muzzle).distanceTo(new Vector3(...rest.muzzle)) * BLOCK).toBeGreaterThan(0.01);
    queue.tick(action.hand.durationSimSeconds - midRack);
    mechanics.advanceTo(action.hand.durationSimSeconds);
    expect(queue.busy).toBe(false);
    expect(crosshair()).toEqual(rest);
  } finally {
    dispose();
  }
});
