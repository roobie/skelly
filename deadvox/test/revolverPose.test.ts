import { readFileSync } from 'node:fs';
import { Matrix4, PerspectiveCamera, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { expect, it } from 'vitest';
import type { ModelDef } from '../src/core/content.ts';
import type { CylinderState } from '../src/core/firearmState.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory, SIDES } from '../src/core/inventory.ts';
import { revolverChamberPoint } from '../src/core/revolverPose.ts';
import { FirearmMechanics } from '../src/game/firearmHandling.ts';
import { actionPartPaths, cloneHeldModel, poseRevolverParts } from '../src/render/firearmModel.ts';
import { HeldItems } from '../src/render/hands.ts';
import { heldModelFrame, type ModelLibrary, prepareModel } from '../src/render/models.ts';
import { content } from './fixtures/startupContent.ts';

const loadModel = (model: ModelDef) => {
  const bytes = readFileSync(`src/content/base/${model.file}`);
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
};

it('flat revolver nodes ride the crane without accumulating motion, then return to their exported rests', async () => {
  const model = [...content.registry.models.values()].find((definition) => definition.revolver)!;
  const data = model.revolver!;
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

it('keeps the loading cartridge at the palm grip through the real revolver transforms on either hand', async () => {
  const { registry } = content;
  const definitions = [...registry.items.values()];
  const gunDef = definitions.find((definition) => definition.firearm?.revolver && definition.model)!;
  const model = registry.models.get(gunDef.model!)!;
  const ammoDef = definitions.find((definition) => definition.ammo?.calibre === model.calibre && definition.model)!;
  const ammoModel = registry.models.get(ammoDef.model!)!;
  const carrier = definitions.find((definition) => definition.wearable?.slot === 'back' && definition.container)!;
  const figure = [...registry.figures.values()].find((definition) => definition.palette)!;
  const gunFile = await loadModel(model);
  const roundFile = await loadModel(ammoModel);
  const gunPrepared = prepareModel(model, gunFile.scene);
  const roundPrepared = prepareModel(ammoModel, roundFile.scene);
  const paths = actionPartPaths(gunFile.scene, undefined, gunFile.parser, model.revolver);
  const models = {
    version: 0,
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
    const held = new HeldItems(inventory, models, figure.palette);
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
        const palm = scene.getObjectByName(`first-person-arm-${other}`)!.children[2]!;
        const round = scene.getObjectByName('cartridge-load-probe')!;
        expect(round.visible).toBe(true);
        const roundWorld = round.getWorldPosition(new Vector3());
        const grip = palm.worldToLocal(roundWorld.clone());
        expect(grip.distanceTo(new Vector3(0, tuning.palmBelow, -tuning.palmBack))).toBeLessThan(1e-8);
        if (progress === tuning.approachEnd) {
          const chamber = frames[0]!.revolver!.chamber!;
          const point = revolverChamberPoint(model.revolver!, chamber, chamber, 1);
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
