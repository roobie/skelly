// What you hold, in first person (DESIGN.md, "Hands: what you see is what's there"):
// the right hand, the left hand, or both for a two-handed item. Held items are drawn
// after the world, in their own scene with the depth buffer cleared, so they never
// clip into walls. Their lights copy the sky's, so they're dark at night. An item
// without a model (or whose model hasn't loaded) is a plain box sized from its cells.

import {
  BoxGeometry,
  type BufferGeometry,
  DirectionalLight,
  Euler,
  Group,
  HemisphereLight,
  type Material,
  Mesh,
  MeshLambertMaterial,
  Object3D,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Vector3,
  type WebGLRenderer,
} from 'three';
import type { FigureDef } from '../core/content.ts';
import type { Vec3 } from '../core/coords.ts';
import type { HandSide, Inventory } from '../core/inventory.ts';
import { defOf, type Item } from '../core/items.ts';
import { interpolateHandPose, type MeleePoseFrame } from '../core/meleePose.ts';
import { LENS, type ModelLibrary } from './models.ts';
import { createFirstPersonArm, FIRST_PERSON_SHOULDER, placeFirstPersonSegment } from './playerFigure.ts';
import type { SkyTargets } from './sky.ts';

/** Where a held item's grip sits, in metres from the eye (x right, y up, −z forward). */
export const HOLD: Readonly<Record<HandSide | 'both', Vec3>> = {
  right: [0.2, -0.2, -0.38],
  left: [-0.2, -0.2, -0.38],
  both: [0.08, -0.22, -0.42],
};

/** Metres per grid cell for the stand-in box. */
const CELL = 0.06;
const TORSO_Y_AXIS = new Vector3(0, 1, 0);

export class HeldItems {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(75, 1, 0.01, 10);
  /** Turned like the main camera each frame, so the sky's light directions carry over as they are. */
  private readonly view = new Group();
  /** First-person shoulder frame; unlike the camera, this can twist during an unarmed strike. */
  private readonly torso = new Group();
  private readonly light = new DirectionalLight();
  private readonly ambient = new HemisphereLight();
  private readonly geometry = new BoxGeometry(1, 1, 1);
  private readonly material = new MeshLambertMaterial({ color: 0x6b_66_60 });
  private readonly inventory: Inventory;
  private readonly models: ModelLibrary | undefined;
  private drawn = '';
  /** What's drawn for each held item, by uid. */
  private readonly shown = new Map<number, Object3D>();
  private readonly arms = new Map<HandSide, Group>();
  private readonly armLengths = new Map<Group, readonly [number, number]>();
  private readonly handBases = new Map<HandSide, Vec3>();
  private readonly heldByHand = new Map<HandSide, Object3D>();
  private readonly relativeCamera = new Quaternion();
  private readonly lockedCamera = new Quaternion();
  private readonly poseRotation = new Quaternion();
  private readonly recoilRotation = new Quaternion();
  private readonly poseEuler = new Euler();
  private readonly handPosition = new Vector3();
  private readonly pivotPosition = new Vector3();

  private readonly palette: FigureDef['palette'];

  constructor(inventory: Inventory, models: ModelLibrary | undefined, palette: FigureDef['palette']) {
    this.inventory = inventory;
    this.models = models;
    this.palette = palette;
    this.view.add(this.torso);
    this.scene.add(this.view, this.light, this.ambient);
    // Hidden: gives `renderer.compile` the hand material before anything is held. `sync` only clears `view`.
    const warmUp = new Mesh(this.geometry, this.material);
    warmUp.visible = false;
    this.scene.add(warmUp);
  }

  /** The hands' own scene and camera, for precompiling their shaders. */
  get warmUpTarget(): { scene: Scene; camera: PerspectiveCamera } {
    return { scene: this.scene, camera: this.camera };
  }

  /** Catches up with what's held and turns it with the main camera. Call before rendering the frame. */
  update(main: PerspectiveCamera, pose?: MeleePoseFrame, recoil = 0): void {
    this.sync();
    this.torso.rotation.y = pose?.torsoYaw ?? 0;
    for (const side of ['right', 'left'] as const) {
      const hand = pose?.[side] ?? { offset: [0, 0, 0] as Vec3, rotation: [0, 0, 0] as Vec3 };
      const base = this.handBases.get(side);
      if (!base) {
        continue;
      }
      const arm = this.arms.get(side);
      if (!arm) {
        continue;
      }
      const transform = interpolateHandPose(base, hand);
      this.poseRotation.setFromEuler(this.poseEuler.set(...transform.rotation, 'YXZ'));
      this.applyViewPose(main, pose, transform);
      const strength = Math.max(0, Math.min(1, recoil));
      transform.offset[1] += 0.012 * strength;
      transform.offset[2] += 0.025 * strength;
      this.recoilRotation.setFromEuler(this.poseEuler.set(-0.08 * strength, 0, 0, 'YXZ'));
      this.poseRotation.multiply(this.recoilRotation);
      if (arm.parent === this.torso) {
        this.placeTorsoArm(side, arm, transform);
        arm.quaternion.copy(this.poseRotation);
      }
      const held = this.heldByHand.get(side);
      if (held) {
        held.position.set(...transform.offset);
        held.quaternion.copy(this.poseRotation);
      }
    }
    this.camera.quaternion.copy(main.quaternion);
    this.view.quaternion.copy(main.quaternion);
    this.view.updateMatrixWorld(true);
    for (const [side, arm] of this.arms) {
      this.updateArmChain(side, arm);
    }
    this.view.updateMatrixWorld(true);
  }

