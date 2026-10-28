// biome-ignore-all lint/suspicious/noMisplacedAssertion: shared arm-chain assertions are called only by tests.
import {
  Box3,
  BoxGeometry,
  DirectionalLight,
  DoubleSide,
  Euler,
  Frustum,
  Group,
  HemisphereLight,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  Scene,
  Vector3,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { NEUTRAL_AIM } from '../src/core/aim.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { Inventory } from '../src/core/inventory.ts';
import { toggleLight } from '../src/core/lights.ts';
import { meleeContactTime, meleePoseAndContact, readyMeleePose } from '../src/core/meleePose.ts';
import { insideLensAperture, opticViewSettings } from '../src/core/opticView.ts';
import { playerAdsPose } from '../src/core/playerAdsPose.ts';
import { playerLookLean } from '../src/core/playerLookPose.ts';
import type { PlayerStance } from '../src/core/playerStance.ts';
import { makeScale } from '../src/core/scale.ts';
import { FIGURE_LIMB_JOINTS, FIGURE_LIMBS, type FigureLimb } from '../src/core/schema.ts';
import { ARM_NODE, type ArmRig } from '../src/render/armRig.ts';
import { HeldItems } from '../src/render/hands.ts';
import { renderMeleePose } from '../src/render/meleePose.ts';
import type { ModelLibrary } from '../src/render/models.ts';
import { FIGURE_PIVOT, firstPersonShoulder, PlayerMeshes } from '../src/render/playerFigure.ts';
import { PLAYER_FIGURE_LAYER, PLAYER_SELF_MASK_LAYER } from '../src/render/shadowFlags.ts';
import { baseRegistry } from './baseRegistry.ts';
import { figureAnchorAt } from './figureAnchors.ts';
import { loadFigureModels } from './figureModels.ts';
import { FISTS_MELEE } from './fixtures/unarmed.ts';
import { heldState } from './heldState.ts';
import { createPlayerBody } from './playerFixture.ts';

const registry = baseRegistry();
const scale = makeScale(0.5);
const playerFigure = registry.figures.get('player')!;
const HOLD = {
  right: playerFigure.holds.oneHand,
  left: [-playerFigure.holds.oneHand[0], playerFigure.holds.oneHand[1], playerFigure.holds.oneHand[2]] as Vec3,
};
const STANDING = { stance: 'standing', dt: 0 } as const;

const figureModels = {
  version: 1,
  ...(await loadFigureModels(registry, 'player', [
    'riot_helmet',
    'baseball_cap',
    'night_vision_goggles',
    'headlamp',
    ...registry.items.get('hiking_backpack')!.figureModels!.map((entry) => entry.model),
  ])),
} as unknown as ModelLibrary;
/** The figure's models and no item model, so held items keep their stand-in shapes. */
const figureOnlyModels = {
  ...figureModels,
  held: () => undefined,
  heldLook: () => undefined,
  partBounds: () => undefined,
} as unknown as ModelLibrary;
const playerMeshes = () => new PlayerMeshes(scale.blockSize, playerFigure, registry.models, figureModels);
interface ArmInternals {
  view: Group;
  arms: Map<'left' | 'right', Group>;
  armRigs: Map<'left' | 'right', ArmRig>;
}
const worldOf = (arm: Group, node: string): Vector3 => arm.getObjectByName(node)!.getWorldPosition(new Vector3());
/** Shoulder, elbow, wrist and grip of a rigged view arm in world metres, after `updateMatrixWorld`. */
const armJoints = (arm: Group) => ({
  shoulder: worldOf(arm, ARM_NODE.shoulder),
  elbow: worldOf(arm, ARM_NODE.elbow),
  wrist: worldOf(arm, 'hand-model'),
  grip: worldOf(arm, 'grip-anchor'),
  hand: worldOf(arm, ARM_NODE.hand),
});
/** The scaled model segments meet at their joints, with the hand frame on the grip point. */
const expectConnectedArm = (arm: Group, rig: ArmRig, label: string): void => {
  const joints = armJoints(arm);
  expect(joints.elbow.distanceTo(joints.shoulder), `${label} upper length`).toBeCloseTo(
    rig.upperLength * rig.shoulder.scale.y,
    4,
  );
  expect(joints.wrist.distanceTo(joints.elbow), `${label} fore length`).toBeCloseTo(
    rig.foreLength * rig.elbow.scale.y,
    4,
  );
  expect(
    rig.shoulder.localToWorld(new Vector3(0, -rig.upperLength, 0)).distanceTo(joints.elbow),
    `${label} elbow seam`,
  ).toBeLessThan(1e-6);
  expect(
    rig.elbow.localToWorld(new Vector3(0, -rig.foreLength, 0)).distanceTo(joints.wrist),
    `${label} wrist seam`,
  ).toBeLessThan(1e-6);
  expect(joints.hand.distanceTo(joints.grip), `${label} hand on grip`).toBeLessThan(1e-6);
  expect(joints.grip.distanceTo(joints.wrist), `${label} grip from wrist`).toBeCloseTo(rig.gripFromWrist.length(), 4);
};
const drawnPart = (meshes: PlayerMeshes, name: 'body' | FigureLimb) => meshes.group.getObjectByName(`figure-${name}`)!;
const drawnHead = (meshes: PlayerMeshes): Object3D =>
  drawnPart(meshes, 'body')
    .getObjectByName(FIGURE_PIVOT.head)!
    .children.find((object) => object.userData.part === playerFigure.body.head.part)!;
const wearOnFigure = (type: string): PlayerMeshes => {
  const inventory = new Inventory(registry);
  expect(inventory.add(inventory.create(type), { kind: 'worn' })).toBe(true);
  const meshes = playerMeshes();
  meshes.sync({
    body: createPlayerBody(scale, 4, 1, 4),
    yaw: 0,
    stepOffset: 0,
    gaitPhase: 0,
    moving: false,
    ...STANDING,
    thirdPerson: true,
    inventory,
  });
  meshes.group.updateMatrixWorld(true);
  expect(drawnHead(meshes)).toBeDefined();
  return meshes;
};
const expectSnugStrap = (head: Object3D, at: (name: string) => Vector3): Raycaster => {
  head.traverse((object) => {
    if (object instanceof Mesh) {
      object.material = new MeshBasicMaterial({ side: DoubleSide });
    }
  });
  const ray = new Raycaster();
  ray.layers.enableAll();
  for (const side of ['left', 'right', 'front', 'back']) {
    const inner = at(`strap_${side}_inner`);
    const outer = at(`strap_${side}_outer`);
    ray.set(inner, inner.clone().sub(outer).normalize());
    const hits = ray.intersectObject(head, true);
    expect(hits.length, `${side} strap faces the head`).toBeGreaterThan(0);
    expect(hits[0]!.distance, `${side} strap close to head`).toBeLessThanOrEqual(inner.distanceTo(outer) + 1e-6);
  }
  return ray;
};
/** Each drawn vertex in world space, for the parts `visible` passes. */
const drawnVertices = (meshes: PlayerMeshes): { part: string; at: Vector3 }[] => {
  meshes.group.updateMatrixWorld(true);
  return meshes.group.children
    .filter((part) => part.visible)
    .flatMap((part) => {
      const vertices: { part: string; at: Vector3 }[] = [];
      part.traverse((object) => {
        const position = object instanceof Mesh ? object.geometry.getAttribute('position') : undefined;
        for (let index = 0; index < (position?.count ?? 0); index++) {
          vertices.push({
            part: part.name,
            at: new Vector3().fromBufferAttribute(position!, index).applyMatrix4(object.matrixWorld),
          });
        }
      });
      return vertices;
    });
};
const anchorAt = (meshes: PlayerMeshes, name: 'body' | FigureLimb, model: string, anchor: string): Vector3 =>
  figureAnchorAt({ group: meshes.group, registry, figure: playerFigure, name, model, anchor });

/**
 * A crouched leg bends at the knee with its foot flat on the ground behind the knee; returns the hip. Yaw 0 faces -z,
 * so how far a point stands ahead of another is the drop in z.
 */
const expectCrouchedLeg = (meshes: PlayerMeshes, leg: 'leftLeg' | 'rightLeg', ground: number, label: string) => {
  const { model, joint } = playerFigure.limbs[leg];
  const hip = anchorAt(meshes, leg, model, joint);
  const drawn = drawnPart(meshes, leg);
  const knee = drawn.getObjectByName(FIGURE_PIVOT.shin)!.getWorldPosition(new Vector3());
  const foot = drawn.getObjectByName(FIGURE_PIVOT.foot)!;
  const ankle = foot.getWorldPosition(new Vector3());
  expect(knee.y, `${label} knee below hip`).toBeLessThan(hip.y);
  expect(ankle.y, `${label} ankle below knee`).toBeLessThan(knee.y);
  expect(hip.z - knee.z, `${label} knee ahead of ankle`).toBeGreaterThan(hip.z - ankle.z);
  const sole = new Box3().setFromObject(foot, true);
  expect(sole.min.y, `${label} sole on the ground`).toBeCloseTo(ground, 2);
  const resting = new Box3();
  foot.traverse((object) => {
    const position = object instanceof Mesh ? object.geometry.getAttribute('position') : undefined;
    for (let index = 0; index < (position?.count ?? 0); index++) {
      const at = new Vector3().fromBufferAttribute(position!, index).applyMatrix4(object.matrixWorld);
      if (at.y < ground + 0.01) {
        resting.expandByPoint(at);
      }
    }
  });
  // A flat sole rests along most of the shoe's length, not on a toe or heel edge.
  expect(resting.max.z - resting.min.z, `${label} sole flat`).toBeGreaterThan((sole.max.z - sole.min.z) * 0.8);
  return hip;
};

/**
 * A crouched arm holds a guard: the forearm rises from the elbow to the hand, and the hand stands in front of the
 * leaning torso, ahead of its shoulder and of the neck. Yaw 0 faces -z.
 */
const expectGuardArm = (meshes: PlayerMeshes, arm: 'leftArm' | 'rightArm', neck: Vector3, label: string) => {
  const { model, joint } = playerFigure.limbs[arm];
  const shoulder = anchorAt(meshes, arm, model, joint);
  const drawn = drawnPart(meshes, arm);
  const elbow = drawn.getObjectByName(FIGURE_PIVOT.elbow)!.getWorldPosition(new Vector3());
  const hand = drawn.getObjectByName(FIGURE_PIVOT.wrist)!.getWorldPosition(new Vector3());
  expect(hand.y, `${label} hand above elbow`).toBeGreaterThan(elbow.y);
  expect(hand.z, `${label} hand ahead of shoulder`).toBeLessThan(shoulder.z);
  expect(hand.z, `${label} hand ahead of the neck`).toBeLessThan(neck.z);
};

const fallbackLightHands = [...registry.items.values()]
  .filter((definition) => definition.light && !definition.model)
  .flatMap((definition) => (['right', 'left'] as const).map((side) => ({ id: definition.id, definition, side })));

describe('held light presentation', () => {
  it('receives the world sun map in the camera’s world position', () => {
    const sourceSun = new DirectionalLight();
    sourceSun.castShadow = true;
    const held = new HeldItems(new Inventory(registry), figureModels, playerFigure, sourceSun);
    const camera = new PerspectiveCamera();
    camera.position.set(12, 3, -7);
    held.update(camera);

    const { scene, camera: handCamera } = held.warmUpTarget;
    const handSun = scene.children.find((child) => child instanceof DirectionalLight);
    const handView = scene.getObjectByName('held-items-view')!;
    const arm = scene.getObjectByName('first-person-arm-right')!;
    const receivers: Mesh[] = [];
    arm.traverse((child) => {
      if (child instanceof Mesh) {
        receivers.push(child);
      }
    });
    expect(handSun?.castShadow).toBe(true);
    expect((handSun as DirectionalLight | undefined)?.shadow).toBe(sourceSun.shadow);
    expect(receivers.length).toBeGreaterThan(0);
    expect(receivers.every((receiver) => receiver.receiveShadow && !receiver.castShadow)).toBe(true);
    expect(handView.position).toEqual(camera.position);
    expect(handCamera.position).toEqual(camera.position);
    held.dispose();
  });

  it('scales held hemisphere ambient by the camera sky visibility', () => {
    const camera = new PerspectiveCamera();
    const sky = {
      scene: new Scene(),
      light: new DirectionalLight(),
      ambient: new HemisphereLight(),
      camera,
      radiusM: 1,
      farPlaneScale: 1,
    };
    const worldAmbientIntensity = sky.ambient.intensity;
    const held = new HeldItems(new Inventory(registry), undefined, playerFigure);
    held.update(camera);
    const handAmbient = held.warmUpTarget.scene.children.find((child) => child instanceof HemisphereLight)!;
    const renderer = {
      autoClear: true,
      clearDepth: () => undefined,
      render: () => undefined,
    } as unknown as Parameters<typeof held.render>[0];

    held.setSkyVisibility(0);
    held.render(renderer, camera, sky);
    expect(handAmbient.intensity).toBe(0);

    held.setSkyVisibility(1);
    held.render(renderer, camera, sky);
    expect(handAmbient.intensity).toBe(worldAmbientIntensity);
    held.dispose();
  });

  it('depth-tests carried adapter geometry against world surfaces with the main camera projection', () => {
    const held = new HeldItems(new Inventory(registry), undefined, playerFigure);
    const main = new PerspectiveCamera(75, 16 / 9, 0.05, 80);
    const carried = new Mesh(new BoxGeometry(0.2, 0.2, 0.2));
    carried.position.set(0, 0, -1);
    held.attach(carried);
    held.update(main);
    let renders = 0;
    const clearDepth = vi.fn();
    const renderer = {
      autoClear: true,
      clearDepth,
      render: (scene: Scene, camera: PerspectiveCamera) => {
        expect(renderer.autoClear).toBe(false);
        let drawn = false;
        scene.traverseVisible((object) => {
          drawn ||= object === carried;
        });
        if (!drawn) {
          return;
        }
        renders += 1;
        scene.updateMatrixWorld(true);
        camera.updateMatrixWorld(true);
        const at = carried.getWorldPosition(new Vector3());
        const depth = at.clone().project(camera).z;
        const behind = new Vector3(0, 0, -3).project(main).z;
        const ahead = new Vector3(0, 0, -0.5).project(main).z;
        expect(depth, 'a wall behind the piece must not hide it').toBeLessThan(behind);
        expect(depth, 'a wall ahead of the piece must hide it').toBeGreaterThan(ahead);
        expect(depth).toBeCloseTo(at.clone().project(main).z, 10);
      },
    } as unknown as Parameters<typeof held.render>[0];
    const sky = {
      scene: new Scene(),
      light: new DirectionalLight(),
      ambient: new HemisphereLight(),
      camera: main,
      radiusM: 1,
      farPlaneScale: 1,
    };
    held.render(renderer, main, sky);
    main.near = 0.2;
    main.far = 40;
    main.updateProjectionMatrix();
    held.render(renderer, main, sky);
    expect(renders).toBe(2);
    expect(clearDepth).not.toHaveBeenCalled();
    expect(renderer.autoClear).toBe(true);
    held.dispose();
    carried.geometry.dispose();
    (carried.material as MeshStandardMaterial).dispose();
  });

  it('never redraws physical arms or items or clears world depth in the retained optical adapter', () => {
    const inventory = new Inventory(registry);
    inventory.add(inventory.create('kitchen_knife'), { kind: 'hand', side: 'right' });
    const held = new HeldItems(inventory, figureModels, playerFigure);
    const camera = new PerspectiveCamera();
    held.update(camera);
    const { scene } = held.warmUpTarget;
    expect(scene.getObjectByName('held-item-right')).toBeDefined();
    expect(scene.getObjectByName('first-person-arm-right')).toBeDefined();
    let renders = 0;
    const renderer = {
      autoClear: true,
      clearDepth: () => {
        throw new Error('Optical adapter cleared world depth');
      },
      render: () => {
        renders += 1;
        scene.traverseVisible((object) => {
          expect(object.name.startsWith('first-person-arm-') || object.name.startsWith('held-item-')).toBe(false);
        });
      },
    } as unknown as Parameters<typeof held.render>[0];
    held.render(renderer, camera, {
      scene: new Scene(),
      light: new DirectionalLight(),
      ambient: new HemisphereLight(),
      camera,
      radiusM: 1,
      farPlaneScale: 1,
    });
    expect(renders).toBe(1);
    expect(renderer.autoClear).toBe(true);
    held.dispose();
  });

  it.each(fallbackLightHands)('$id in the $side hand draws by its light definition', ({ id, definition, side }) => {
    const inventory = new Inventory(registry);
    const light = inventory.create(id);
    expect(toggleLight(registry, light, 0)).toBeUndefined();
    expect(inventory.add(light, { kind: 'hand', side })).toBe(true);
    const held = new HeldItems(inventory, undefined, playerFigure);
    held.update(new PerspectiveCamera());
    const { shown } = heldState(held) as { shown: Map<number, Group> };
    let visibleBody = false;
    let flame = false;
    shown.get(light.uid)?.traverse((object) => {
      if (!(object instanceof Mesh)) {
        return;
      }
      visibleBody ||=
        object.name === 'held-light-body' &&
        object.visible &&
        object.material instanceof MeshBasicMaterial &&
        !object.material.toneMapped;
      flame ||= object.name === 'held-light-flame' && object.visible && object.material instanceof MeshBasicMaterial;
    });
    expect(visibleBody, `${id} in ${side} hand`).toBe(true);
    expect(flame, `${id} in ${side} hand`).toBe(definition.light!.burning?.ignition === 'firestarter');
    held.dispose();
  });

  it.each([
    { state: 'off', on: false },
    { state: 'on', on: true },
  ])('shows a modeled glowstick $state on its tube in hand', ({ on }) => {
    const inventory = new Inventory(registry);
    const glowstick = inventory.create('glowstick');
    if (on) {
      expect(toggleLight(registry, glowstick, 0)).toBeUndefined();
    }
    expect(inventory.add(glowstick, { kind: 'hand', side: 'right' })).toBe(true);
    const geometry = new BoxGeometry(1, 0.1, 0.1);
    const tubeMaterial = new MeshStandardMaterial({ color: '#62ff81' });
    tubeMaterial.name = 'chemical-light tube';
    const modelRoot = new Group();
    modelRoot.add(new Mesh(geometry, tubeMaterial));
    const models = {
      version: 0,
      has: () => false,
      heldLook: () => ({ root: modelRoot.clone(), parts: [], slots: {} }),
    } as unknown as import('../src/render/models.ts').ModelLibrary;
    const held = new HeldItems(inventory, models, playerFigure);
    held.update(new PerspectiveCamera());
    const { shown } = heldState(held) as { shown: Map<number, Group> };
    let tube: Mesh | undefined;
    shown.get(glowstick.uid)?.traverse((object) => {
      if (object instanceof Mesh && object.material instanceof MeshStandardMaterial) {
        tube = object;
      }
    });

    expect(tube?.visible).toBe(true);
    const material = tube!.material as MeshStandardMaterial;
    if (on) {
      expect(material.emissive.getHexString()).not.toBe('000000');
      expect(material.emissiveIntensity).toBe(registry.items.get('glowstick')!.light!.emissive);
      expect(material.toneMapped).toBe(false);
    } else {
      expect(material.emissive.getHexString()).toBe('000000');
    }
    held.dispose();
    geometry.dispose();
    tubeMaterial.dispose();
  });
});

describe('optic lens presentation', () => {
  it('carries the mounted optic export into the ADS lens frame', () => {
    const inventory = new Inventory(registry);
    const firearm = inventory.create('rifle_assault');
    if (!inventory.add(firearm, { kind: 'hand', side: 'right' })) {
      throw new Error('Fixture firearm could not be held');
    }
    const optic = Object.values(firearm.slots ?? {}).find((item) => {
      const definition = registry.items.get(item.type);
      const model = definition?.model === undefined ? undefined : registry.models.get(definition.model);
      return model?.gun?.attachment?.kind === 'optic';
    });
    if (!optic) {
      throw new Error('Fixture firearm needs a mounted optic');
    }
    const definition = registry.items.get(optic.type)!;
    const model = registry.models.get(definition.model!)!;
    const expected = opticViewSettings(definition, model);
    if (!expected) {
      throw new Error('Fixture optic needs a supported view');
    }
    const held = new HeldItems(inventory, undefined, playerFigure);
    const camera = new PerspectiveCamera(75, 16 / 9, 0.05, 128);
    const handling = { firearms: [], readiness: { uid: firearm.uid, progress: 1, aimingDownSights: true } } as const;
    held.update(camera, undefined, 0, handling);
    const settled = held.opticLensFrame;
    held.update(camera, undefined, 0.5, handling);
    const recoiling = held.opticLensFrame;

    expect(settled).toMatchObject(expected);
    expect(settled?.radius.every((radius) => radius > 0)).toBe(true);
    expect(insideLensAperture(settled!.reticleCenter, settled!, settled!.aperture)).toBe(true);
    expect(recoiling?.center).not.toEqual(settled?.center);
    held.dispose();
  });
});

describe('player figure', () => {
  it('keeps all actor transforms observer-independent through stance lean and dynamic held posing', () => {
    const body = createPlayerBody(scale, 4, 1, 4);
    const inventory = new Inventory(registry);
    inventory.add(inventory.create('baseball_bat'), { kind: 'hand', side: 'right' });
    const meshes = playerMeshes();
    for (const stance of ['standing', 'crouching', 'prone'] as const) {
      const pose = {
        body,
        yaw: 0.4,
        pitch: -0.6,
        stepOffset: 0.02,
        gaitPhase: 0.7,
        moving: true,
        stance,
        dt: 1,
        inventory,
      };
      const snapshot = (thirdPerson: boolean) => {
        meshes.sync({ ...pose, thirdPerson });
        meshes.syncHeldView(readyMeleePose(true, playerFigure.holds), { firearms: [] });
        meshes.group.updateMatrixWorld(true);
        const transforms: number[][] = [];
        meshes.group.traverse((object) => transforms.push(object.matrixWorld.toArray()));
        return transforms;
      };
      expect(snapshot(false), stance).toEqual(snapshot(true));
    }
  });

  it('retains the steep-look-down hip lean without folding an already prone body through the ground', () => {
    const onset = (playerFigure.lookDownLean.startPitchDegrees * Math.PI) / 180;
    expect(playerLookLean(playerFigure, 0, 'standing')).toBe(0);
    expect(playerLookLean(playerFigure, -onset, 'standing')).toBe(0);
    const midway = playerLookLean(playerFigure, -(onset + Math.PI / 2) / 2, 'standing');
    expect(midway).toBeGreaterThan(0);
    expect(playerLookLean(playerFigure, -Math.PI / 2, 'standing')).toBeGreaterThan(midway);
    expect(playerLookLean(playerFigure, -Math.PI / 2, 'prone')).toBe(0);
  });

  it('keeps a bare foot visible past the torso at -60 and -80 degrees', () => {
    const body = createPlayerBody(scale, 4, 1, 4);
    const meshes = playerMeshes();
    const eye = new Vector3();
    const inventory = new Inventory(registry);
    for (const pitch of [-Math.PI / 3, (-80 * Math.PI) / 180]) {
      meshes.sync({ body, yaw: 0, pitch, stepOffset: 0, gaitPhase: 0, moving: false, ...STANDING, inventory });
      meshes.eyePosition(eye);
      const camera = new PerspectiveCamera(75, 16 / 9, 0.05, 128);
      camera.rotation.order = 'YXZ';
      camera.position.copy(eye);
      camera.rotation.set(pitch, 0, 0);
      camera.updateMatrixWorld(true);
      const frustum = new Frustum().setFromProjectionMatrix(
        new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
      );
      // Yaw 0 faces -z, so each shoe's toe is its leg's foremost vertex.
      const toes = drawnVertices(meshes)
        .filter(({ part }) => part === 'figure-leftLeg' || part === 'figure-rightLeg')
        .sort((a, b) => a.at.z - b.at.z)
        .slice(0, 8)
        .map(({ at }) => at);
      const seen = toes.some((toe) => {
        const direction = toe.clone().sub(eye);
        const ray = new Raycaster(eye, direction.clone().normalize(), 0, direction.length() - 0.01);
        return frustum.containsPoint(toe) && ray.intersectObject(drawnPart(meshes, 'body'), true).length === 0;
      });
      expect(seen, `a toe is visible at ${((pitch * 180) / Math.PI).toFixed(0)} degrees`).toBe(true);
    }
  });

  it('keeps body placement and idle arms identical when only the observer changes', () => {
    const body = createPlayerBody(scale, 4, 1, 4);
    const meshes = playerMeshes();
    const bodyZ = (thirdPerson: boolean) => {
      meshes.sync({ body, yaw: 0, stepOffset: 0, gaitPhase: 0, moving: false, ...STANDING, thirdPerson });
      return drawnPart(meshes, 'body').position.z;
    };
    const firstPerson = bodyZ(false);
    expect(meshes.loaded).toBe(true);
    for (const name of ['body', ...FIGURE_LIMBS] as const) {
      expect(drawnPart(meshes, name).visible, `${name} in first person`).toBe(true);
    }
    expect(firstPerson).toBeCloseTo(bodyZ(true));
    for (const name of ['body', ...FIGURE_LIMBS] as const) {
      expect(drawnPart(meshes, name).visible, `${name} in third person`).toBe(true);
    }
  });

  it('masks the own head and every eyes-slot surface without removing external colour or shadows', () => {
    const meshes = wearOnFigure('night_vision_goggles');
    const own = new PerspectiveCamera();
    own.layers.enable(PLAYER_FIGURE_LAYER);
    const external = new PerspectiveCamera();
    external.layers.enable(PLAYER_FIGURE_LAYER);
    external.layers.enable(PLAYER_SELF_MASK_LAYER);
    for (const root of [drawnHead(meshes), meshes.group.getObjectByName('worn-eyes')!]) {
      let count = 0;
      root.traverse((object) => {
        if (object instanceof Mesh) {
          count += 1;
          expect(object.visible).toBe(true);
          expect(own.layers.test(object.layers)).toBe(false);
          expect(external.layers.test(object.layers)).toBe(true);
          expect(object.castShadow).toBe(true);
        }
      });
      expect(count).toBeGreaterThan(0);
    }
  });

  it('masks authored ADS body roles and their worn gear only for the owner, and restores them on release', () => {
    const figure = {
      ...playerFigure,
      aimPose: { ...playerFigure.aimPose, ads: { ...playerFigure.aimPose.ads, ownBodyHide: ['spine' as const] } },
    };
    const inventory = new Inventory(registry);
    expect(inventory.add(inventory.create('hiking_backpack'), { kind: 'worn' })).toBe(true);
    expect(inventory.add(inventory.create('rifle_hunting'), { kind: 'hand', side: 'right' })).toBe(true);
    const meshes = new PlayerMeshes(scale.blockSize, figure, registry.models, figureModels);
    const own = new PerspectiveCamera();
    own.layers.enable(PLAYER_FIGURE_LAYER);
    const external = new PerspectiveCamera();
    external.layers.enable(PLAYER_FIGURE_LAYER);
    external.layers.enable(PLAYER_SELF_MASK_LAYER);
    for (const aiming of [false, true, false]) {
      meshes.sync({
        body: createPlayerBody(scale, 0, 0, 0),
        yaw: 0,
        stepOffset: 0,
        gaitPhase: 0,
        moving: false,
        ...STANDING,
        inventory,
        holdReady: aiming,
        ads: playerAdsPose(inventory, aiming, NEUTRAL_AIM),
      });
      let torso: Object3D | undefined;
      drawnPart(meshes, 'body').traverse((node) => {
        if (node.userData.part === figure.body.spine.part) {
          torso = node;
        }
      });
      const pack = meshes.group.getObjectByName('worn-back');
      expect(torso).toBeDefined();
      expect(pack).toBeDefined();
      for (const root of [torso!, pack!]) {
        let surfaces = 0;
        root.traverse((object) => {
          if (!(object instanceof Mesh)) {
            return;
          }
          surfaces += 1;
          expect(object.visible).toBe(true);
          expect(own.layers.test(object.layers)).toBe(!aiming);
          expect(external.layers.test(object.layers)).toBe(true);
          expect(object.castShadow).toBe(true);
        });
        expect(surfaces).toBeGreaterThan(0);
      }
    }
    meshes.dispose();
  });

  // Flesh may sink or hover by a hand's breadth at most; a decimetre or two of air under the legs is the defect.
  const restMetres = 0.12;
  const proneScene = (item: string | undefined, ads: boolean) => {
    const inventory = new Inventory(registry);
    if (item) {
      expect(inventory.add(inventory.create(item), { kind: 'hand', side: 'right' })).toBe(true);
    }
    const meshes = playerMeshes();
    const body = createPlayerBody(scale, 4, 1, 4);
    meshes.sync({
      body,
      yaw: 0,
      stepOffset: 0,
      gaitPhase: 0,
      moving: false,
      stance: 'prone',
      dt: 10,
      thirdPerson: true,
      inventory,
      holdReady: ads,
      ads: playerAdsPose(inventory, ads, NEUTRAL_AIM),
    });
    meshes.group.updateMatrixWorld(true);
    return { meshes, ground: body.pos[1] * scale.blockSize };
  };

  it.each([
    ['empty hands', undefined, false],
    ['a one-hand gun', 'revolver_357', false],
    ['a long gun at the hip', 'rifle_assault', false],
    ['a long gun aimed down sights', 'rifle_assault', true],
  ] as const)('rests the prone body on the ground with %s', (_label, item, ads) => {
    const { meshes, ground } = proneScene(item, ads);
    const parts = (['body', 'leftLeg', 'rightLeg'] as const).map((name) =>
      new Box3().setFromObject(drawnPart(meshes, name), true),
    );
    // The torso's pivot sits above its underside, so it rests a hand's breadth up; the legs touch.
    const [torso, ...legs] = parts;
    expect(torso!.min.y - ground).toBeLessThanOrEqual(restMetres);
    expect(Math.min(...legs.map((box) => box.min.y)) - ground).toBeLessThanOrEqual(restMetres / 2);
    const lowest = Math.min(...parts.map((box) => box.min.y)) - ground;
    expect(lowest).toBeGreaterThanOrEqual(-restMetres);
    meshes.dispose();
  });

  it('props the prone ADS trigger elbow on the ground and the support elbow below its shoulder', () => {
    const { meshes, ground } = proneScene('rifle_assault', true);
    const chestTop = new Box3().setFromObject(drawnPart(meshes, 'body'), true).max.y - ground;
    // The gun is in the right hand: the right arm is the trigger arm, the left the support arm.
    for (const [side, role] of [
      ['right', 'trigger'],
      ['left', 'support'],
    ] as const) {
      const arm = meshes.group.getObjectByName(`first-person-arm-${side}`)!;
      const elbow = arm.getObjectByName(ARM_NODE.elbow)!.getWorldPosition(new Vector3()).y - ground;
      const shoulder = arm.getObjectByName(ARM_NODE.shoulder)!.getWorldPosition(new Vector3()).y - ground;
      expect(elbow, `${role} elbow`).toBeGreaterThanOrEqual(-restMetres);
      expect(elbow, `${role} elbow`).toBeLessThan(chestTop);
      // An elbow that carries the chest hangs below its shoulder; a stretched arm lies level with it.
      expect(elbow, `${role} elbow below shoulder`).toBeLessThan(shoulder);
      if (role === 'trigger') {
        expect(elbow, 'trigger elbow rests').toBeLessThanOrEqual(restMetres * 1.5);
      }
    }
    meshes.dispose();
  });

  it('reaches the arms and hands forward of the shoulders when prone and empty handed', () => {
    const { meshes } = proneScene(undefined, false);
    for (const limb of ['rightArm', 'leftArm'] as const) {
      const { model, joint } = playerFigure.limbs[limb];
      const shoulder = anchorAt(meshes, limb, model, joint);
      const arm = new Box3().setFromObject(drawnPart(meshes, limb), true);
      // Yaw 0 faces -z, so ahead is lower z.
      const ahead = shoulder.z - arm.min.z;
      const behind = arm.max.z - shoulder.z;
      expect(ahead, limb).toBeGreaterThan(behind);
    }
    meshes.dispose();
  });

  it.each([
    ['empty hands', undefined, false],
    ['a long gun aimed down sights', 'rifle_assault', true],
  ] as const)('keeps both prone feet on the ground with %s', (_label, item, ads) => {
    const { meshes, ground } = proneScene(item, ads);
    for (const leg of ['leftLeg', 'rightLeg'] as const) {
      const foot = new Box3().setFromObject(drawnPart(meshes, leg).getObjectByName(FIGURE_PIVOT.foot)!, true);
      expect(foot.min.y - ground, `${leg} foot`).toBeLessThanOrEqual(restMetres / 2);
      expect(foot.min.y - ground, `${leg} foot`).toBeGreaterThanOrEqual(-restMetres);
    }
    meshes.dispose();
  });

  it('fits the worn riot helmet over the drawn head: it covers the crown and sides and nothing of it lies inside', () => {
    const meshes = wearOnFigure('riot_helmet');
    const head = drawnHead(meshes);
    const helmet = meshes.group.getObjectByName('worn-head')!;
    expect(helmet.visible).toBe(true);
    const headBounds = new Box3().setFromObject(head, true);
    const helmetBounds = new Box3().setFromObject(helmet, true);
    for (const axis of ['x', 'z'] as const) {
      expect(helmetBounds.min[axis], `helmet reaches past the head at -${axis}`).toBeLessThan(headBounds.min[axis]);
      expect(helmetBounds.max[axis], `helmet reaches past the head at +${axis}`).toBeGreaterThan(headBounds.max[axis]);
    }
    expect(helmetBounds.max.y, 'helmet stands above the crown').toBeGreaterThan(headBounds.max.y);
    // The head's voxel surfaces are closed with no faces between its materials, so a ray's crossings tell inside.
    head.traverse((object) => {
      if (object instanceof Mesh) {
        object.material = new MeshBasicMaterial({ side: DoubleSide });
      }
    });
    const ray = new Raycaster();
    // The figure draws on its own layer.
    ray.layers.enableAll();
    // Both models' voxel faces lie on shared planes, so an axis ray would run along them; this one crosses them.
    const across = new Vector3(1, 0.31, 0.17).normalize();
    ray.set(headBounds.getCenter(new Vector3()), across);
    expect(ray.intersectObject(head, true).length % 2, 'the head centre reads as inside').toBe(1);
    const inside: Vector3[] = [];
    helmet.traverse((object) => {
      const position = object instanceof Mesh ? object.geometry.getAttribute('position') : undefined;
      for (let index = 0; index < (position?.count ?? 0); index++) {
        const at = new Vector3().fromBufferAttribute(position!, index).applyMatrix4(object.matrixWorld);
        ray.set(at, across);
        if (ray.intersectObject(head, true).length % 2 === 1) {
          inside.push(at);
        }
      }
    });
    expect(inside, 'helmet points inside the head').toEqual([]);
  });

  it('covers the head crown with the cap rather than letting its corners break through', () => {
    const meshes = wearOnFigure('baseball_cap');
    const head = drawnHead(meshes);
    const cap = meshes.group.getObjectByName('worn-head')!;
    cap.traverse((object) => {
      if (object instanceof Mesh) {
        object.material = new MeshBasicMaterial({ side: DoubleSide });
      }
    });
    const top = new Box3().setFromObject(head, true).max.y;
    const ray = new Raycaster();
    ray.layers.enableAll();
    const across = new Vector3(1, 0.31, 0.17).normalize();
    let crownPoints = 0;
    head.traverse((object) => {
      const position = object instanceof Mesh ? object.geometry.getAttribute('position') : undefined;
      for (let index = 0; index < (position?.count ?? 0); index++) {
        const point = new Vector3().fromBufferAttribute(position!, index).applyMatrix4(object.matrixWorld);
        if (Math.abs(point.y - top) < 1e-6) {
          crownPoints += 1;
          ray.set(point, across);
          expect(ray.intersectObject(cap, true).length % 2, 'crown point enclosed by cap').toBe(1);
        }
      }
    });
    expect(crownPoints).toBeGreaterThan(0);
  });

  it('fits goggles over both eyes with a strap no farther from the head than its own thickness', () => {
    const meshes = wearOnFigure('night_vision_goggles');
    const head = drawnHead(meshes);
    const model = meshes.group.getObjectByName('worn-eyes')!.children[0]!;
    const anchors = registry.models.get('night_vision_goggles')!.anchors!;
    const at = (name: string) => new Vector3(...anchors[name]!).applyMatrix4(model.matrixWorld);
    const headAnchors = registry.models.get(playerFigure.body.model)!.anchors!;
    for (const side of ['left', 'right']) {
      const eye = new Vector3(...headAnchors[`eye_${side}`]!).applyMatrix4(drawnPart(meshes, 'body').matrixWorld);
      const rear = at(`eye_${side}`);
      const lens = at(`lens_${side}`);
      const radius = at(`lens_${side}_edge`).distanceTo(lens);
      const forward = lens.clone().sub(rear).normalize();
      const eyeToLens = lens.clone().sub(eye);
      const ahead = eyeToLens.dot(forward);
      expect(ahead, `${side} lens in front of eye`).toBeGreaterThan(0);
      expect(eyeToLens.addScaledVector(forward, -ahead).length(), `${side} eye within lens aperture`).toBeLessThan(
        radius,
      );
      expect(rear.distanceTo(eye), `${side} eyepiece against face`).toBeLessThan(radius);
    }
    expectSnugStrap(head, at);
  });

  it('fits the headlamp against the forehead above the eyes with a snug strap', () => {
    const meshes = wearOnFigure('headlamp');
    const head = drawnHead(meshes);
    const model = meshes.group.getObjectByName('worn-head')!.children[0]!;
    const anchors = registry.models.get('headlamp')!.anchors!;
    const at = (name: string) => new Vector3(...anchors[name]!).applyMatrix4(model.matrixWorld);
    const eyes = ['eye_left', 'eye_right'].map((name) => anchorAt(meshes, 'body', playerFigure.body.model, name));
    expect(at('housing_bottom').y, 'housing clears the eye line').toBeGreaterThan(
      Math.max(...eyes.map((eye) => eye.y)),
    );
    expect(at('housing_top').y, 'housing stays below the crown').toBeLessThan(
      new Box3().setFromObject(head, true).max.y,
    );
    const back = at('housing_back');
    expect(back.x, 'housing centred between eyes').toBeGreaterThan(Math.min(...eyes.map((eye) => eye.x)));
    expect(back.x, 'housing centred between eyes').toBeLessThan(Math.max(...eyes.map((eye) => eye.x)));
    const ray = expectSnugStrap(head, at);
    const lens = at('lens');
    ray.set(back, back.clone().sub(lens).normalize());
    const hits = ray.intersectObject(head, true);
    expect(hits.length, 'housing faces the forehead').toBeGreaterThan(0);
    expect(hits[0]!.distance, 'housing rests against forehead within its own depth').toBeLessThan(
      lens.distanceTo(back),
    );
  });

  it('lowers the anatomical head through stances and blends preview poses between them', () => {
    const body = createPlayerBody(scale, 4, 1, 4);
    const meshes = playerMeshes();
    const { blendRealSeconds } = playerFigure.stancePoses;
    const baseY = body.pos[1] * scale.blockSize;
    const pose = (stance: PlayerStance, dt: number) => {
      meshes.sync({ body, yaw: 0, stepOffset: 0, gaitPhase: 0, moving: false, thirdPerson: true, stance, dt });
      meshes.group.updateMatrixWorld(true);
      const top = new Box3().setFromObject(meshes.group, true).max.y;
      return { head: anchorAt(meshes, 'body', playerFigure.body.model, 'head'), top: top - baseY };
    };

    const settled = Object.fromEntries(
      (['standing', 'crouching', 'prone'] as const).map((stance) => {
        const shown = pose(stance, blendRealSeconds);
        return [stance, shown.head];
      }),
    ) as Record<PlayerStance, Vector3>;
    expect(settled.crouching.y).toBeLessThan(settled.standing.y);
    expect(settled.prone.y).toBeLessThan(settled.crouching.y);
    // Yaw 0 faces -z: lying prone puts the head further ahead of the body than above it.
    expect(body.pos[2] * scale.blockSize - settled.prone.z).toBeGreaterThan(settled.prone.y - baseY);

    const halfway = pose('standing', blendRealSeconds / 2).head;
    expect(halfway.y).toBeGreaterThan(settled.prone.y);
    expect(halfway.y).toBeLessThan(settled.standing.y);
    expect(pose('standing', blendRealSeconds / 2).head.y).toBeCloseTo(settled.standing.y);
  });

  it('keeps each limb joint anchor on its body joint anchor while standing, crouching and walking', () => {
    const body = createPlayerBody(scale, 4, 1, 4);
    const meshes = playerMeshes();
    const poses = [
      { stance: 'standing', moving: false, gaitPhase: 0 },
      { stance: 'crouching', moving: false, gaitPhase: 0 },
      { stance: 'standing', moving: true, gaitPhase: Math.PI / 2 },
      { stance: 'crouching', moving: true, gaitPhase: -Math.PI / 3 },
    ] as const;
    for (const { stance, moving, gaitPhase } of poses) {
      for (const thirdPerson of [false, true]) {
        meshes.sync({ body, yaw: 0.4, stepOffset: 0.05, gaitPhase, moving, stance, dt: 1, thirdPerson });
        for (const limb of FIGURE_LIMBS) {
          const { model, joint } = playerFigure.limbs[limb];
          const bodyJoint = playerFigure.body.joints[FIGURE_LIMB_JOINTS[limb]];
          const at = anchorAt(meshes, limb, model, joint);
          const on = anchorAt(meshes, 'body', playerFigure.body.model, bodyJoint);
          expect(at.distanceTo(on), `${limb} ${stance} moving ${moving} third person ${thirdPerson}`).toBeCloseTo(0, 6);
        }
      }
    }
  });

  it('crouches on bent knees: feet flat behind the knees, knees below the hips, torso forward, head up, arms in guard', () => {
    const body = createPlayerBody(scale, 4, 1, 4);
    const meshes = playerMeshes();
    const ground = body.pos[1] * scale.blockSize;
    for (const thirdPerson of [true, false]) {
      meshes.sync({
        body,
        yaw: 0,
        stepOffset: 0,
        gaitPhase: 0,
        moving: false,
        stance: 'crouching',
        dt: 1,
        thirdPerson,
      });
      const hips = (['leftLeg', 'rightLeg'] as const).map((leg) =>
        expectCrouchedLeg(meshes, leg, ground, `${leg} third person ${thirdPerson}`),
      );
      const lowest = Math.min(...drawnVertices(meshes).map(({ at }) => at.y));
      expect(lowest, `third person ${thirdPerson}: nothing sinks into the ground`).toBeGreaterThan(ground - 0.005);
      const head = anchorAt(meshes, 'body', playerFigure.body.model, 'head');
      const hipZ = (hips[0]!.z + hips[1]!.z) / 2;
      expect(hipZ - head.z, `third person ${thirdPerson}: torso leans forward`).toBeGreaterThan(0);
      // Models face +z, so each part's +z is where it faces.
      const facing = (object: Object3D) => new Vector3(0, 0, 1).transformDirection(object.matrixWorld);
      const torso = drawnPart(meshes, 'body');
      expect(
        facing(torso.getObjectByName(FIGURE_PIVOT.head)!).y,
        `third person ${thirdPerson}: head up`,
      ).toBeGreaterThan(facing(torso).y);
      for (const arm of ['leftArm', 'rightArm'] as const) {
        expectGuardArm(meshes, arm, head, `${arm} third person ${thirdPerson}`);
      }
    }
  });

  it('swings each leg against the other and each arm against its own leg while walking', () => {
    const body = createPlayerBody(scale, 4, 1, 4);
    const meshes = playerMeshes();
    meshes.sync({ body, yaw: 0, stepOffset: 0, gaitPhase: Math.PI / 2, moving: true, ...STANDING, thirdPerson: true });
    // Yaw 0 faces -z, so a limb reaching forward ends at a lower z than its joint.
    const reach = (limb: FigureLimb) => {
      const { model, joint } = playerFigure.limbs[limb];
      meshes.group.updateMatrixWorld(true);
      const end = new Box3().setFromObject(drawnPart(meshes, limb), true).getCenter(new Vector3());
      return end.z - anchorAt(meshes, limb, model, joint).z;
    };
    expect(Math.sign(reach('leftLeg'))).toBe(-1);
    expect(Math.sign(reach('rightLeg'))).toBe(1);
    expect(Math.sign(reach('leftArm'))).toBe(1);
    expect(Math.sign(reach('rightArm'))).toBe(-1);
  });

  it('draws exactly one actor arm on each side for idle, one-hand and two-hand roles in every view', () => {
    const body = createPlayerBody(scale, 4, 1, 4);
    const meshes = playerMeshes();
    const bodyArmShown = (side: 'left' | 'right') => {
      let count = 0;
      meshes.group.traverseVisible((object) => {
        if (object.name === `figure-${side}Arm` || object.name === `first-person-arm-${side}`) {
          count += 1;
        }
      });
      expect(count).toBe(1);
      return count === 1;
    };
    // Empty hands draw fists; a one-handed and a two-handed item each draw their own grip.
    for (const held of [undefined, 'kitchen_knife', 'baseball_bat']) {
      const inventory = new Inventory(registry);
      if (held) {
        inventory.add(inventory.create(held), { kind: 'hand', side: 'right' });
      }
      meshes.sync({ body, yaw: 0, stepOffset: 0, gaitPhase: 0, moving: false, ...STANDING, inventory });
      for (const side of ['left', 'right'] as const) {
        expect(bodyArmShown(side), `${held}: ${side} body arm in first person`).toBe(true);
      }
      meshes.sync({
        body,
        yaw: 0,
        stepOffset: 0,
        gaitPhase: 0,
        moving: false,
        ...STANDING,
        inventory,
        thirdPerson: true,
      });
      for (const side of ['left', 'right'] as const) {
        expect(bodyArmShown(side), `${held}: ${side} body arm in third person`).toBe(true);
      }
    }
  });

  it('keeps idle first-person grips camera-relative when the camera turns', () => {
    const inventory = new Inventory(registry);
    const held = new HeldItems(inventory, undefined, playerFigure);
    const internals = heldState(held) as { view: Group; arms: Map<'left' | 'right', Group> };
    const camera = new PerspectiveCamera();
    camera.rotation.set(0, Math.PI / 2, 0, 'YXZ');
    held.update(camera, readyMeleePose(false));
    internals.view.updateMatrixWorld(true);
    const actual = internals.arms.get('right')!.getObjectByName('grip-anchor')!.getWorldPosition(new Vector3());
    const expected = new Vector3(...HOLD.right).applyQuaternion(camera.quaternion);
    expect(actual.distanceTo(expected)).toBeLessThan(0.001);
  });

  it('rigs each idle view arm from the authored arm model: shoulder on its anchor, hand on the held grip', () => {
    const inventory = new Inventory(registry);
    const held = new HeldItems(inventory, figureModels, playerFigure);
    const internals = heldState(held) as ArmInternals;
    const camera = new PerspectiveCamera();
    held.update(camera);
    internals.view.updateMatrixWorld(true);
    for (const side of ['left', 'right'] as const) {
      const arm = internals.arms.get(side)!;
      const rig = internals.armRigs.get(side)!;
      const model = registry.models.get(playerFigure.limbs[`${side}Arm`].model)!;
      const anchor = (name: string) => new Vector3(...model.anchors![name]!);
      const { armRig } = playerFigure;
      expect(rig.upperLength).toBeCloseTo(anchor(armRig.fore.pivot).distanceTo(anchor(armRig.upper.pivot)), 6);
      expect(rig.foreLength).toBeCloseTo(anchor(armRig.hand.pivot).distanceTo(anchor(armRig.fore.pivot)), 6);
      const joints = armJoints(arm);
      expect(joints.shoulder.distanceTo(new Vector3(...firstPersonShoulder(playerFigure, side))), side).toBeLessThan(
        1e-6,
      );
      expect(joints.grip.distanceTo(new Vector3(...HOLD[side])), side).toBeLessThan(1e-6);
      expectConnectedArm(arm, rig, side);
      // Every rig segment is a drawn part of the arm model, hung under its pivot.
      for (const segment of ['upper', 'fore', 'hand', 'fingers', 'thumb'] as const) {
        let found: Object3D | undefined;
        arm.traverse((object) => {
          found ??= object.userData.part === armRig[segment].part ? object : undefined;
        });
        expect(found, `${side} ${segment}`).toBeDefined();
      }
    }
    held.dispose();
  });

  it('keeps exactly two first-person arm chains across inventory and model rebuilds, at rest and contact', () => {
    const inventory = new Inventory(registry);
    let modelLoaded = false;
    const models = {
      version: 0,
      has: () => false,
      heldLook: () => (modelLoaded ? { root: new Group(), parts: [], slots: {} } : undefined),
    } as unknown as NonNullable<ConstructorParameters<typeof HeldItems>[1]>;
    const held = new HeldItems(inventory, models, playerFigure);
    const internals = heldState(held) as { scene: Group; arms: Map<'left' | 'right', Group> };
    const camera = new PerspectiveCamera();
    const renderedArmCount = () => {
      let count = 0;
      internals.scene.traverse((object) => {
        if (object.name.startsWith('first-person-arm-')) {
          count += 1;
        }
      });
      return count;
    };
    const counts: number[] = [];
    const record = (pose?: ReturnType<typeof readyMeleePose>) => {
      held.update(camera, pose);
      counts.push(renderedArmCount());
    };

    record(readyMeleePose(false));
    const originalArms = [...internals.arms.values()];
    const backpack = inventory.create('hiking_backpack');
    expect(inventory.add(backpack, { kind: 'worn' })).toBe(true);
    record(readyMeleePose(false));
    for (let index = 0; index < 3; index++) {
      expect(inventory.add(inventory.create('canned_beans'), { kind: 'pocket', owner: backpack, pocket: 0 })).toBe(
        true,
      );
      record(readyMeleePose(false));
    }

    const knife = inventory.create('kitchen_knife');
    expect(inventory.add(knife, { kind: 'hand', side: 'right' })).toBe(true);
    record(readyMeleePose(false));
    modelLoaded = true;
    models.version += 1;
    record(readyMeleePose(false));
    record(readyMeleePose(true, playerFigure.holds));
    const { cooldown } = FISTS_MELEE;
    const contactAt = meleeContactTime(cooldown, FISTS_MELEE.contactFraction!, FISTS_MELEE.windupCapSimSeconds!);
    const contact = meleePoseAndContact(
      {
        profile: 'fists',
        hand: 'right',
        twoHanded: false,
        cooldown,
        contactAt,
        aimYaw: 0,
        aimPitch: 0,
        origin: [0, 0, 0],
        direction: [0, 0, -1],
        hitResolved: false,
      },
      contactAt,
      false,
    );
    record(readyMeleePose(true, playerFigure.holds));
    record(contact);

    expect(inventory.move(knife, { kind: 'hand', side: 'left' }).ok).toBe(true);
    record(readyMeleePose(false));
    expect(inventory.move(knife, { kind: 'hand', side: 'right' }).ok).toBe(true);
    record(readyMeleePose(false));
    expect(counts).toEqual(Array.from({ length: counts.length }, () => 2));
    expect(originalArms.every((arm) => arm.parent === null)).toBe(true);
  });

  it('keeps exactly two first-person chains for a two-handed bat through hand swaps and real inventory restore', () => {
    const inventory = new Inventory(registry);
    const bat = inventory.create('baseball_bat');
    expect(inventory.add(bat, { kind: 'hand', side: 'right' })).toBe(true);
    const held = new HeldItems(inventory, undefined, playerFigure);
    const internals = held as unknown as { scene: Group };
    const camera = new PerspectiveCamera();
    const armCount = () => {
      let count = 0;
      internals.scene.traverse((object) => {
        if (object.name.startsWith('first-person-arm-')) {
          count += 1;
        }
      });
      return count;
    };

    held.update(camera, readyMeleePose(false));
    expect(armCount()).toBe(2);
    expect(inventory.move(bat, { kind: 'hand', side: 'left' }).ok).toBe(true);
    held.update(camera, readyMeleePose(false));
    expect(armCount()).toBe(2);

    const restored = Inventory.restoreState(
      registry,
      inventory.snapshotState() as Parameters<typeof Inventory.restoreState>[1],
    );
    const restoredHeld = new HeldItems(restored, undefined, playerFigure);
    const restoredInternals = restoredHeld as unknown as { scene: Group };
    restoredHeld.update(camera, readyMeleePose(false));
    let restoredArmCount = 0;
    restoredInternals.scene.traverse((object) => {
      if (object.name.startsWith('first-person-arm-')) {
        restoredArmCount += 1;
      }
    });
    expect(restoredArmCount).toBe(2);
    const restoredBackpack = restored.create('hiking_backpack');
    expect(restored.add(restoredBackpack, { kind: 'worn' })).toBe(true);
    restoredHeld.update(camera, readyMeleePose(true, playerFigure.holds));
    let rebuiltArmCount = 0;
    restoredInternals.scene.traverse((object) => {
      if (object.name.startsWith('first-person-arm-')) {
        rebuiltArmCount += 1;
      }
    });
    expect(rebuiltArmCount).toBe(2);
  });

  it('keeps the click-time aim axis through yaw and pitch without rolling a cut blade', () => {
    const inventory = new Inventory(registry);
    const knife = inventory.create('kitchen_knife');
    inventory.add(knife, { kind: 'hand', side: 'right' });
    const held = new HeldItems(inventory, undefined, playerFigure);
    const internals = heldState(held) as {
      view: Group;
      arms: Map<'left' | 'right', Group>;
      heldByHand: Map<'left' | 'right', Group>;
    };
    const camera = new PerspectiveCamera();
    camera.rotation.set(0.6, -0.8, 0, 'YXZ');
    const action = {
      profile: 'cut' as const,
      hand: 'right' as const,
      twoHanded: false,
      cooldown: 0.8,
      contactAt: 0.25,
      aimYaw: 0.7,
      aimPitch: -0.3,
      origin: [0, 0, 0] as [number, number, number],
      direction: [0, 0, -1] as [number, number, number],
      hitResolved: false,
    };
    const pose = meleePoseAndContact(action, action.contactAt, false);
    held.update(camera, pose);
    internals.view.updateMatrixWorld(true);
    const expected = new Quaternion().setFromEuler(new Euler(action.aimPitch, action.aimYaw, 0, 'YXZ'));
    expected.multiply(new Quaternion().setFromEuler(new Euler(...pose.right.rotation, 'YXZ')));
    const actualArm = internals.arms.get('right')!.getWorldQuaternion(new Quaternion());
    const actualItem = internals.heldByHand.get('right')!.getWorldQuaternion(new Quaternion());
    const expectedForward = new Vector3(0, 0, -1).applyQuaternion(expected).normalize();
    const actualForward = new Vector3(0, 0, -1).applyQuaternion(actualItem).normalize();
    expect(actualForward.angleTo(expectedForward) * (180 / Math.PI)).toBeLessThan(0.1);
    expect(actualArm.angleTo(actualItem) * (180 / Math.PI)).toBeLessThan(0.1);
  });

  it('keeps a left-hand flashlight attached and in its hold pose during a right-fist torso-yaw strike', () => {
    const inventory = new Inventory(registry);
    const flashlight = inventory.create('flashlight');
    expect(inventory.add(flashlight, { kind: 'hand', side: 'left' })).toBe(true);
    const held = new HeldItems(inventory, undefined, playerFigure);
    const internals = heldState(held) as {
      view: Group;
      arms: Map<'left' | 'right', Group>;
      heldByHand: Map<'left' | 'right', Group>;
    };
    const camera = new PerspectiveCamera();
    const action = {
      profile: 'fists' as const,
      hand: 'right' as const,
      twoHanded: false,
      hands: { right: null, left: flashlight.uid },
      cooldown: 0.8,
      contactAt: 0.25,
      aimYaw: 0,
      aimPitch: 0,
      origin: [0, 0, 0] as [number, number, number],
      direction: [0, 0, -1] as [number, number, number],
      hitResolved: false,
    };
    let maxTorsoYaw = 0;
    for (let step = 0; step <= 120; step++) {
      const elapsed = (action.cooldown * step) / 120;
      const pose = renderMeleePose(action, elapsed, false);
      maxTorsoYaw = Math.max(maxTorsoYaw, Math.abs(pose.torsoYaw ?? 0));
      expect(pose.left.offset).toEqual([0, 0, 0]);
      expect(pose.left.rotation).toEqual([0, 0, 0]);
      held.update(camera, pose);
      internals.view.updateMatrixWorld(true);
      const arm = internals.arms.get('left')!;
      const item = internals.heldByHand.get('left')!;
      const hand = arm.getObjectByName('grip-anchor')!.getWorldPosition(new Vector3());
      const grip = item.getWorldPosition(new Vector3());
      const handOrientation = arm.getWorldQuaternion(new Quaternion());
      const itemOrientation = item.getWorldQuaternion(new Quaternion());
      expect(grip.distanceTo(hand), `frame ${step} grip/hand gap`).toBeLessThanOrEqual(0.001);
      expect(itemOrientation.angleTo(handOrientation), `frame ${step} item/hand rotation`).toBeLessThan(1e-6);
    }
    expect(maxTorsoYaw).toBeGreaterThan(0);
  });

  it.each(['right', 'left'] as const)(
    'puts each hand of a %s-held long gun on its hold, authored for a right hold and mirrored across the gun for a left one',
    (side) => {
      const def = [...registry.items.values()].find(
        (item) => item.firearm && item.twoHanded && item.model && registry.models.get(item.model)?.hands,
      )!;
      const source = registry.models.get(def.model!)!;
      // An asymmetric fixture: both holds off the gun's centre plane, the support fingers across it, no turn or roll,
      // so the expected placement is the plain forward-hold mapping of model x, y, z onto view -z, y, x.
      const model = {
        ...source,
        roll: undefined,
        hold: 'forward' as const,
        grip: { ...source.grip!, turn: undefined },
        hands: {
          ...source.hands!,
          firing: { ...source.hands!.firing, at: [-0.2, -0.03, 0.03] as Vec3 },
          support: {
            at: [0.2, -0.05, -0.04] as Vec3,
            palm: [0, 1, 0] as Vec3,
            fingers: [0.6, 0, 0.8] as Vec3,
            pose: 'forend' as const,
          },
        },
      };
      const models = new Map(registry.models);
      models.set(model.id, model);
      const inventory = new Inventory({ ...registry, models });
      expect(inventory.add(inventory.create(def.id), { kind: 'hand', side })).toBe(true);
      const mirrored = ([x, y, z]: Vec3): Vector3 =>
        new Vector3(z, y, -x).multiply(new Vector3(side === 'right' ? 1 : -1, 1, 1));
      const held = new HeldItems(inventory, figureOnlyModels, playerFigure);
      const internals = heldState(held) as ArmInternals & { heldByHand: Map<'left' | 'right', Group> };
      try {
        held.update(new PerspectiveCamera());
        internals.view.updateMatrixWorld(true);
        const gun = internals.heldByHand.get(side)!;
        const gunRotation = gun.getWorldQuaternion(new Quaternion());
        const other = side === 'right' ? 'left' : 'right';
        for (const [hand, hold] of [
          [side, 'firing'],
          [other, 'support'],
        ] as const) {
          const arm = internals.arms.get(hand)!;
          const authored = model.hands[hold];
          const at = mirrored(authored.at.map((value, axis) => value - model.grip.at[axis]!) as Vec3);
          const palm = mirrored(authored.palm).normalize();
          const fingers = mirrored(authored.fingers).normalize();
          const anchor = gun.worldToLocal(worldOf(arm, 'grip-anchor'));
          expect(anchor.distanceTo(at), `${hand} ${hold} at`).toBeLessThan(1e-6);
          const handRotation = arm.getObjectByName(ARM_NODE.hand)!.getWorldQuaternion(new Quaternion());
          const expected = gunRotation
            .clone()
            .multiply(
              new Quaternion().setFromRotationMatrix(
                new Matrix4().makeBasis(fingers.clone().cross(palm), fingers, palm),
              ),
            );
          expect(handRotation.angleTo(expected), `${hand} ${hold} frame`).toBeLessThan(1e-6);
          const fingersDegrees = Math.abs(arm.getObjectByName(ARM_NODE.knuckles)!.rotation.z) * (180 / Math.PI);
          expect(fingersDegrees, `${hand} ${hold} pose`).toBeCloseTo(
            playerFigure.armRig.handPoses[authored.pose].fingersDegrees,
            6,
          );
          expectConnectedArm(arm, internals.armRigs.get(hand)!, `${hand} ${hold}`);
        }
      } finally {
        held.dispose();
      }
    },
  );

  it('keeps two-handed support grips attached to weapon-local grip for both sides and hold orientations', () => {
    const def = registry.items.get('baseball_bat')!;
    const model = registry.models.get(def.model!)! as { hold: 'forward' | 'upright' };
    const originalHold = model.hold;
    const camera = new PerspectiveCamera();
    try {
      for (const side of ['left', 'right'] as const) {
        for (const hold of ['forward', 'upright'] as const) {
          model.hold = hold;
          const inventory = new Inventory(registry);
          const bat = inventory.create('baseball_bat');
          inventory.add(bat, { kind: 'hand', side });
          const held = new HeldItems(inventory, undefined, playerFigure);
          const internals = heldState(held) as {
            view: Group;
            arms: Map<'left' | 'right', Group>;
            heldByHand: Map<'left' | 'right', Group>;
          };
          const swing = {
            profile: 'blunt' as const,
            hand: side,
            twoHanded: true,
            cooldown: 1.2,
            contactAt: 0.25,
            aimYaw: 0,
            aimPitch: 0,
            origin: [0, 0, 0] as [number, number, number],
            direction: [0, 0, -1] as [number, number, number],
            hitResolved: false,
          };
          const supportSide = side === 'right' ? 'left' : 'right';
          held.update(camera);
          internals.view.updateMatrixWorld(true);
          const weapon = internals.heldByHand.get(side)!;
          const anchor = internals.arms.get(supportSide)!.getObjectByName('grip-anchor')!;
          const localGrip = weapon.worldToLocal(anchor.getWorldPosition(new Vector3()));
          for (const elapsed of [0, 0.05, 0.09, 0.15, 0.25, 0.32, 0.46, 0.8, 1.2]) {
            held.update(camera, meleePoseAndContact(swing, elapsed, false));
            internals.view.updateMatrixWorld(true);
            const expected = weapon.localToWorld(localGrip.clone());
            const actual = anchor.getWorldPosition(new Vector3());
            expect(actual.distanceTo(expected)).toBeLessThanOrEqual(0.01);
          }
        }
      }
    } finally {
      model.hold = originalHold;
    }
  });

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: validates connected arm geometry across supported weapons and 121 poses.
  it('keeps the rigged arm chain connected and bent outward through every sampled melee pose', () => {
    const camera = new PerspectiveCamera(75, 16 / 9, 0.01, 128);
    const cases = [
      { item: 'baseball_bat', profile: 'blunt' as const, twoHanded: true },
      { item: 'steel_pipe', profile: 'blunt' as const, twoHanded: false },
      { item: 'kitchen_knife', profile: 'cut' as const, twoHanded: false },
      { item: 'steel_pipe', profile: 'pierce' as const, twoHanded: false },
      { item: undefined, profile: 'fists' as const, twoHanded: false },
    ];
    for (const { item, profile, twoHanded } of cases) {
      for (const side of ['left', 'right'] as const) {
        if (side === 'left' && item && !twoHanded) {
          continue;
        }
        const inventory = new Inventory(registry);
        if (item) {
          inventory.add(inventory.create(item), { kind: 'hand', side });
        }
        const held = new HeldItems(inventory, figureOnlyModels, playerFigure);
        const internals = heldState(held) as ArmInternals;
        held.update(camera);
        const arm = internals.arms.get(side)!;
        const rig = internals.armRigs.get(side)!;
        const action = {
          profile,
          hand: side,
          twoHanded,
          cooldown: 1.2,
          contactAt: 0.25,
          aimYaw: 0,
          aimPitch: 0,
          origin: [0, 0, 0] as [number, number, number],
          direction: [0, 0, -1] as [number, number, number],
          hitResolved: false,
        };
        for (let step = 0; step <= 120; step++) {
          const elapsed = (action.cooldown * step) / 120;
          held.update(camera, meleePoseAndContact(action, elapsed, false));
          internals.view.updateMatrixWorld(true);
          const label = `${item ?? profile}/${side} frame ${step}`;
          expectConnectedArm(arm, rig, label);
          const { shoulder, elbow, wrist } = armJoints(arm);
          const axis = wrist.clone().sub(shoulder).normalize();
          const sideBend = new Vector3(side === 'right' ? 1 : -1, 0, 0);
          sideBend.addScaledVector(axis, -sideBend.dot(axis));
          if (sideBend.lengthSq() > 1e-8) {
            sideBend.normalize();
            const along = elbow.clone().sub(shoulder).dot(axis);
            const elbowBend = elbow.clone().sub(shoulder).addScaledVector(axis, -along);
            if (elbowBend.lengthSq() > 1e-8) {
              expect(elbowBend.dot(sideBend), `${label} elbow side`).toBeGreaterThan(0);
            }
          }
        }
        held.dispose();
      }
    }
  });
});
