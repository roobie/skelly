import { readFileSync } from 'node:fs';
import { Box3, Group, Mesh, type Object3D, PerspectiveCamera, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { expect, it } from 'vitest';
import { Character } from '../src/core/character.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { heldAnchorOffset } from '../src/core/heldPose.ts';
import { Inventory, SIDES } from '../src/core/inventory.ts';
import { FirearmMechanics } from '../src/game/firearmHandling.ts';
import { actionPartPaths, cloneHeldModel } from '../src/render/firearmModel.ts';
import { HeldItems } from '../src/render/hands.ts';
import { type ModelLibrary, prepareModel } from '../src/render/models.ts';
import { baseRegistry } from './baseRegistry.ts';

const registry = baseRegistry();

it('the firing hand follows the exported bolt knob rather than moving the support hand', async () => {
  const rifle = [...registry.items.values()].find((item) => item.firearm?.bolt)!;
  const model = registry.models.get(rifle.model!)!;
  const bytes = readFileSync(`src/content/base/${model.file}`);
  const gltf = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );
  const paths = actionPartPaths(gltf.scene, model.gun?.action, gltf.parser);
  const prepared = prepareModel(model, gltf.scene);
  for (const side of SIDES) {
    const inventory = new Inventory(registry);
    const gun = inventory.create(rifle.id);
    expect(inventory.add(gun, { kind: 'hand', side })).toBe(true);
    let knob: Object3D | undefined;
    const models = {
      version: 0,
      has: () => false,
      heldLook: () => {
        const clone = cloneHeldModel(prepared.held, paths);
        knob = clone.parts.find((part) => part.id === 'knob')!.node;
        return { ...clone, slots: {} };
      },
    } as unknown as ModelLibrary;
    const held = new HeldItems(inventory, models, registry.figures.get('player')!);
    const queue = new HandlingQueue(inventory);
    const mechanics = new FirearmMechanics(inventory, queue, {
      blockSize: 0.5,
      pose: () => undefined,
      onEjection: () => undefined,
    });
    const camera = new PerspectiveCamera();
    try {
      held.update(camera, undefined, 0, { firearms: [] });
      expect(mechanics.cock(gun.uid, 0)).toBeUndefined();
      for (const dt of [model.gun!.action!.hand.unlockSimSeconds!, model.gun!.action!.hand.rearwardSimSeconds]) {
        expect(queue.tick(dt).failed).toEqual([]);
        mechanics.advanceTo(dt);
        const before = inventory.snapshotState();
        held.update(camera, undefined, 0, { firearms: mechanics.frames() });
        expect(inventory.snapshotState()).toEqual(before);
        const wrist = held.warmUpTarget.scene
          .getObjectByName(`first-person-arm-${side}`)!
          .getObjectByName('grip-anchor')!;
        const centre = new Box3().setFromObject(knob!).getCenter(new Vector3());
        expect(wrist.getWorldPosition(new Vector3()).distanceTo(centre)).toBeCloseTo(0, 7);
      }
    } finally {
      held.dispose();
    }
  }
});

const loadPoseContent = (kind: 'pump' | 'bolt') => {
  const definitions = [...registry.items.values()];
  const pump = definitions.find((definition) => definition.firearm?.[kind] && definition.model);
  const sourceModel = pump?.model ? registry.models.get(pump.model) : undefined;
  const ammo = definitions.find(
    (definition) => definition.ammo?.calibre === sourceModel?.gun?.calibre && definition.model,
  );
  const carrier = definitions.find((definition) => definition.wearable?.slot === 'back' && definition.container);
  const figure = registry.figures.get('player');
  if (!(pump && sourceModel?.gun?.action && sourceModel.gun.internalMagazine && ammo && carrier && figure)) {
    throw new Error('Missing load-pose fixture capabilities');
  }
  const model = structuredClone(sourceModel);
  model.id = 'load-fixture-gun-model';
  model.grip = { at: [0, 0, 0], turn: [0, 0, 0] };
  model.roll = 0;
  model.hold = undefined;
  model.anchors = { ...model.anchors, support: [0.3, 0, 0] };
  model.anchors.loading_port = [0, kind === 'bolt' ? 0.03 : -0.03, 0];
  const content = {
    ...registry,
    models: new Map(registry.models).set(model.id, model),
    items: new Map(registry.items)
      .set('load-fixture-gun', { ...pump, id: 'load-fixture-gun', model: model.id, twoHanded: true })
      .set('load-fixture-shell', { ...ammo, id: 'load-fixture-shell', size: [1, 1] as [number, number], weight: 0.03 })
      .set('load-fixture-carrier', { ...carrier, id: 'load-fixture-carrier' }),
  };
  return { content, model, figure };
};

