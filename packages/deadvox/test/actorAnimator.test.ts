import { readFileSync } from 'node:fs';
import {
  Box3,
  BoxGeometry,
  type Color,
  Group,
  type Intersection,
  type Material,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  type WebGLRenderer,
} from 'three';
import { expect, it, vi } from 'vitest';
import { adsCameraEye, adsLimits } from '../src/core/adsView.ts';
import { NEUTRAL_AIM } from '../src/core/aim.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { heldHoldFrame, modelToView } from '../src/core/heldPose.ts';
import { Inventory } from '../src/core/inventory.ts';
import { readyMeleePose } from '../src/core/meleePose.ts';
import { mountedOptic } from '../src/core/opticView.ts';
import { playerAdsPose } from '../src/core/playerAdsPose.ts';
import { figureStancePose, playerEyePosition, playerLookPose } from '../src/core/playerLookPose.ts';
import { makeScale } from '../src/core/scale.ts';
import { equipDebugLoadout } from '../src/debug/debugLoadout.ts';
import { LOOK_PITCH_LIMIT } from '../src/game/input.ts';
import { ARM_NODE, solveArmRig } from '../src/render/armRig.ts';
import { HeldItems } from '../src/render/hands.ts';
import { HeldPresentation } from '../src/render/heldPresentation.ts';
import { createHeldViews } from '../src/render/heldViews.ts';
import { stepMagazineRaise } from '../src/render/magazineLoadPose.ts';
import type { ModelLibrary } from '../src/render/models.ts';
import { OpticLensRenderer } from '../src/render/opticLens.ts';
import { PlayerMeshes } from '../src/render/playerFigure.ts';
import { OPTIC_BODY_LAYER, PLAYER_FIGURE_LAYER, PLAYER_SELF_MASK_LAYER } from '../src/render/shadowFlags.ts';
import { baseRegistry } from './baseRegistry.ts';
import { loadFigureModels } from './figureModels.ts';
import { heldState } from './heldState.ts';
import { createPlayerBody } from './playerFixture.ts';

vi.mock('../src/render/magazineLoadPose.ts', { spy: true });
vi.mock('../src/render/armRig.ts', { spy: true });

const fixture = async (
  firearm = true,
  firearmType?: string,
  { preview, heldLook }: { preview?: string; heldLook?: ModelLibrary['heldLook'] } = {},
) => {
  const base = baseRegistry();
  const gun = firearmType
    ? base.items.get(firearmType)
    : [...base.items.values()].find(
        (def) =>
          def.firearm &&
          base.models.get(def.model!)?.hands?.butt &&
          base.models
            .get(def.model!)
            ?.gun?.attachments?.some((attachment) =>
              [...base.models.values()].some(
                (model) => model.gun?.attachment?.id === attachment.id && model.gun.attachment.kind === 'optic',
              ),
            ),
      );
  if (!gun) {
    throw new Error('Need an optic-equipped firearm source');
  }
  const itemDef = firearm
    ? { ...gun, id: 'actor-fixture-item' }
    : {
        id: 'actor-fixture-item',
        name: 'Fixture item',
        category: 'misc' as const,
        weight: 100,
        economy: { usage: [], tiers: [] },
        workInProgress: false,
        notLoot: false,
        size: [2, 2] as [number, number],
        twoHanded: true,
      };
  const registry = { ...base, items: new Map(base.items).set(itemDef.id, itemDef) };
  const inventory = new Inventory(registry);
  if (preview && !equipDebugLoadout(inventory, true, true, preview)) {
    throw new Error('Preview loadout was not applied');
  }
  const item = preview ? inventory.hands.right : inventory.create(itemDef.id);
  if (!item) {
    throw new Error('Preview did not equip a right-hand firearm');
  }
  if (!(preview || inventory.add(item, { kind: 'hand', side: 'right' }))) {
    throw new Error('Cannot hold fixture item');
  }
  const figure = registry.figures.get('player')!;
  const models = {
    version: 0,
    ...(await loadFigureModels(registry)),
    heldLook: heldLook ?? (() => ({ root: new Group().add(new Group().add(new Group())), parts: [], slots: {} })),
    partBounds: () => undefined,
  } as unknown as ModelLibrary;
  const scale = makeScale(0.5);
  const world = new PlayerMeshes(scale.blockSize, figure, registry.models, models);
  const actor = {
    body: createPlayerBody(scale, 0, 0, 0),
    yaw: 0.3,
    pitch: -0.2,
    stepOffset: 0,
    gaitPhase: 0,
    moving: false,
    stance: 'standing' as const,
    dt: 0,
    thirdPerson: true,
    inventory,
  };
  world.sync(actor);
  const view = new HeldItems(inventory, models, figure);
  const update = createHeldViews(inventory, view, world);
  const camera = new PerspectiveCamera();
  const pose = readyMeleePose(false, figure.holds);
  const physical = () => world.group.getObjectByName('world-held-items')!;
  const transforms = (): number[][] => {
    const result: number[][] = [];
    physical().updateWorldMatrix(true, true);
    physical().traverse((object) => result.push([...object.matrixWorld.elements]));
    return result;
  };
  const dispose = () => {
    world.dispose();
    view.dispose();
  };
  return { registry, inventory, item, world, actor, view, update, camera, pose, physical, transforms, dispose };
};

