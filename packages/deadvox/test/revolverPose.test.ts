import { readFileSync } from 'node:fs';
import { Box3, Matrix4, Mesh, PerspectiveCamera, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { expect, it } from 'vitest';
import type { ModelDef } from '../src/core/content.ts';
import type { CylinderState } from '../src/core/firearmState.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory, SIDES } from '../src/core/inventory.ts';
import { revolverChamberPoint } from '../src/core/revolverPose.ts';
import { FirearmMechanics } from '../src/game/firearmHandling.ts';
import { ARM_NODE } from '../src/render/armRig.ts';
import { actionPartPaths, cloneHeldModel, poseRevolverParts } from '../src/render/firearmModel.ts';
import { HeldItems } from '../src/render/hands.ts';
import { heldModelFrame, type ModelLibrary, prepareModel } from '../src/render/models.ts';
import { loadFigureModels } from './figureModels.ts';
import { content } from './fixtures/startupContent.ts';

const loadModel = (model: ModelDef) => {
  const bytes = readFileSync(`src/content/base/${model.file}`);
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
};

it('flat revolver nodes ride the crane without accumulating motion, then return to their exported rests', async () => {
  const model = [...content.registry.models.values()].find((definition) => definition.gun?.revolver)!;
  const data = model.gun!.revolver!;
  const gltf = await loadModel(model);
  const paths = actionPartPaths(gltf.scene, undefined, gltf.parser, data);
  const held = cloneHeldModel(prepareModel(model, gltf.scene).held, paths);
  const state: CylinderState = {
    chambers: Array.from({ length: data.chambers }, () => ({ state: 'empty' })),
    aligned: 0,
    open: false,
    cocked: false,
  };
  const rests = held.parts.map((part) => part.restMatrix.clone());
  expect(held.parts.length).toBeGreaterThan(0);
  state.open = true;
  poseRevolverParts(held.parts, data, state);
  const posed = held.parts.map((part) => part.node.matrix.clone());
  const cylinder = held.parts.find((part) => part.revolverPart === 'cylinder')!;
  const crane = held.parts.find((part) => part.revolverPart === 'crane')!;
  const delta = (part: typeof cylinder) => part.node.matrix.clone().multiply(part.restMatrix.clone().invert());
  const point = new Vector3(...data.cylinder.centre);
  const carriedPoint = point.clone().applyMatrix4(delta(cylinder));
  expect(carriedPoint.distanceTo(point)).toBeGreaterThan(0);
  const cranePoint = point.clone().applyMatrix4(delta(crane));
  expect(carriedPoint.distanceTo(cranePoint)).toBeLessThan(1e-9);
  poseRevolverParts(held.parts, data, state);
  held.parts.forEach((part, index) => {
    expect(part.node.matrix.elements).toEqual(posed[index]!.elements);
  });
  state.open = false;
  poseRevolverParts(held.parts, data, state);
  held.parts.forEach((part, index) => {
    const error = new Matrix4()
      .copy(part.node.matrix)
      .elements.map((value, axis) => Math.abs(value - rests[index]!.elements[axis]!));
    expect(Math.max(...error)).toBeLessThan(1e-9);
  });
});

it('seats every loaded round inside its exported cylinder chamber', async () => {
  const { registry } = content;
  const definitions = [...registry.items.values()];
  const gunDef = definitions.find((definition) => definition.firearm?.revolver && definition.model)!;
  const model = registry.models.get(gunDef.model!)!;
  const data = model.gun!.revolver!;
  const ammoDef = definitions.find(
    (definition) => definition.ammo?.calibre === model.gun?.calibre && definition.model,
  )!;
  const gunFile = await loadModel(model);
  const roundFile = await loadModel(registry.models.get(ammoDef.model!)!);
  const prepared = prepareModel(model, gunFile.scene);
  const paths = actionPartPaths(gunFile.scene, undefined, gunFile.parser, data);
  const figureModels = await loadFigureModels(registry);
  const gunHeld = cloneHeldModel(prepared.held, paths);
  const models = {
    version: 0,
    ...figureModels,
    heldLook: () => ({ ...gunHeld, slots: {} }),
    part: (id: string) => (id === ammoDef.model ? roundFile.scene.clone() : figureModels.part(id)),
  } as unknown as ModelLibrary;
  const inventory = new Inventory(registry);
  const gun = inventory.create(gunDef.id);
  const rounds = inventory.create(ammoDef.id, data.chambers);
  expect(inventory.add(gun, { kind: 'hand', side: 'right' })).toBe(true);
  const carrier = definitions.find((definition) => definition.wearable?.slot === 'back' && definition.container)!;
  const bag = inventory.create(carrier.id);
  expect(inventory.add(bag, { kind: 'worn' })).toBe(true);
  expect(inventory.add(rounds, { kind: 'pocket', owner: bag, pocket: 0 })).toBe(true);
  const queue = new HandlingQueue(inventory);
  const mechanics = new FirearmMechanics(inventory, queue, {
    blockSize: 0.5,
    pose: () => undefined,
    onEjection: () => undefined,
  });
  let time = 0;
  const finish = () => {
    expect(queue.jobs).toHaveLength(1);
    const { duration } = queue.jobs[0]!;
    queue.tick(duration);
    time += duration;
  };
  expect(mechanics.loadNext(gun.uid, time)).toBeUndefined();
  finish();
  for (let i = 0; i < data.chambers; i++) {
    expect(mechanics.loadNext(gun.uid, time)).toBeUndefined();
    finish();
  }
  mechanics.releaseLoad(gun.uid, time);
  finish();
  expect(gun.firearm!.cylinder!.chambers.every((chamber) => chamber.state === 'round')).toBe(true);
  const held = new HeldItems(inventory, models, registry.figures.get('player')!, { nearPlaneMetres: 0.01 });
  try {
    held.update(new PerspectiveCamera(), undefined, 0, { firearms: mechanics.frames() });
    const { scene } = held.warmUpTarget;
    scene.updateMatrixWorld(true);
    const cylinder = gunHeld.parts.find((part) => part.revolverPart === 'cylinder')!.node;
    expect(cylinder).toBeInstanceOf(Mesh);
    const positions = (cylinder as Mesh).geometry.getAttribute('position');
    const vertices = Array.from({ length: positions.count }, (_, index) =>
      new Vector3().fromBufferAttribute(positions, index),
    );
    const drum = new Box3().setFromPoints(vertices);
    const roundBounds = new Box3().setFromObject(roundFile.scene);
    const roundCentre = roundBounds.getCenter(new Vector3());
    const roundSize = roundBounds.getSize(new Vector3());
    const chamberRadius = Math.min(roundSize.y, roundSize.z) / 2;
    const drawnRounds: (typeof roundFile.scene)[] = [];
    scene.traverse((object) => {
      if (object.userData.chamber !== undefined) {
        drawnRounds.push(object as typeof roundFile.scene);
      }
    });
    expect(drawnRounds).toHaveLength(data.chambers);
    for (const round of drawnRounds) {
      const centre = cylinder.worldToLocal(roundCentre.clone().applyMatrix4(round.matrixWorld));
      expect(drum.containsPoint(centre)).toBe(true);
      const angle = data.cylinder.chamberZeroRadians + (Number(round.userData.chamber) * 2 * Math.PI) / data.chambers;
      const orbit = data.cylinder.chamberRadiusMetres;
      expect(Math.hypot(centre.y - orbit * Math.cos(angle), centre.z - orbit * Math.sin(angle))).toBeLessThan(
        chamberRadius,
      );
    }
  } finally {
    held.dispose();
  }
});

it('keeps the loading cartridge at the palm grip through the real revolver transforms on either hand', async () => {
  const { registry } = content;
  const definitions = [...registry.items.values()];
  const gunDef = definitions.find((definition) => definition.firearm?.revolver && definition.model)!;
  const model = registry.models.get(gunDef.model!)!;
  const ammoDef = definitions.find(
    (definition) => definition.ammo?.calibre === model.gun?.calibre && definition.model,
  )!;
  const ammoModel = registry.models.get(ammoDef.model!)!;
  const carrier = definitions.find((definition) => definition.wearable?.slot === 'back' && definition.container)!;
  const figure = registry.figures.get('player')!;
  const gunFile = await loadModel(model);
  const roundFile = await loadModel(ammoModel);
  const gunPrepared = prepareModel(model, gunFile.scene);
  const roundPrepared = prepareModel(ammoModel, roundFile.scene);
  const paths = actionPartPaths(gunFile.scene, undefined, gunFile.parser, model.gun?.revolver);
  const models = {
    version: 0,
    ...(await loadFigureModels(registry)),
    heldLook: () => {
      const held = cloneHeldModel(gunPrepared.held, paths);
      held.root.name = 'revolver-load-probe';
      return { ...held, slots: {} };
    },
    held: () => {
      const held = cloneHeldModel(roundPrepared.held, []);
      held.root.name = 'cartridge-load-probe';
      return held;
    },
  } as unknown as ModelLibrary;
  const tuning = gunDef.firearm!.revolver!.loadPose;
  for (const side of SIDES) {
    const inventory = new Inventory(registry);
    const gun = inventory.create(gunDef.id);
    const bag = inventory.create(carrier.id);
    const rounds = inventory.create(ammoDef.id, 2);
    expect(inventory.add(gun, { kind: 'hand', side })).toBe(true);
    expect(inventory.add(bag, { kind: 'worn' })).toBe(true);
    expect(inventory.add(rounds, { kind: 'pocket', owner: bag, pocket: 0 })).toBe(true);
    const queue = new HandlingQueue(inventory);
    const mechanics = new FirearmMechanics(inventory, queue, {
      blockSize: 0.5,
      pose: () => undefined,
      onEjection: () => undefined,
    });
    const held = new HeldItems(inventory, models, figure, { nearPlaneMetres: 0.01 });
    const camera = new PerspectiveCamera();
    const other = side === 'right' ? 'left' : 'right';
    const { scene } = held.warmUpTarget;
    try {
      expect(mechanics.loadNext(gun.uid, 0)).toBeUndefined();
      const opening = queue.jobs[0]!.duration;
      queue.tick(opening);
      expect(mechanics.loadNext(gun.uid, opening)).toBeUndefined();
      const { duration } = queue.jobs[0]!;
      let previous = 0;
      for (const progress of [tuning.pickupEnd, (tuning.pickupEnd + tuning.approachEnd) / 2, tuning.approachEnd]) {
        queue.tick((progress - previous) * duration);
        previous = progress;
        const frames = mechanics.frames();
        held.update(camera, undefined, 0, { firearms: frames, job: queue.jobs[0] });
        const palm = scene.getObjectByName(`first-person-arm-${other}`)!.getObjectByName(ARM_NODE.hand)!;
        const round = scene.getObjectByName('cartridge-load-probe')!;
        expect(round.visible).toBe(true);
        const roundWorld = round.getWorldPosition(new Vector3());
        const grip = palm.worldToLocal(roundWorld.clone());
        expect(grip.distanceTo(new Vector3(0, tuning.palmBelow, -tuning.palmBack))).toBeLessThan(1e-8);
        if (progress === tuning.approachEnd) {
          const chamber = frames[0]!.revolver!.chamber!;
          const point = revolverChamberPoint(model.gun!.revolver!, chamber, chamber, 1);
          const gunRoot = scene.getObjectByName('revolver-load-probe')!;
          const mouth = heldModelFrame(gunRoot).localToWorld(new Vector3(...point));
          expect(roundWorld.distanceTo(mouth)).toBeLessThan(1e-8);
        }
      }
    } finally {
      held.dispose();
    }
  }
});
