// biome-ignore-all lint/suspicious/noMisplacedAssertion: shared arm-chain assertions are called only by tests.
import {
  Box3,
  BoxGeometry,
  DirectionalLight,
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
import { describe, expect, it } from 'vitest';
import { HOLD, heldAnchorOffset } from '../src/core/heldPose.ts';
import { Inventory } from '../src/core/inventory.ts';
import { toggleLight } from '../src/core/lights.ts';
import { meleeContactTime, meleePoseAndContact, readyMeleePose } from '../src/core/meleePose.ts';
import { opticViewSettings } from '../src/core/opticView.ts';
import type { PlayerStance } from '../src/core/playerStance.ts';
import { makeScale } from '../src/core/scale.ts';
import { FIGURE_LIMB_JOINTS, FIGURE_LIMBS, type FigureLimb } from '../src/core/schema.ts';
import { createPlayerBody as createBody } from '../src/game/player.ts';
import { ARM_NODE, type ArmRig } from '../src/render/armRig.ts';
import { HeldItems } from '../src/render/hands.ts';
import { renderMeleePose } from '../src/render/meleePose.ts';
import type { ModelLibrary } from '../src/render/models.ts';
import { firstPersonShoulder, PLAYER_BODY_REAR_OFFSET, PlayerMeshes } from '../src/render/playerFigure.ts';
import { baseRegistry } from './baseRegistry.ts';
import { loadFigureModels } from './figureModels.ts';
import { FISTS_MELEE } from './fixtures/unarmed.ts';
import { createPlayerBody, PLAYER } from './playerFixture.ts';

const registry = baseRegistry();
const scale = makeScale(0.5);
const playerFigure = registry.figures.get('player')!;
const STANDING = { stance: 'standing', dt: 0 } as const;

const figureModels = { version: 1, ...(await loadFigureModels(registry)) } as unknown as ModelLibrary;
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
/** The arm's segments keep their model lengths and meet at the joints, with the hand frame on the grip point. */
const expectConnectedArm = (arm: Group, rig: ArmRig, label: string): void => {
  const joints = armJoints(arm);
  expect(joints.elbow.distanceTo(joints.shoulder), `${label} upper length`).toBeCloseTo(rig.upperLength, 4);
  expect(joints.wrist.distanceTo(joints.elbow), `${label} fore length`).toBeCloseTo(rig.foreLength, 4);
  expect(joints.hand.distanceTo(joints.grip), `${label} hand on grip`).toBeLessThan(1e-6);
  expect(joints.grip.distanceTo(joints.wrist), `${label} grip from wrist`).toBeCloseTo(rig.gripFromWrist.length(), 4);
};
const drawnPart = (meshes: PlayerMeshes, name: 'body' | FigureLimb) => meshes.group.getObjectByName(`figure-${name}`)!;
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
const anchorAt = (meshes: PlayerMeshes, name: 'body' | FigureLimb, model: string, anchor: string): Vector3 => {
  meshes.group.updateMatrixWorld(true);
  return new Vector3(...registry.models.get(model)!.anchors![anchor]!).applyMatrix4(
    drawnPart(meshes, name).matrixWorld,
  );
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

  it.each(fallbackLightHands)('$id in the $side hand draws by its light definition', ({ id, definition, side }) => {
    const inventory = new Inventory(registry);
    const light = inventory.create(id);
    expect(toggleLight(registry, light, 0)).toBeUndefined();
    expect(inventory.add(light, { kind: 'hand', side })).toBe(true);
    const held = new HeldItems(inventory, undefined, playerFigure);
    held.update(new PerspectiveCamera());
    const { shown } = held as unknown as { shown: Map<number, Group> };
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
    const { shown } = held as unknown as { shown: Map<number, Group> };
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
    expect(recoiling?.center).not.toEqual(settled?.center);
    held.dispose();
  });
});