it('world and first-person pistol joints consume one actor-space solve per frame', async () => {
  const jointsOf = (owner: HeldPresentation): Map<string, Vector3> =>
    new Map(
      [...owner.armRigs].flatMap(([side, rig]) =>
        (['shoulder', 'elbow', 'hand'] as const).map((joint) => {
          expect(rig[joint].scale.y).toBeLessThanOrEqual(1 + 1e-6);
          return [`${side}-${joint}`, owner.frame.worldToLocal(rig[joint].getWorldPosition(new Vector3()))] as const;
        }),
      ),
    );
  const f = await fixture(true, 'pistol_service');
  const solve = vi.mocked(solveArmRig);
  try {
    for (const aimingDownSights of [false, true]) {
      const actorJoints = new Map<string, Vector3>();
      for (const thirdPerson of [true, false]) {
        f.world.sync({ ...f.actor, thirdPerson, ads: playerAdsPose(f.inventory, aimingDownSights) });
        solve.mockClear();
        f.update(f.camera, f.pose, 0, {
          firearms: [],
          readiness: { uid: f.item.uid, progress: aimingDownSights ? 1 : 0, aimingDownSights },
        });
        expect(solve).toHaveBeenCalledTimes(2);
        const physical = (f.world as unknown as { presentation: HeldPresentation }).presentation;
        const overlay = (heldState(f.view) as { presentation: HeldPresentation }).presentation;
        expect(physical.armRigs.size).toBe(2);
        const shown = jointsOf(overlay);
        for (const [key, at] of jointsOf(physical)) {
          expect(shown.get(key)!.distanceTo(at), `${key} ADS=${aimingDownSights}`).toBeLessThan(1e-6);
          if (thirdPerson) {
            actorJoints.set(key, at);
          } else {
            expect(at.distanceTo(actorJoints.get(key)!)).toBeLessThan(1e-6);
          }
        }
      }
    }
  } finally {
    solve.mockClear();
    f.dispose();
  }
});

const isDrawn = (object: Object3D): boolean => {
  for (let node: Object3D | null = object; node; node = node.parent) {
    if (!node.visible) {
      return false;
    }
  }
  return true;
};