it.each(SIDES.flatMap((holdingSide) => (['pump', 'bolt'] as const).map((kind) => ({ kind, holdingSide }))))(
  'the physical support hand feeds a $kind round for the $holdingSide slot from the job clock without owning gameplay',
  ({ kind, holdingSide }) => {
    const { content, model, figure } = loadPoseContent(kind);
    // A left-slot gun on a right-dominant actor distinguishes placement from role preference.
    const character = new Character(content);
    const inventory = new Inventory(content, undefined, undefined, character);
    const gun = inventory.create('load-fixture-gun');
    const bag = inventory.create('load-fixture-carrier');
    const shells = inventory.create('load-fixture-shell', 2);
    expect(inventory.add(gun, { kind: 'hand', side: holdingSide })).toBe(true);
    expect(inventory.add(bag, { kind: 'worn' })).toBe(true);
    expect(inventory.add(shells, { kind: 'pocket', owner: bag, pocket: 0 })).toBe(true);
    const queue = new HandlingQueue(inventory);
    const mechanics = new FirearmMechanics(inventory, queue, {
      blockSize: 0.5,
      pose: () => undefined,
      onEjection: () => undefined,
    });
    const probeMesh = (name: string): Mesh => {
      const mesh = new Mesh();
      mesh.name = name;
      return mesh;
    };
    const models = {
      version: 0,
      has: () => false,
      held: () => {
        const root = new Group();
        root.name = 'load-shell-probe';
        root.add(probeMesh('load-shell-probe-mesh'));
        return { root, parts: [] };
      },
      heldLook: () => {
        const root = new Group();
        root.name = 'load-gun-probe';
        root.add(probeMesh('load-gun-probe-mesh'));
        return { root, parts: [], slots: {} };
      },
    } as unknown as ModelLibrary;
    const held = new HeldItems(inventory, models, figure);
    const camera = new PerspectiveCamera();
    const supportSide = holdingSide === 'right' ? 'left' : 'right';
    const { scene } = held.warmUpTarget;
    const state = () =>
      structuredClone({
        inventory: inventory.snapshotState(),
        version: inventory.version,
        jobs: queue.jobs,
        character: character.snapshotState(),
        model,
      });
    const update = () => {
      const before = state();
      held.update(camera, undefined, 0, { firearms: mechanics.frames(), job: queue.jobs[0] });
      expect(state()).toEqual(before);
      const grip = scene.getObjectByName(`first-person-arm-${supportSide}`)?.getObjectByName('grip-anchor');
      const gunRoot = scene.getObjectByName('load-gun-probe');
      if (!(grip && gunRoot)) {
        throw new Error('Missing actual support/grip objects');
      }
      const port = gunRoot.localToWorld(new Vector3(...heldAnchorOffset(model, 'loading_port')));
      const wrist = grip.getWorldPosition(new Vector3());
      return {
        wrist,
        wristLocal: gunRoot.worldToLocal(wrist.clone()),
        port,
        gun: gunRoot.getWorldPosition(new Vector3()),
      };
    };
    try {
      const rest = update();
      expect(rest.wrist.distanceTo(rest.port)).toBeGreaterThan(0);
      expect(mechanics.load(shells, 0)).toBeUndefined();
      if (kind === 'bolt') {
        expect(queue.tick(queue.jobs[0]!.duration).failed).toEqual([]);
        expect(gun.firearm?.actionOpen).toBe(true);
      }
      const { duration } = queue.jobs[0]!;
      expect(update().wrist.distanceTo(rest.wrist)).toBeCloseTo(0);
      queue.tick(duration / 2);
      const feeding = update();
      expect(feeding.gun.distanceTo(rest.gun)).toBeCloseTo(0);
      const shell = scene.getObjectByName('load-shell-probe');
      expect(shell?.visible).toBe(true);
      expect((scene.getObjectByName('load-gun-probe-mesh') as Mesh | undefined)?.receiveShadow).toBe(true);
      expect((scene.getObjectByName('load-shell-probe-mesh') as Mesh | undefined)?.receiveShadow).toBe(true);
      const shellPosition = shell!.getWorldPosition(new Vector3());
      if (kind === 'bolt') {
        const direction = new Vector3(1, 0, 0).transformDirection(shell!.matrixWorld);
        expect(direction.dot(feeding.port.clone().sub(shellPosition).normalize())).toBeCloseTo(1);
      }
      // Reprojection cannot advance the insertion or perturb an attached support arm.
      expect(update().wrist.distanceTo(feeding.wrist)).toBeCloseTo(0);
      queue.cancel();
      expect(update().wristLocal.distanceTo(rest.wristLocal)).toBeCloseTo(0);
      expect(scene.getObjectByName('load-shell-probe')).toBeUndefined();
      expect(shells.count).toBe(2);
      expect(mechanics.load(shells, duration)).toBeUndefined();
      const samples = 50;
      let closest = Number.POSITIVE_INFINITY;
      for (let index = 1; index < samples; index++) {
        queue.tick(duration / samples);
        const pose = update();
        const round = scene.getObjectByName('load-shell-probe');
        if (round?.visible) {
          closest = Math.min(closest, round.getWorldPosition(new Vector3()).distanceTo(pose.port));
        }
        if (index === samples / 2) {
          expect(pose.wrist.distanceTo(feeding.wrist)).toBeCloseTo(0);
        }
      }
      expect(closest).toBeLessThan(rest.wrist.distanceTo(rest.port) / 10);
      expect(feeding.wrist.distanceTo(feeding.port)).toBeLessThan(rest.wrist.distanceTo(rest.port));
      expect(shellPosition.distanceTo(feeding.wrist)).toBeLessThan(shellPosition.distanceTo(rest.wrist));
      queue.tick(duration);
      expect(gun.firearm?.tube).toEqual([shells.type]);
      expect(shells.count).toBe(1);
      expect(update().wristLocal.distanceTo(rest.wristLocal)).toBeCloseTo(0);
      expect(scene.getObjectByName('load-shell-probe')).toBeUndefined();
    } finally {
      held.dispose();
    }
  },
);