describe('player figure', () => {
  it('keeps the world body out of a level or upward first-person view in every stance', () => {
    const senses = registry.player.get('player')!;
    const body = createBody(scale, [4, 1, 4], senses);
    const eyeDrop: Record<PlayerStance, number> = {
      standing: 0,
      crouching: senses.crouch.eyeDropMetres,
      prone: senses.prone.eyeDropMetres,
    };
    for (const stance of ['standing', 'crouching', 'prone'] as const) {
      const meshes = playerMeshes();
      meshes.sync({
        body,
        yaw: 0,
        stepOffset: 0,
        gaitPhase: 0,
        moving: false,
        stance,
        dt: playerFigure.stancePoses.blendRealSeconds,
      });
      const vertices = drawnVertices(meshes);
      for (const pitch of [0, 0.25, 0.5, Math.PI / 3]) {
        const camera = new PerspectiveCamera(75, 16 / 9, 0.05, 128);
        camera.rotation.order = 'YXZ';
        camera.position.set(
          body.pos[0] * scale.blockSize,
          body.pos[1] * scale.blockSize + senses.eye - eyeDrop[stance],
          body.pos[2] * scale.blockSize,
        );
        camera.rotation.set(pitch, 0, 0);
        camera.updateMatrixWorld(true);
        const frustum = new Frustum().setFromProjectionMatrix(
          new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
        );
        expect(vertices.length, 'the figure draws').toBeGreaterThan(0);
        const visible = new Set(vertices.filter(({ at }) => frustum.containsPoint(at)).map(({ part }) => part));
        expect([...visible], `${stance} at pitch ${pitch}`).toEqual([]);
      }
    }
  });

  it('keeps a shoe toe visible past the torso at -60 and -80 degrees', () => {
    const body = createPlayerBody(scale, 4, 1, 4);
    const meshes = playerMeshes();
    const eye = new Vector3(
      body.pos[0] * scale.blockSize,
      body.pos[1] * scale.blockSize + PLAYER.eye,
      body.pos[2] * scale.blockSize,
    );
    for (const pitch of [-Math.PI / 3, (-80 * Math.PI) / 180]) {
      meshes.sync({ body, yaw: 0, stepOffset: 0, gaitPhase: 0, moving: false, ...STANDING });
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

  it('draws every figure-row part, hides only the arms in first person, and sets the body back only there', () => {
    const body = createPlayerBody(scale, 4, 1, 4);
    const meshes = playerMeshes();
    const bodyZ = (thirdPerson: boolean) => {
      meshes.sync({ body, yaw: 0, stepOffset: 0, gaitPhase: 0, moving: false, ...STANDING, thirdPerson });
      return drawnPart(meshes, 'body').position.z;
    };
    const firstPerson = bodyZ(false);
    expect(meshes.loaded).toBe(true);
    for (const name of ['body', ...FIGURE_LIMBS] as const) {
      expect(drawnPart(meshes, name).visible, `${name} in first person`).toBe(!name.endsWith('Arm'));
    }
    expect(firstPerson - bodyZ(true)).toBeCloseTo(PLAYER_BODY_REAR_OFFSET);
    for (const name of ['body', ...FIGURE_LIMBS] as const) {
      expect(drawnPart(meshes, name).visible, `${name} in third person`).toBe(true);
    }
  });

  it('poses the drawn body for the stance it is given, inside that stance’s height, blending between stances', () => {
    const body = createPlayerBody(scale, 4, 1, 4);
    const meshes = playerMeshes();
    const senses = registry.player.get('player')!;
    const heightOf: Record<PlayerStance, number> = {
      standing: PLAYER.height,
      crouching: senses.crouch.bodyHeightMetres,
      prone: senses.prone.bodyHeightMetres,
    };
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
        expect(shown.top, `${stance} drawn top`).toBeLessThanOrEqual(heightOf[stance]);
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

  it('draws one pair of arms: no body arm on a side whose first-person view arm draws, all body arms in third person', () => {
    const body = createPlayerBody(scale, 4, 1, 4);
    const meshes = playerMeshes();
    const bodyArmShown = (side: 'left' | 'right') => drawnPart(meshes, `${side}Arm`).visible;
    // Empty hands draw fists; a one-handed and a two-handed item each draw their own grip.
    for (const held of [undefined, 'kitchen_knife', 'baseball_bat']) {
      const inventory = new Inventory(registry);
      if (held) {
        inventory.add(inventory.create(held), { kind: 'hand', side: 'right' });
      }
      const view = new HeldItems(inventory, undefined, playerFigure);
      view.update(new PerspectiveCamera(), readyMeleePose(false));
      const viewArms = (view as unknown as { arms: Map<'left' | 'right', Group> }).arms;
      expect(viewArms.size, `${held} view arms`).toBeGreaterThan(0);
      meshes.sync({ body, yaw: 0, stepOffset: 0, gaitPhase: 0, moving: false, ...STANDING, inventory });
      for (const side of viewArms.keys()) {
        expect(bodyArmShown(side), `${held}: ${side} body arm in first person`).toBe(false);
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
      view.dispose();
    }
  });

  it('keeps idle first-person grips camera-relative when the camera turns', () => {
    const inventory = new Inventory(registry);
    const held = new HeldItems(inventory, undefined, playerFigure);
    const internals = held as unknown as { view: Group; arms: Map<'left' | 'right', Group> };
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
    const internals = held as unknown as ArmInternals;
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
    const internals = held as unknown as { scene: Group; arms: Map<'left' | 'right', Group> };
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
    record(readyMeleePose(true));
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
    record(readyMeleePose(true));
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
    restoredHeld.update(camera, readyMeleePose(true));
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
    const internals = held as unknown as {
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
    const internals = held as unknown as {
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

  it.each([false, true])(
    'uses an authored support wrist when present, otherwise the contact anchor: %s',
    (authoredWrist) => {
      const model = {
        id: 'support_fixture',
        file: 'assets/models/support_fixture.glb' as const,
        grip: { at: [0, 0, 0] as [number, number, number], turn: [0, 0, 0] as [number, number, number] },
        gun: { internalMagazine: { capacity: 1 } },
        anchors: {
          support: [0.3, 0, 0] as [number, number, number],
          // biome-ignore lint/style/useNamingConvention: model anchors use content Ids.
          ...(authoredWrist ? { support_wrist: [0.27, -0.04, 0] as [number, number, number] } : {}),
        },
      };
      const fixture = {
        ...registry,
        models: new Map(registry.models).set(model.id, model),
        items: new Map(registry.items).set('support_fixture', {
          id: 'support_fixture',
          name: 'Fixture',
          category: 'weapon' as const,
          economy: { usage: [], tiers: [] },
          workInProgress: false,
          notLoot: false,
          weight: 1,
          size: [1, 1] as [number, number],
          twoHanded: true,
          model: model.id,
        }),
      };
      const inventory = new Inventory(fixture);
      expect(inventory.add(inventory.create('support_fixture'), { kind: 'hand', side: 'right' })).toBe(true);
      const held = new HeldItems(inventory, undefined, playerFigure);
      try {
        held.update(new PerspectiveCamera());
        const { scene } = held.warmUpTarget;
        scene.updateMatrixWorld(true);
        const arm = scene.getObjectByName('first-person-arm-left')!;
        const anchor = arm.getObjectByName('grip-anchor')!;
        const wrist = arm.parent!.worldToLocal(anchor.getWorldPosition(new Vector3()));
        const expected = heldAnchorOffset(model, authoredWrist ? 'support_wrist' : 'support');
        expect(wrist.distanceTo(new Vector3(...expected))).toBeLessThan(1e-8);
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
          const internals = held as unknown as {
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
        const internals = held as unknown as ArmInternals;
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