const bodySurfaceSample = (hit: Intersection, camera: PerspectiveCamera) => {
  if (!(hit.object instanceof Mesh && isDrawn(hit.object))) {
    return;
  }
  const mesh = hit.object;
  const material: Material = Array.isArray(mesh.material) ? mesh.material[hit.face!.materialIndex] : mesh.material;
  const originalPlanes = material.clippingPlanes;
  const renderer = { localClippingEnabled: true } as WebGLRenderer;
  const scene = new Scene();
  const group = new Group();
  mesh.onBeforeRender(renderer, scene, camera, mesh.geometry, material, group);
  const externalUnchanged =
    !camera.layers.isEnabled(PLAYER_SELF_MASK_LAYER) || material.clippingPlanes === originalPlanes;
  const clipped = material.clippingPlanes !== originalPlanes;
  const visible =
    material.colorWrite && (material.clippingPlanes?.every((plane) => plane.distanceToPoint(hit.point) >= 0) ?? true);
  mesh.onAfterRender(renderer, scene, camera, mesh.geometry, material, group);
  return {
    clipped,
    restored: material.clippingPlanes === originalPlanes,
    externalUnchanged,
    depths: visible ? [-camera.worldToLocal(hit.point.clone()).z] : [],
  };
};

const bodySamples = (world: Group, camera: PerspectiveCamera) => {
  const ray = new Raycaster();
  ray.layers.mask = camera.layers.mask;
  const samples: NonNullable<ReturnType<typeof bodySurfaceSample>>[] = [];
  for (const x of [-1, -0.5, 0, 0.5, 1]) {
    for (const y of [-1, -0.5, 0, 0.5, 1]) {
      ray.setFromCamera(new Vector2(x, y), camera);
      for (const hit of ray.intersectObject(world, true)) {
        const sample = bodySurfaceSample(hit, camera);
        if (sample) {
          samples.push(sample);
        }
      }
    }
  }
  return samples;
};

it.each(['rifle_hunting', 'pump_shotgun', 'rifle_assault', 'rifle_ak', 'pistol_service'])(
  'keeps visible own-body surfaces outside the ADS near plane throughout the authored walking sway envelope for %s',
  async (type) => {
    const f = await fixture(true, type);
    const figure = f.registry.figures.get('player')!;
    const model = f.registry.models.get(f.registry.items.get(f.item.type)!.model!)!;
    const amplitude = f.registry.skills.get('firearms_combat')!.combat!.firearms!.wobbleLimitRadians;
    // Walking's vertical arch, look sway and noise share one vector cap, not independently additive maxima.
    const envelope = [
      NEUTRAL_AIM,
      ...Array.from({ length: 8 }, (_, octant) => ({
        yaw: amplitude * Math.cos((octant * Math.PI) / 4),
        pitch: amplitude * Math.sin((octant * Math.PI) / 4),
      })),
    ];
    const camera = new PerspectiveCamera(75, 4 / 3, 0.05);
    camera.layers.enable(PLAYER_FIGURE_LAYER);
    let visibleSurfaces = 0;
    try {
      for (const stance of ['standing', 'crouching'] as const) {
        for (const [phase, aimFrame] of envelope.entries()) {
          const ads = { model, side: 'right' as const, aimFrame };
          const body = playerLookPose({ figure, models: f.registry.models, pitch: 0, stance, ads });
          const cameraPose = adsCameraEye({ figure, pose: body, ads, pitch: 0 });
          f.world.sync({
            ...f.actor,
            yaw: 0,
            pitch: 0,
            stance,
            stancePose: figureStancePose(figure, stance),
            ads,
            moving: true,
            gaitPhase: (phase * Math.PI) / 4,
          });
          camera.position.set(...cameraPose.eye);
          camera.updateMatrixWorld(true);
          f.update(camera, f.pose, 0, {
            firearms: [],
            readiness: { uid: f.item.uid, progress: 1, aimingDownSights: true },
            aim: aimFrame,
          });
          f.world.group.updateWorldMatrix(true, true);
          const samples = bodySamples(f.world.group, camera);
          expect(samples.every((sample) => sample.restored && sample.externalUnchanged)).toBe(true);
          const depths = samples.flatMap((sample) => sample.depths);
          visibleSurfaces += depths.length;
          expect(Math.min(...depths), `${type} ${stance} envelope ${phase}`).toBeGreaterThanOrEqual(
            Math.max(camera.near, figure.aimPose.ads.ownBodyClipMetres) - 1e-9,
          );
        }
      }
      expect(visibleSurfaces).toBeGreaterThan(0);
      camera.layers.enable(PLAYER_SELF_MASK_LAYER);
      const bounds = new Box3().setFromObject(f.world.group);
      const centre = bounds.getCenter(new Vector3());
      const distance = bounds.getSize(new Vector3()).length();
      camera.position.copy(centre).addScalar(distance);
      camera.lookAt(centre);
      camera.updateMatrixWorld(true);
      const external = bodySamples(f.world.group, camera);
      expect(external.length).toBeGreaterThan(0);
      expect(external.every((sample) => sample.restored && sample.externalUnchanged)).toBe(true);
    } finally {
      f.dispose();
    }
  },
);

