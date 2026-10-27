import { readFileSync } from 'node:fs';
import { type Object3D, PerspectiveCamera, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { expect, it } from 'vitest';
import { adsCameraEye, nearestSightEyeOffset } from '../src/core/adsView.ts';
import { NEUTRAL_AIM } from '../src/core/aim.ts';
import { heldFirearmTransform, heldHoldFrame } from '../src/core/heldPose.ts';
import type { Registry } from '../src/core/content.ts';
import { sightedFirearmModel } from '../src/core/firearmSight.ts';
import { type HandSide, Inventory } from '../src/core/inventory.ts';
import { readyMeleePose } from '../src/core/meleePose.ts';
import { playerAdsPose } from '../src/core/playerAdsPose.ts';
import { figureStancePose, playerHeldSeatFrame, playerLookPose } from '../src/core/playerLookPose.ts';
import { makeScale } from '../src/core/scale.ts';
import { firearmBoreRay } from '../src/game/firearmAim.ts';
import { LOOK_PITCH_LIMIT } from '../src/game/input.ts';
import { ARM_NODE, type ArmRig } from '../src/render/armRig.ts';
import {
  actionPartPaths,
  cloneHeldModel,
  type HeldActionPart,
  rackGrip,
  sampleActionStroke,
} from '../src/render/firearmModel.ts';
import { HeldItems } from '../src/render/hands.ts';
import type { HeldPresentation } from '../src/render/heldPresentation.ts';
import { createHeldViews } from '../src/render/heldViews.ts';
import { heldModelFrame, type ModelLibrary, prepareModel } from '../src/render/models.ts';
import { PlayerMeshes } from '../src/render/playerFigure.ts';
import { baseRegistry } from './baseRegistry.ts';
import { withDefaultAttachment } from './firearmAttachmentFixture.ts';
import { loadFigureModels } from './figureModels.ts';
import { heldState } from './heldState.ts';
import { createPlayerBody } from './playerFixture.ts';

it('authors a free two-hand pistol hold with a forward bore at hip and ADS', () => {
  const registry = baseRegistry();
  const item = registry.items.get('pistol_service')!;
  const model = registry.models.get(item.model!)!;
  expect(item.twoHanded).toBe(true);
  expect(model.hands).toBeDefined();
  expect(model.hands!.butt).toBeUndefined();
  const { holds } = registry.figures.get('player')!;
  const { loweredPitchRadians } = registry.skills.get('firearms_combat')!.combat!.firearms!;
  for (const side of ['right', 'left'] as const) {
    for (const aimingDownSights of [false, true]) {
      const pose = heldFirearmTransform({
        holds,
        model,
        side,
        leadingSide: side,
        twoHanded: true,
        progress: aimingDownSights ? 1 : 0,
        aimingDownSights,
        aimFrame: NEUTRAL_AIM,
        loweredPitchRadians,
      });
      const tolerance = model.hands!.loweredPitchRadians!;
      expect(-pose.muzzleDirection[2]).toBeGreaterThanOrEqual(Math.cos(tolerance) - 1e-6);
      expect(pose.muzzleUp[1]).toBeGreaterThan(0);
      for (const hold of ['firing', 'support'] as const) {
        expect(Math.hypot(...heldHoldFrame(model, side, hold).at)).toBeLessThan(holds.reachLeadMetres);
      }
    }
  }
});

it('brings the aimed pistol sight to the dominant eye on the dominant side of the body, for either hand', () => {
  const registry = baseRegistry();
  const figure = registry.figures.get('player')!;
  for (const handedness of ['right', 'left'] as const) {
    const inventory = new Inventory(registry, undefined, undefined, { handedness });
    if (!inventory.add(inventory.create('pistol_service'), { kind: 'hand', side: handedness })) {
      throw new Error('Could not equip the pistol');
    }
    const ads = playerAdsPose(inventory, true)!;
    const outward = handedness === 'right' ? 1 : -1;
    const off = handedness === 'right' ? 'left' : 'right';
    for (const pitch of [-LOOK_PITCH_LIMIT / 2, 0, LOOK_PITCH_LIMIT / 2]) {
      const pose = playerLookPose({ figure, models: registry.models, pitch, stance: 'standing', ads });
      const gun = heldFirearmTransform({
        holds: figure.holds,
        model: ads.model,
        side: ads.side,
        leadingSide: ads.side,
        twoHanded: true,
        progress: 1,
        aimingDownSights: true,
        aimFrame: NEUTRAL_AIM,
        lookPitchRadians: pitch,
        loweredPitchRadians: 0,
        adsEyes: pose.eyes,
      });
      // Offsets share the look's frame, so lateral x compares without the look's pitch.
      const sight = nearestSightEyeOffset(gun)!;
      const fromEye = (side: 'right' | 'left') => Math.hypot(...sight.map((v, axis) => v - pose.eyes[side][axis]!));
      expect(fromEye(handedness)).toBeLessThan(fromEye(off));
      expect((pose.eye[0] + sight[0]) * outward).toBeGreaterThan(0);
      expect(adsCameraEye({ figure, pose, ads, pitch }).eye[0] * outward).toBeGreaterThan(0);
    }
  }
});

const pistolFixture = async (
  registry: Registry = baseRegistry(),
  side: HandSide = 'right',
  gunType = 'pistol_service',
) => {
  const figure = registry.figures.get('player')!;
  const model = registry.models.get(registry.items.get('pistol_service')!.model!)!;
  const figures = await loadFigureModels(registry);
  const bytes = readFileSync(new URL(`../src/content/base/${model.file}`, import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer, '');
  const prepared = prepareModel(model, gltf.scene);
  const paths = actionPartPaths(gltf.scene, model.gun!.action, gltf.parser);
  const models = {
    version: 1,
    ...figures,
    has: (id: string) => id === model.id || figures.has(id),
    heldLook: () => ({ ...cloneHeldModel(prepared.held, paths), slots: {} }),
  } as unknown as ModelLibrary;
  const inventory = new Inventory(registry);
  const gun = inventory.create(gunType);
  if (!inventory.add(gun, { kind: 'hand', side })) {
    throw new Error('Pistol fixture could not equip its gun');
  }
  const view = new HeldItems(inventory, models, figure);
  return { registry, figure, model, models, inventory, gun, view };
};

it('keeps pistol palms attached to their held and moving slide contacts without stretching the fixed arm rig', async () => {
  const { model, gun, view } = await pistolFixture();
  try {
    for (const [progress, aimingDownSights] of [
      [0, false],
      [1, false],
      [1, true],
    ] as const) {
      view.update(new PerspectiveCamera(), undefined, 0, {
        firearms: [],
        readiness: { uid: gun.uid, progress, aimingDownSights },
      });
      const state = heldState(view) as {
        armRigs: Map<string, ArmRig>;
        gripAnchors: Map<string, Object3D>;
        heldByHand: Map<string, Object3D>;
      };
      const gunFrame = heldModelFrame(state.heldByHand.get('right')!.children[0]!);
      expect(state.armRigs.size).toBe(2);
      for (const side of ['right', 'left']) {
        const rig = state.armRigs.get(side)!;
        const anchor = state.gripAnchors.get(side)!;
        if (progress === 0) {
          const elbow = rig.elbow.getWorldPosition(new Vector3());
          const wrist = rig.elbow.localToWorld(new Vector3(0, -rig.foreLength, 0));
          expect(elbow.y, `${side} hip elbow stays below the shoulder`).toBeLessThan(
            rig.shoulder.getWorldPosition(new Vector3()).y,
          );
          expect(wrist.z, `${side} hip forearm points forward`).toBeLessThan(elbow.z);
        }
        const fingers = rig.hand.getObjectByName(ARM_NODE.knuckles)!;
        const knuckles = gunFrame.worldToLocal(fingers.getWorldPosition(new Vector3()));
        const curled = new Vector3(0, -1, 0).transformDirection(fingers.matrixWorld);
        const straight = new Vector3(0, 1, 0).transformDirection(rig.hand.matrixWorld);
        const palm = new Vector3(0, 0, 1).transformDirection(rig.hand.matrixWorld);
        expect(curled.dot(straight), `${side} fingers curl past the front strap`).toBeLessThanOrEqual(0);
        expect(curled.dot(palm), `${side} fingers turn toward the grip`).toBeGreaterThan(0);
        expect(knuckles.y, `${side} knuckles wrap the grip below the trigger guard`).toBeLessThan(model.grip!.at[1]);
        expect(
          rig.hand.getWorldPosition(new Vector3()).distanceTo(anchor.getWorldPosition(new Vector3())),
        ).toBeLessThan(1e-6);
        expect(rig.shoulder.scale.y, `${side} readiness=${progress} ADS=${aimingDownSights}`).toBeLessThanOrEqual(
          1 + 1e-6,
        );
        expect(rig.elbow.scale.y, `${side} readiness=${progress} ADS=${aimingDownSights}`).toBeLessThanOrEqual(
          1 + 1e-6,
        );
      }
    }
    const action = model.gun!.action!;
    const { hand } = action;
    for (const pullShare of [0, 0.5, 1]) {
      const elapsed = hand.unlockSimSeconds! + hand.rearwardSimSeconds * pullShare;
      view.update(new PerspectiveCamera(), undefined, 0, {
        firearms: [{ uid: gun.uid, mode: 'hand', elapsed }],
        readiness: { uid: gun.uid, progress: 0, aimingDownSights: false },
      });
      const state = heldState(view) as {
        firearmParts: Map<number, { parts: HeldActionPart[] }>;
        armRigs: Map<string, ArmRig>;
      };
      const part = state.firearmParts.get(gun.uid)!.parts.find((entry) => entry.handGrip)!;
      expect(part).toBeDefined();
      expect(part.node.position.distanceTo(part.rest.clone().addScaledVector(part.travel, pullShare))).toBeLessThan(
        1e-6,
      );
      const target = part.node.parent!.localToWorld(part.handGrip!.clone().addScaledVector(part.travel, pullShare));
      const support = state.armRigs.get('left')!;
      expect(support.hand.getWorldPosition(new Vector3()).distanceTo(target)).toBeLessThan(1e-6);
      expect(support.shoulder.scale.y).toBeLessThanOrEqual(1 + 1e-6);
      expect(support.elbow.scale.y).toBeLessThanOrEqual(1 + 1e-6);
    }
  } finally {
    view.dispose();
  }
});

it('keeps pistol grip contacts within fixed arm reach through the look bounds standing and crouching', async () => {
  const expectReachableGrip = (owner: HeldPresentation, poseLabel: string): void => {
    expect(owner.armRigs.size).toBe(2);
    for (const [side, rig] of owner.armRigs) {
      const label = `${poseLabel} ${side}`;
      const palm = rig.hand.getWorldPosition(new Vector3());
      const contact = owner.gripAnchors.get(side)!.getWorldPosition(new Vector3());
      expect(palm.distanceTo(contact), label).toBeLessThan(1e-6);
      const wrist = rig.hand.localToWorld(rig.gripFromWrist.clone().negate());
      const reach = wrist.clone().sub(rig.shoulder.getWorldPosition(new Vector3()));
      expect
        .soft(reach.length(), `${label} reach=${reach.toArray()}`)
        .toBeLessThanOrEqual(rig.upperLength + rig.foreLength + 1e-6);
      expect.soft(rig.shoulder.scale.y, label).toBeLessThanOrEqual(1 + 1e-6);
      expect.soft(rig.elbow.scale.y, label).toBeLessThanOrEqual(1 + 1e-6);
    }
  };

  const { registry, figure, model, models, inventory, gun, view } = await pistolFixture();
  const scale = makeScale(0.5);
  const world = new PlayerMeshes(scale.blockSize, figure, registry.models, models);
  const update = createHeldViews(inventory, view, world);
  const camera = new PerspectiveCamera();
  const firstUpPitch =
    (model.hands!.adsStandoffByPitch!.find((point) => point.pitchDegrees > 0)!.pitchDegrees * Math.PI) / 180;
  try {
    for (const stance of ['standing', 'crouching'] as const) {
      for (const pitch of [
        0,
        -LOOK_PITCH_LIMIT / 2,
        -LOOK_PITCH_LIMIT,
        firstUpPitch / 2,
        firstUpPitch,
        LOOK_PITCH_LIMIT / 2,
        LOOK_PITCH_LIMIT,
      ]) {
        for (const { progress, aimingDownSights } of [
          { progress: 0, aimingDownSights: false },
          { progress: 1, aimingDownSights: false },
          { progress: 1, aimingDownSights: true },
        ]) {
          world.sync({
            body: createPlayerBody(scale, 0, 0, 0),
            inventory,
            stance,
            stancePose: figureStancePose(figure, stance),
            yaw: 0,
            pitch,
            stepOffset: 0,
            gaitPhase: 0,
            moving: false,
            dt: 0,
            thirdPerson: true,
            ads: playerAdsPose(inventory, aimingDownSights),
          });
          world.eyePosition(camera.position);
          camera.rotation.set(pitch, 0, 0, 'YXZ');
          update(camera, readyMeleePose(false, figure.holds), 0, {
            firearms: [],
            readiness: { uid: gun.uid, progress, aimingDownSights },
          });
          const source = (world as unknown as { presentation: HeldPresentation }).presentation;
          const overlay = (heldState(view) as { presentation: HeldPresentation }).presentation;
          const label = `${stance} pitch=${pitch} ready=${progress} ADS=${aimingDownSights}`;
          expectReachableGrip(source, label);
          expectReachableGrip(overlay, label);
          const bodyPose = playerLookPose({
            figure,
            models: registry.models,
            pitch,
            stance,
            ads: playerAdsPose(inventory, aimingDownSights),
          });
          const bore = firearmBoreRay({
            holds: figure.holds,
            model,
            eye: [
              camera.position.x / scale.blockSize,
              camera.position.y / scale.blockSize,
              camera.position.z / scale.blockSize,
            ],
            yaw: 0,
            pitch,
            blockSize: scale.blockSize,
            side: 'right',
            leadingSide: 'right',
            twoHanded: true,
            progress,
            aimingDownSights,
            aimFrame: NEUTRAL_AIM,
            loweredPitchRadians: 0,
            stockSeat: bodyPose.stockSeats.right,
            seatFrame: playerHeldSeatFrame(bodyPose, pitch),
            adsEyes: bodyPose.eyes,
          });
          const gltfScene = source.heldByHand.get('right')!.children[0]!.children[0]!.children[0]!;
          const muzzle = gltfScene.localToWorld(new Vector3(...model.anchors!.muzzle!));
          expect(new Vector3(...bore.muzzle).multiplyScalar(scale.blockSize).distanceTo(muzzle), label).toBeLessThan(
            1e-6,
          );
        }
      }
    }
  } finally {
    view.dispose();
    world.dispose();
  }
});

it('seats the first-person optic window on the same eye as the world actor for either hand', async () => {
  for (const side of ['right', 'left'] as const) {
    const { registry: fitted } = withDefaultAttachment(baseRegistry(), 'pistol_service', 'optic_mini_reflex');
    const { registry, figure, models, inventory, gun, view } = await pistolFixture(fitted, side);
    const scale = makeScale(0.5);
    const world = new PlayerMeshes(scale.blockSize, figure, registry.models, models);
    const update = createHeldViews(inventory, view, world);
    const camera = new PerspectiveCamera();
    try {
      world.sync({
        body: createPlayerBody(scale, 0, 0, 0),
        inventory,
        stance: 'standing',
        stancePose: figureStancePose(figure, 'standing'),
        yaw: 0,
        pitch: 0,
        stepOffset: 0,
        gaitPhase: 0,
        moving: false,
        dt: 0,
        thirdPerson: true,
        ads: playerAdsPose(inventory, true),
      });
      world.eyePosition(camera.position);
      update(camera, readyMeleePose(false, figure.holds), 0, {
        firearms: [],
        readiness: { uid: gun.uid, progress: 1, aimingDownSights: true },
      });
      const input = {
        model: sightedFirearmModel(registry, gun)!,
        side,
        leadingSide: side,
        twoHanded: true,
        progress: 1,
        aimingDownSights: true,
        aimFrame: NEUTRAL_AIM,
        lookPitchRadians: 0,
        loweredPitchRadians: 0,
      };
      const source = (world as unknown as { presentation: HeldPresentation }).presentation;
      const overlay = (heldState(view) as { presentation: HeldPresentation }).presentation;
      const actorPose = source.firearmTransform(input);
      const overlayPose = overlay.firearmTransform(input);
      expect(actorPose.sightEyeOffset, side).toBeDefined();
      for (let axis = 0; axis < 3; axis++) {
        expect(overlayPose.rootOffset[axis]!, `${side} axis ${axis}`).toBeCloseTo(actorPose.rootOffset[axis]!, 9);
      }
    } finally {
      view.dispose();
      world.dispose();
    }
  }
});

it('reaches the slide before pulling it through full travel and lets go for its spring return', () => {
  const registry = baseRegistry();
  const model = registry.models.get(registry.items.get('pistol_service')!.model!)!;
  const action = model.gun!.action!;
  const cycle = action.hand;
  const reached = cycle.unlockSimSeconds!;
  expect(reached).toBeGreaterThan(0);
  expect(Object.values(action.parts).some((part) => part.handGrip)).toBe(true);
  expect(rackGrip(action, reached)).toEqual({ reach: 1, stroke: 0 });
  expect(sampleActionStroke(action, 'hand', reached)).toBe(0);
  const rear = reached + cycle.rearwardSimSeconds;
  expect(rackGrip(action, rear)).toEqual({ reach: 1, stroke: 1 });
  expect(sampleActionStroke(action, 'hand', rear)).toBeCloseTo(1);
  const returned = rear + cycle.dwellSimSeconds + cycle.forwardSimSeconds;
  expect(rackGrip(action, returned).reach).toBeCloseTo(0);
  expect(sampleActionStroke(action, 'hand', returned)).toBeCloseTo(0);
});