  private applyViewPose(
    main: PerspectiveCamera,
    pose: MeleePoseFrame | undefined,
    transform: ReturnType<typeof interpolateHandPose>,
  ): void {
    if (!pose?.viewOrientation) {
      return;
    }
    this.lockedCamera.setFromEuler(this.poseEuler.set(pose.viewOrientation.pitch, pose.viewOrientation.yaw, 0, 'YXZ'));
    this.relativeCamera.copy(main.quaternion).invert().multiply(this.lockedCamera);
    this.handPosition.set(...transform.offset).applyQuaternion(this.relativeCamera);
    transform.offset = [this.handPosition.x, this.handPosition.y, this.handPosition.z];
    this.poseRotation.premultiply(this.relativeCamera);
  }

  private placeTorsoArm(side: HandSide, arm: Group, transform: ReturnType<typeof interpolateHandPose>): void {
    const [upperLength, lowerLength] = this.armLengths.get(arm)!;
    this.handPosition.set(...transform.offset).applyAxisAngle(TORSO_Y_AXIS, -this.torso.rotation.y);
    transform.offset = [this.handPosition.x, this.handPosition.y, this.handPosition.z];
    const shoulder = new Vector3(...FIRST_PERSON_SHOULDER[side]);
    const wrist = new Vector3(...transform.offset);
    const reach = upperLength + lowerLength + 0.08;
    if (shoulder.distanceTo(wrist) > reach) {
      wrist.sub(shoulder).normalize().multiplyScalar(reach).add(shoulder);
      transform.offset = [wrist.x, wrist.y, wrist.z];
    }
    arm.position.set(...transform.offset);
  }

  /** Where a held item's lens is, in world metres; false if it isn't held. Call after `update`. */
  lensOf(item: Item, main: PerspectiveCamera, out: Vector3): boolean {
    const lens = this.shown.get(item.uid)?.getObjectByName(LENS);
    if (!lens) {
      return false;
    }
    lens.getWorldPosition(out).add(main.position);
    return true;
  }

  /** Draws what's in your hands over the frame the main camera just rendered. */
  render(renderer: WebGLRenderer, main: PerspectiveCamera, sky: SkyTargets): void {
    if (this.view.children.length === 0) {
      return;
    }
    this.light.position.copy(sky.light.position);
    this.light.color.copy(sky.light.color);
    this.light.intensity = sky.light.intensity;
    this.ambient.color.copy(sky.ambient.color);
    this.ambient.groundColor.copy(sky.ambient.groundColor);
    this.ambient.intensity = sky.ambient.intensity;
    if (this.camera.fov !== main.fov || this.camera.aspect !== main.aspect) {
      this.camera.fov = main.fov;
      this.camera.aspect = main.aspect;
      this.camera.updateProjectionMatrix();
    }
    const { autoClear } = renderer;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = autoClear;
  }

  /** Rebuilds what's held when the hands changed or a model loaded. */
  private sync(): void {
    const version = `${this.inventory.version}:${this.models?.version ?? 0}`;
    if (version === this.drawn) {
      return;
    }
    this.drawn = version;
    this.clearArms();
    this.view.clear();
    this.view.add(this.torso);
    this.shown.clear();
    this.armLengths.clear();
    this.handBases.clear();
    this.heldByHand.clear();
    const { hands } = this.inventory;
    this.syncHand('right', hands.right);
    this.syncHand('left', hands.left);
    this.syncFistHand('right');
    this.syncFistHand('left');
  }