it('does not apply the owner camera clip to a different world figure', async () => {
  const f = await fixture();
  try {
    f.world.setLayer(0);
    f.world.sync({ ...f.actor, ads: playerAdsPose(f.inventory, true, NEUTRAL_AIM) });
    f.update(f.camera, f.pose, 0, {
      firearms: [],
      readiness: { uid: f.item.uid, progress: 1, aimingDownSights: true },
    });
    const bounds = new Box3().setFromObject(f.world.group);
    const centre = bounds.getCenter(new Vector3());
    f.camera.position.copy(centre).addScalar(bounds.getSize(new Vector3()).length());
    f.camera.lookAt(centre);
    f.camera.updateMatrixWorld(true);
    const samples = bodySamples(f.world.group, f.camera);
    expect(samples.length).toBeGreaterThan(0);
    expect(samples.every((sample) => !sample.clipped && sample.restored)).toBe(true);
  } finally {
    f.dispose();
  }
});

it('orbit and spectator orientation cannot change world handling transforms for the same actor input', async () => {
  const f = await fixture();
  const handling = {
    firearms: [],
    readiness: { uid: f.item.uid, progress: 1, aimingDownSights: false },
    aim: { yaw: 0.07, pitch: -0.04 },
  };
  try {
    f.update(f.camera, f.pose, 0.4, { ...handling, lift: 0.01 });
    const expected = f.transforms();
    for (const [pitch, yaw] of [
      [0.6, -1.1],
      [-0.7, 2.1],
    ]) {
      f.camera.rotation.set(pitch!, yaw!, 0, 'YXZ');
      f.camera.updateMatrixWorld(true);
      f.update(f.camera, f.pose, 0.4, { ...handling, lift: 0.01 });
      expect(f.transforms()).toEqual(expected);
    }
    f.world.sync({ ...f.actor, yaw: f.actor.yaw + 0.5 });
    f.update(f.camera, f.pose, 0.4, handling);
    expect(f.transforms()).not.toEqual(expected);
  } finally {
    f.dispose();
  }
});

it('the play frame poses overlay and world held views from this frame rather than the previous view', async () => {
  const source = readFileSync(new URL('../src/game/play.ts', import.meta.url), 'utf8');
  const start = source.indexOf('const updateFrame =');
  const end = source.indexOf('const skyRoute =', start);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  const frame = source.slice(start, end);
  const calls = [...frame.matchAll(/\b(updateVisualFeedback|updateHeldItems|finishDraw)\(/g)].map((match) => match[1]!);
  expect(new Set(calls).size).toBe(3);
  expect(calls).toHaveLength(3);
  const f = await fixture();
  const heldFrame = f.view.warmUpTarget.scene.getObjectByName('held-items-view')!;
  const next = new PerspectiveCamera();
  const worldSample = new PerspectiveCamera();
  const syncHeldView = f.world.syncHeldView.bind(f.world);
  const world = vi.spyOn(f.world, 'syncHeldView').mockImplementation((...args) => {
    const physicalPose = syncHeldView(...args);
    worldSample.position.copy(f.physical().position);
    worldSample.quaternion.copy(f.physical().quaternion);
    return physicalPose;
  });
  const steps: Record<string, () => void> = {
    updateVisualFeedback: () => {
      f.camera.position.copy(next.position);
      f.camera.quaternion.copy(next.quaternion);
      f.camera.updateMatrixWorld(true);
      f.world.sync({
        ...f.actor,
        eye: [next.position.x / 0.5, next.position.y / 0.5, next.position.z / 0.5],
        yaw: next.rotation.y,
        pitch: next.rotation.x,
      });
    },
    updateHeldItems: () =>
      f.update(f.camera, f.pose, 0, {
        firearms: [],
        readiness: { uid: f.item.uid, progress: 1, aimingDownSights: true },
      }),
    finishDraw: () => {
      for (const sample of [heldFrame, f.view.warmUpTarget.camera, worldSample]) {
        expect(sample.position.distanceTo(next.position)).toBeLessThan(1e-8);
        expect(sample.quaternion.toArray()).toEqual(next.quaternion.toArray());
      }
      expect(f.view.opticLensFrame).toBeDefined();
    },
  };
  try {
    for (const [x, y, z, pitch, yaw] of [
      [1, 2, 3, 0.3, -0.7],
      [-2, 1, 4, -0.4, 1.2],
    ] as const) {
      next.position.set(x, y, z);
      next.rotation.set(pitch, yaw, 0, 'YXZ');
      for (const call of calls) {
        steps[call]!();
      }
    }
    expect(world).toHaveBeenCalledTimes(2);
  } finally {
    world.mockRestore();
    f.dispose();
  }
});

it('shares an anatomical eye, shouldered stock and connected arms throughout aim and ready levels', async () => {
  const f = await fixture(true, 'rifle_assault');
  const figure = f.registry.figures.get('player')!;
  const model = f.registry.models.get(f.registry.items.get(f.item.type)!.model!)!;
  const bodyModel = f.registry.models.get(figure.body.model)!;
  const bodyBefore = structuredClone(f.actor.body);
  expect(model.hands).toBeDefined();
  try {
    const cases = (['standing', 'crouching'] as const).flatMap((stance) =>
      [-LOOK_PITCH_LIMIT, -LOOK_PITCH_LIMIT / 2, 0, LOOK_PITCH_LIMIT / 2, LOOK_PITCH_LIMIT].flatMap((pitch) =>
        [0, 1].map((progress) => ({ stance, pitch, progress })),
      ),
    );
    const poses = cases.flatMap((entry) =>
      (entry.progress === 1 ? [false, true] : [false]).map((aimingDownSights) => ({
        ...entry,
        aimingDownSights,
      })),
    );
    for (const { stance, pitch, progress, aimingDownSights } of poses) {
      const label = `${stance} pitch ${pitch} ready ${progress} ADS ${aimingDownSights}`;
      const ads = playerAdsPose(f.inventory, aimingDownSights);
      const eye = playerEyePosition({
        feet: f.actor.body.pos,
        blockSize: 0.5,
        yaw: f.actor.yaw,
        pitch,
        stance,
        figure,
        models: f.registry.models,
        ads,
      });
      const stepOffset = 0.07;
      f.world.sync({ ...f.actor, eye, stance, pitch, stepOffset, dt: 1, ads });
      f.update(f.camera, f.pose, 0, {
        firearms: [],
        readiness: { uid: f.item.uid, progress, aimingDownSights },
      });
      const held = f.physical().getObjectByName('held-item-right')!;
      const buttOffset = modelToView(
        model,
        model.hands!.butt!.map((v, i) => v - model.grip!.at[i]!) as [number, number, number],
      );
      const butt = held.localToWorld(new Vector3(...buttOffset));
      const shoulder = new Vector3();
      f.world.shoulderPosition('right', shoulder);
      expect(butt.distanceTo(shoulder), `${label}: stock within authored shoulder bound`).toBeLessThanOrEqual(
        adsLimits(figure, model).stockShoulderMetres + 1e-12,
      );
      const head = f.world.group.getObjectByName('figure-head')!;
      const eyes = figure.body.eyes.map((name) => bodyModel.anchors![name]!);
      const eyeInHead = new Vector3(...eyes[0]!)
        .add(new Vector3(...eyes[1]!))
        .multiplyScalar(0.5)
        .sub(new Vector3(...bodyModel.anchors![figure.body.head.pivot]!));
      expect(
        head
          .localToWorld(eyeInHead)
          .distanceTo(new Vector3(...eye).multiplyScalar(0.5).add(new Vector3(0, stepOffset, 0))),
        `${label}: physical and gameplay eye`,
      ).toBeLessThan(1e-6);
      for (const side of ['right', 'left'] as const) {
        const arm = f.physical().getObjectByName(`first-person-arm-${side}`)!;
        const hand = arm.getObjectByName(ARM_NODE.hand)!.getWorldPosition(new Vector3());
        const grip = held.localToWorld(
          new Vector3(...heldHoldFrame(model, 'right', side === 'right' ? 'firing' : 'support').at),
        );
        expect(hand.distanceTo(grip), `${label} ${side}: hand on gun`).toBeLessThan(1e-6);
        const armModel = f.registry.models.get(figure.limbs[side === 'right' ? 'rightArm' : 'leftArm'].model)!;
        const foreEnd = arm
          .getObjectByName(ARM_NODE.elbow)!
          .localToWorld(
            new Vector3(...armModel.anchors![figure.armRig.hand.pivot]!).sub(
              new Vector3(...armModel.anchors![figure.armRig.fore.pivot]!),
            ),
          );
        const handWrist = arm.getObjectByName('hand-model')!.getWorldPosition(new Vector3());
        expect(foreEnd.distanceTo(handWrist), `${label} ${side}: wrist continues forearm`).toBeLessThan(1e-6);
        const foreBounds = new Box3().setFromObject(arm.getObjectByName(ARM_NODE.elbow)!);
        expect(foreBounds.distanceToPoint(handWrist), `${label} ${side}: skin reaches wrist`).toBeLessThan(0.002);
        const elbow = arm.getObjectByName(ARM_NODE.elbow)!.getWorldPosition(new Vector3());
        if (pitch === -LOOK_PITCH_LIMIT && side === 'left') {
          const armShoulder = arm.getObjectByName(ARM_NODE.shoulder)!.getWorldPosition(new Vector3());
          const forward = new Vector3(-Math.sin(f.actor.yaw), 0, -Math.cos(f.actor.yaw));
          expect(
            elbow.sub(armShoulder).dot(forward),
            `${label}: support elbow stays ahead of shoulder`,
          ).toBeGreaterThan(0);
        }
      }
    }
    expect(f.actor.body).toEqual(bodyBefore);
  } finally {
    f.dispose();
  }
});

it('both adapters consume one animation advance per actor tick', async () => {
  const f = await fixture();
  const advance = vi.mocked(stepMagazineRaise);
  advance.mockClear();
  const view = vi.spyOn(f.view, 'update');
  const world = vi.spyOn(f.world, 'syncHeldView');
  try {
    f.update(f.camera, f.pose, 0, { firearms: [], dt: 1 / 60 });
    expect(advance).toHaveBeenCalledTimes(1);
    expect(view.mock.calls[0]![3]!.magazineRaise).toBe(world.mock.calls[0]![1].magazineRaise);
    f.update(f.camera, f.pose, 0, { firearms: [], dt: 1 / 60 });
    expect(advance).toHaveBeenCalledTimes(2);
  } finally {
    advance.mockRestore();
    view.mockRestore();
    world.mockRestore();
    f.dispose();
  }
});

it('the final actor solve samples rummage output before projection and cancellation restores grips', async () => {
  const f = await fixture(false);
  f.world.sync({ ...f.actor, heldItems: { registry: f.registry, hands: f.inventory.hands } });
  const queue = new HandlingQueue(f.inventory);
  const solved: { owner: HeldPresentation; anchor: Object3D; point: Vector3; hand: Object3D }[] = [];
  const { solve } = HeldPresentation.prototype;
  const spy = vi.spyOn(HeldPresentation.prototype, 'solve').mockImplementation(function (
    this: HeldPresentation,
    side,
    shoulder,
    grip,
  ) {
    solve.call(this, side, shoulder, grip);
    solved.push({
      owner: this,
      anchor: this.gripAnchors.get(side)!,
      point: this.gripAnchors.get(side)!.getWorldPosition(new Vector3()),
      hand: this.armRigs.get(side)!.hand,
    });
  });
  try {
    f.update(f.camera, f.pose, 0, { firearms: [] });
    const rest = f.transforms();
    solved.length = 0;
    expect(queue.enqueue(f.item, { kind: 'pile', pos: [2, 0, 0] }).ok).toBe(true);
    queue.tick(queue.remaining / 2);
    f.update(f.camera, f.pose, 0, { firearms: [], job: queue.jobs[0] });
    expect(f.transforms()).not.toEqual(rest);
    expect(solved).toHaveLength(2);
    expect(solved.every(({ owner }) => owner.frame.name === 'world-held-items')).toBe(true);
    for (const { anchor, point, hand } of solved) {
      expect(anchor.getWorldPosition(new Vector3()).distanceTo(point)).toBeLessThan(1e-8);
      expect(hand.getWorldPosition(new Vector3()).distanceTo(point)).toBeLessThan(1e-8);
    }
    queue.cancel();
    f.update(f.camera, f.pose, 0, { firearms: [] });
    expect(f.transforms()).toEqual(rest);
  } finally {
    spy.mockRestore();
    f.dispose();
  }
});

it('optic ADS hides the owner-view gun and supplies its window without hiding the world gun', async () => {
  const f = await fixture();
  try {
    expect(mountedOptic(f.registry, f.item)).toBeDefined();
    const handling = { firearms: [], readiness: { uid: f.item.uid, progress: 1, aimingDownSights: true } };
    f.update(f.camera, f.pose, 0, handling);
    expect(f.view.opticLensFrame).toBeDefined();
    const viewGun = f.view.warmUpTarget.scene.getObjectByName('held-item-right')!;
    const worldGun = f.physical().getObjectByName('held-item-right')!;
    expect(viewGun.visible).toBe(false);
    expect(worldGun.visible).toBe(true);
    f.update(f.camera, f.pose, 0, { ...handling, readiness: { ...handling.readiness, aimingDownSights: false } });
    expect(f.view.opticLensFrame).toBeUndefined();
    expect(viewGun.visible).toBe(true);
    expect(worldGun.visible).toBe(true);
  } finally {
    f.dispose();
  }
});

const unityOpticTypes = (): string[] => {
  const registry = baseRegistry();
  const types = [...registry.items.values()]
    .filter((item) => {
      const attachment = item.model ? registry.models.get(item.model)?.gun?.attachment : undefined;
      if (attachment?.kind !== 'optic') {
        return false;
      }
      const range = attachment.properties.magnification;
      return range ? range.min <= 1 && range.max >= 1 : (item.opticMagnification ?? 1) === 1;
    })
    .map(({ id }) => id);
  if (types.length === 0) {
    throw new Error('Need an authored unity optic to exercise the disc');
  }
  return types;
};

it.each(unityOpticTypes())(
  '%s presents its authored unity image, and its hood leaves only own view',
  async (opticType) => {
    const geometry = new BoxGeometry();
    const opticGeometry = new BoxGeometry();
    const hoodGeometry = new BoxGeometry();
    hoodGeometry.userData.piece = 'optic-ads-housing';
    const material = new MeshBasicMaterial();
    // Both the world figure and the hidden optics animator compose the gun; the test checks the world's.
    const fitted: { slot: string; fit: Object3D }[] = [];
    const f = await fixture(true, undefined, {
      preview: `?loadout=ar&optic=${opticType}`,
      heldLook: (look) => {
        const parts = new Group().add(new Mesh(geometry, material), new Mesh(geometry, material));
        const slots = Object.fromEntries(
          look.slots.map(({ slot, model }) => {
            const frame = new Group();
            parts.add(frame);
            if (model === undefined) {
              return [slot, { frame }];
            }
            const fit = new Group().add(new Mesh(opticGeometry, material), new Mesh(hoodGeometry, material));
            frame.add(fit);
            fitted.push({ slot, fit });
            return [slot, { frame, model: fit, modelId: model }];
          }),
        );
        return { root: new Group().add(new Group().add(parts)), parts: [], slots };
      },
    });
    const scene = new Scene().add(f.world.group);
    const camera = new PerspectiveCamera();
    camera.layers.enable(PLAYER_FIGURE_LAYER);
    camera.layers.enable(OPTIC_BODY_LAYER);
    const lens = new OpticLensRenderer();
    try {
      const optic = mountedOptic(f.registry, f.item)!;
      const range = optic.model.gun!.attachment!.properties.magnification;
      const handling = {
        firearms: [],
        readiness: { uid: f.item.uid, progress: 1, aimingDownSights: true },
        ...(range && range.min < range.max
          ? { opticZoom: { uid: f.item.uid, opticUid: optic.uid, magnification: 1 } }
          : {}),
      };
      f.update(camera, f.pose, 0, handling);
      const frame = f.view.opticLensFrame;
      expect(frame?.magnification).toBe(1);
      const worldGun = f.physical().getObjectByName('held-item-right')!;
      const inWorldGun = (object: Object3D): boolean => {
        let found = false;
        object.traverseAncestors((ancestor) => {
          found ||= ancestor === worldGun;
        });
        return found;
      };
      const worldOptic = fitted.find(({ slot, fit }) => slot === optic.slot && inWorldGun(fit))!.fit;
      const opticPieces = new Set<Mesh>();
      worldOptic.traverse((object) => object instanceof Mesh && opticPieces.add(object));
      const gunPieces: Mesh[] = [];
      worldGun.traverse((object) => object instanceof Mesh && !opticPieces.has(object) && gunPieces.push(object));
      const hood = [...opticPieces].filter((piece) => piece.geometry === hoodGeometry);
      expect(hood.length).toBeGreaterThan(0);
      expect(gunPieces.length).toBeGreaterThan(0);
      for (const piece of hood) {
        expect(piece.layers.isEnabled(PLAYER_SELF_MASK_LAYER)).toBe(true);
      }
      const renders: { image: boolean; drawn: Set<Mesh> }[] = [];
      const renderer = {
        getDrawingBufferSize: (out: Vector2) => out.set(8, 8),
        getRenderTarget: () => null,
        setRenderTarget: () => undefined,
        getClearColor: (out: Color) => out.set(0),
        getClearAlpha: () => 1,
        setClearColor: () => undefined,
        render: (drawnScene: Scene, drawing: PerspectiveCamera) => {
          const drawn = new Set<Mesh>();
          drawnScene.updateMatrixWorld(true);
          drawnScene.traverseVisible((object) => {
            if (object instanceof Mesh && drawing.layers.test(object.layers)) {
              drawn.add(object);
            }
          });
          renders.push({ image: drawnScene === scene, drawn });
        },
      } as unknown as WebGLRenderer;
      lens.prepare(renderer, scene, camera, frame!);
      if (frame!.worldAtUnity) {
        const image = renders.find((entry) => entry.image)!.drawn;
        const mask = renders.find((entry) => !entry.image)?.drawn;
        for (const piece of gunPieces) {
          expect(image.has(piece)).toBe(true);
        }
        for (const piece of opticPieces) {
          expect(image.has(piece)).toBe(false);
        }
        if (frame!.magnifying) {
          expect(mask).toBeUndefined();
        } else {
          expect(new Set([...mask!].map((proxy) => proxy.geometry))).toEqual(new Set([opticGeometry]));
        }
      } else {
        expect(renders).toEqual([]);
      }
      f.update(camera, f.pose, 0, { ...handling, readiness: { ...handling.readiness, aimingDownSights: false } });
      for (const piece of opticPieces) {
        expect(piece.layers.isEnabled(PLAYER_FIGURE_LAYER)).toBe(true);
      }
    } finally {
      lens.dispose();
      f.dispose();
      geometry.dispose();
      opticGeometry.dispose();
      hoodGeometry.dispose();
      material.dispose();
    }
  },
);