  /** Detaches and disposes arm chains before rebuilding the hands scene on an inventory/model version change. */
  private clearArms(): void {
    const geometries = new Set<BufferGeometry>();
    const materials = new Set<Material>();
    for (const arm of this.arms.values()) {
      arm.traverse((object) => {
        if (object instanceof Mesh) {
          geometries.add(object.geometry);
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
            materials.add(material);
          }
        }
      });
      arm.removeFromParent();
    }
    for (const geometry of geometries) {
      geometry.dispose();
    }
    for (const material of materials) {
      material.dispose();
    }
    this.arms.clear();
  }

  private updateArmChain(side: HandSide, arm: Group): void {
    const sleeve = arm.children[0] as Mesh;
    const forearm = arm.children[1] as Mesh;
    const palm = arm.children[2] as Mesh;
    const anchor = arm.getObjectByName('grip-anchor');
    if (!(sleeve && forearm && palm && anchor)) {
      return;
    }
    const wristWorld = anchor.getWorldPosition(new Vector3());
    const baseShoulder = new Vector3(...FIRST_PERSON_SHOULDER[side]);
    const shoulderView =
      arm.parent === this.torso
        ? this.view.worldToLocal(this.torso.localToWorld(baseShoulder.clone()))
        : baseShoulder.clone();
    const wristView = this.view.worldToLocal(wristWorld.clone());
    const lengths = this.armLengths.get(arm)!;
    const maxReach = lengths[0] + lengths[1];
    const shoulderToWrist = wristView.clone().sub(shoulderView);
    const distance = shoulderToWrist.length();
    const lead = Math.min(0.08, Math.max(0, distance - maxReach));
    if (lead > 0) {
      shoulderView.addScaledVector(shoulderToWrist.normalize(), lead);
    }
    const shoulder = arm.worldToLocal(this.view.localToWorld(shoulderView));
    const wrist = arm.worldToLocal(wristWorld.clone());
    const axis = wrist.clone().sub(shoulder);
    const reach = axis.length();
    const [upperLength, lowerLength] = lengths;
    const along = (upperLength * upperLength - lowerLength * lowerLength + reach * reach) / (2 * reach);
    const bendHeight = Math.sqrt(Math.max(0, upperLength * upperLength - along * along));
    axis.normalize();
    const bend = new Vector3(side === 'right' ? 1 : -1, 0, 0);
    bend.addScaledVector(axis, -bend.dot(axis)).normalize();
    const elbow = shoulder.clone().addScaledVector(axis, along).addScaledVector(bend, bendHeight);
    placeFirstPersonSegment(sleeve, shoulder, elbow, { width: sleeve.scale.x, depth: sleeve.scale.z });
    placeFirstPersonSegment(forearm, elbow, wrist, { width: forearm.scale.x, depth: forearm.scale.z });
    palm.position.copy(wrist);
    palm.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), wrist.clone().sub(elbow).normalize());
  }

  private addArm(side: HandSide, grip: Vec3, parent: Group = this.torso, parentOrigin: Vec3 = [0, 0, 0]): void {
    if (this.arms.has(side)) {
      return;
    }
    const arm = createFirstPersonArm(this.palette, side, grip);
    this.pivotPosition.set(...grip);
    for (const child of arm.children) {
      child.position.sub(this.pivotPosition);
    }
    const localGrip: Vec3 = [grip[0] - parentOrigin[0], grip[1] - parentOrigin[1], grip[2] - parentOrigin[2]];
    arm.position.set(...localGrip);
    this.arms.set(side, arm);
    this.armLengths.set(arm, [(arm.children[0] as Mesh).scale.y, (arm.children[1] as Mesh).scale.y]);
    this.handBases.set(side, localGrip);
    parent.add(arm);
  }

  private syncFistHand(side: HandSide): void {
    if (!this.inventory.hands[side]) {
      this.addArm(side, HOLD[side]);
    }
  }

  private syncHand(side: HandSide, item: Item | undefined): void {
    if (!item) {
      return;
    }
    const def = defOf(this.inventory.registry, item.type);
    const heldAt = HOLD[def.twoHanded ? 'both' : side];
    const held = new Group();
    held.position.set(...heldAt);
    held.add(this.shape(item));
    this.view.add(held);
    this.shown.set(item.uid, held);
    this.heldByHand.set(side, held);
    this.addArm(side, heldAt);
    if (def.twoHanded) {
      this.syncOffhandArm(side, heldAt, def.model, held);
    }
  }

  private syncOffhandArm(side: HandSide, heldAt: Vec3, modelId: string | undefined, held: Group): void {
    const otherSide: HandSide = side === 'right' ? 'left' : 'right';
    const pose = modelId ? this.inventory.registry.models.get(modelId)?.hold : undefined;
    const offhandGrip: Vec3 =
      pose === 'upright' ? [heldAt[0], heldAt[1] + 0.14, heldAt[2]] : [heldAt[0], heldAt[1], heldAt[2] - 0.14];
    this.addArm(otherSide, offhandGrip, held, heldAt);
  }

  private shape(item: Item): Object3D {
    const def = defOf(this.inventory.registry, item.type);
    const model = def.model === undefined ? undefined : this.models?.held(def.model);
    if (model) {
      return model;
    }
    // Long side forward, short side across, and flatter than it is wide.
    const long = Math.max(...def.size) * CELL;
    const short = Math.min(...def.size) * CELL;
    const box = new Mesh(this.geometry, this.material);
    box.scale.set(short, short * 0.6, long);
    box.position.z = -long / 2 + short / 2; // the hand holds its near end
    const lens = new Object3D();
    lens.name = LENS;
    lens.position.z = -long + short / 2;
    return new Group().add(box, lens);
  }
}
