import {
  BoxGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from 'three';
import type { AimFrame } from '../core/aim.ts';
import type { FigureDef, ModelDef, Registry } from '../core/content.ts';
import type { Vec3 } from '../core/coords.ts';
import {
  type HeldFirearmTransformInput,
  type HeldHoldFrame,
  heldFirearmTransform,
  heldGripOffset,
  heldHoldFrame,
  heldProneSupportAt,
} from '../core/heldPose.ts';
import type { HandSide } from '../core/inventory.ts';
import { defOf, type Item } from '../core/items.ts';
import { type HandPose, interpolateHandPose } from '../core/meleePose.ts';
import type { ArmRigDef } from '../core/schema.ts';
import { type ArmRig, buildArmRig, solveArmRig } from './armRig.ts';
import { presentHeldDisplay } from './heldDisplay.ts';
import { applyItemEmissive, disposeItemEmissiveMaterials } from './itemEmissive.ts';
import { itemLook } from './itemLook.ts';
import { LENS, type ModelLibrary } from './models.ts';
import type { WornPresentation } from './playerFigure.ts';
import { WornModels } from './wornModels.ts';

const HOLD_STATES = { lowered: false, ready: true } as const;

export interface HeldPresentationFrame {
  readonly readiness?: { readonly uid: number; readonly progress: number; readonly aimingDownSights: boolean };
  readonly aim?: AimFrame;
}

export interface ItemHoldPose {
  name: string;
  itemType: string;
  side: HandSide;
  ready: boolean;
}

/** Registry-derived samples include model-less items: their fallback still has a hold. */
export const heldItemPoses = (registry: Registry): ItemHoldPose[] =>
  [...registry.items.keys()].flatMap((itemType) =>
    (['right', 'left'] as const).flatMap((side) =>
      Object.entries(HOLD_STATES).map(([state, ready]) => ({
        name: `${itemType}-${side}-${state}`,
        itemType,
        side,
        ready,
      })),
    ),
  );

/** Camera-independent ownership of held models, grip frames and articulated arms. */
export class HeldPresentation {
  readonly arms = new Map<HandSide, Group>();
  readonly armRigs = new Map<HandSide, ArmRig>();
  readonly handBases = new Map<HandSide, Vec3>();
  readonly gripAnchors = new Map<HandSide, Object3D>();
  readonly holds = new Map<HandSide, HeldHoldFrame>();
  readonly heldByHand = new Map<HandSide, Object3D>();
  readonly displayPalms = new Map<HandSide, Object3D>();
  private readonly wornFrames = new Map<string, Group>();
  private readonly baseParts = new Map<string, Object3D[]>();
  private readonly worn: WornModels | undefined;
  private readonly geometry = new BoxGeometry(1, 1, 1);
  private readonly material = new MeshLambertMaterial({ color: 0x6b_66_60 });
  private readonly lightMaterials = new Map<string, MeshBasicMaterial | MeshLambertMaterial>();

  readonly registry: Registry;
  readonly figure: FigureDef;
  readonly models: ModelLibrary | undefined;
  stockSeats: Readonly<Record<HandSide, Vec3>> | undefined;
  /** Lying prone and aiming down sights; the support hand then holds `proneSupport` and elbows take the ground. */
  private proneAdsOn = false;
  private readonly supportBases = new Map<HandSide, { readonly normal: Vec3; readonly prone: Vec3 }>();
  readonly frame: Object3D;
  readonly torso: Object3D;

  constructor(
    registry: Registry,
    figure: FigureDef,
    models: ModelLibrary | undefined,
    { frame, torso }: { frame: Object3D; torso: Object3D },
  ) {
    this.registry = registry;
    this.figure = figure;
    this.models = models;
    this.worn = models && new WornModels(figure, models, this.wornFrames, this.baseParts);
    this.frame = frame;
    this.torso = torso;
  }

  set proneAds(on: boolean) {
    this.proneAdsOn = on;
    for (const [side, bases] of this.supportBases) {
      const at = on ? bases.prone : bases.normal;
      this.handBases.set(side, at);
      // A support arm rides in the held group, so moving its mount point is moving the hand on the gun.
      this.arms.get(side)?.position.set(...at);
    }
  }

  syncWorn(source?: WornPresentation): void {
    this.worn?.sync(source);
  }

  clear(): void {
    this.worn?.clear();
    this.wornFrames.clear();
    this.baseParts.clear();
    for (const held of this.heldByHand.values()) {
      disposeItemEmissiveMaterials(held);
    }
    for (const object of [...this.arms.values(), ...this.heldByHand.values()]) {
      object.removeFromParent();
    }
    this.arms.clear();
    this.armRigs.clear();
    this.handBases.clear();
    this.supportBases.clear();
    this.gripAnchors.clear();
    this.holds.clear();
    this.heldByHand.clear();
    this.displayPalms.clear();
  }

  model(item: Item): ReturnType<ModelLibrary['heldLook']> {
    const look = itemLook(this.registry, item);
    const model = look && this.models?.heldLook(look);
    if (model) {
      const def = defOf(this.registry, item.type);
      applyItemEmissive(model.root, item, def, def.model ? this.registry.models.get(def.model) : undefined);
    }
    return model;
  }

  firearmTransform(input: Omit<HeldFirearmTransformInput, 'holds'>): ReturnType<typeof heldFirearmTransform> {
    return heldFirearmTransform({
      ...input,
      holds: this.figure.holds,
      stockSeat: input.stockSeat ?? this.stockSeats?.[input.side],
    });
  }

  handTransform(side: HandSide, pose: HandPose): ReturnType<typeof interpolateHandPose> | undefined {
    const base = this.handBases.get(side);
    return base && interpolateHandPose(base, pose);
  }

  place(
    side: HandSide,
    transform: ReturnType<typeof interpolateHandPose>,
    { rotation, shoulder, firearm }: { rotation: Quaternion; shoulder: Vector3; firearm: boolean },
  ): void {
    const arm = this.arms.get(side);
    if (!arm) {
      return;
    }
    if (arm.parent === this.torso) {
      if (!firearm) {
        const torso = this.torsoRotation();
        const grip = new Vector3(...transform.offset).applyQuaternion(torso.invert());
        const rig = this.armRigs.get(side);
        if (rig) {
          const reach =
            rig.upperLength + rig.foreLength + rig.gripFromWrist.length() + this.figure.holds.reachLeadMetres;
          if (shoulder.distanceTo(grip) > reach) {
            grip.sub(shoulder).normalize().multiplyScalar(reach).add(shoulder);
          }
        }
        transform.offset = [grip.x, grip.y, grip.z];
      }
      arm.position.set(...transform.offset);
      arm.quaternion.copy(rotation);
    }
    const held = this.heldByHand.get(side);
    if (held) {
      this.placeHeld(held, arm, transform, rotation);
    }
  }

  private torsoRotation(): Quaternion {
    return this.frame
      .getWorldQuaternion(new Quaternion())
      .invert()
      .multiply(this.torso.getWorldQuaternion(new Quaternion()));
  }

  placeHeld(held: Object3D, arm: Group, transform: { offset: Vec3 }, rotation: Quaternion): void {
    if (arm.parent === this.torso) {
      const torso = this.torsoRotation();
      held.position.copy(arm.position).applyQuaternion(torso);
      held.quaternion.copy(torso).multiply(arm.quaternion);
    } else {
      held.position.set(...transform.offset);
      held.quaternion.copy(rotation);
    }
  }

  shape(item: Item): Object3D {
    return this.model(item)?.root ?? this.fallback(item);
  }

  fallback(item: Item, flame?: (color: string) => Object3D): Object3D {
    const def = defOf(this.registry, item.type);
    const long = Math.max(...def.size) * 0.06;
    const short = Math.min(...def.size) * 0.06;
    const key = `${item.type}:${item.on ? 'lit' : 'unlit'}`;
    let material = def.light ? this.lightMaterials.get(key) : undefined;
    if (def.light && !material) {
      material = item.on
        ? new MeshBasicMaterial({ color: def.light.color, toneMapped: false })
        : new MeshLambertMaterial({ color: def.light.color });
      this.lightMaterials.set(key, material);
    }
    const box = new Mesh(this.geometry, material ?? this.material);
    if (item.on && def.light) {
      box.name = 'held-light-body';
    }
    box.scale.set(short, short * 0.6, long);
    box.position.z = -long / 2 + short / 2;
    const lens = new Object3D();
    lens.name = LENS;
    lens.position.z = -long + short / 2;
    const shape = new Group().add(box, lens);
    if (flame && item.on && def.light?.burning?.ignition === 'firestarter') {
      const mesh = flame(def.light.color);
      mesh.scale.set(short * 0.5, short * 1.5, short * 0.5);
      mesh.position.set(0, short * 1.05, lens.position.z);
      shape.add(mesh);
    }
    return shape;
  }

  warmUp(): Mesh {
    const mesh = new Mesh(this.geometry, this.material);
    mesh.receiveShadow = true;
    mesh.visible = false;
    return mesh;
  }

  dispose(): void {
    this.clear();
    this.geometry.dispose();
    this.material.dispose();
    for (const material of this.lightMaterials.values()) {
      material.dispose();
    }
    this.lightMaterials.clear();
  }

  addItem(side: HandSide, item: Item, shape: (item: Item) => Object3D = (value) => this.shape(value)): Group {
    const def = defOf(this.registry, item.type);
    const model = def.model === undefined ? undefined : this.registry.models.get(def.model);
    const heldAt: Vec3 =
      def.heldDisplay === undefined
        ? heldGripOffset({ side, twoHanded: Boolean(def.twoHanded), model, holds: this.figure.holds })
        : this.mirror(side, this.figure.holds.display);
    const held = new Group();
    held.name = `held-item-${side}`;
    held.position.set(...heldAt);
    held.add(shape(item));
    if (def.heldDisplay !== undefined && model?.display && this.models?.has(model.id)) {
      const palm = presentHeldDisplay(held.children[0]!, model.display, heldAt);
      held.add(palm);
      this.displayPalms.set(side, palm);
    }
    this.frame.add(held);
    this.heldByHand.set(side, held);
    this.addArm(side, heldAt, model?.hands?.firing.pose ?? (this.displayPalms.has(side) ? 'open' : 'holding'), {
      ...(model?.hands ? { hold: heldHoldFrame(model, side, 'firing') } : {}),
    });
    if (def.twoHanded) {
      this.addSupport(side, heldAt, model, held);
    }
    return held;
  }

  addFist(side: HandSide): void {
    this.addArm(side, this.mirror(side, this.figure.holds.oneHand), 'fist');
  }

  private mirror(side: HandSide, at: Vec3): Vec3 {
    return [side === 'right' ? at[0] : -at[0], at[1], at[2]];
  }

  private addSupport(side: HandSide, heldAt: Vec3, model: ModelDef | undefined, held: Group): void {
    const other = side === 'right' ? 'left' : 'right';
    const hold = model?.hands ? heldHoldFrame(model, side, 'support') : undefined;
    const offset =
      hold?.at ??
      this.mirror(
        side,
        model?.hold === 'upright' ? this.figure.holds.supportUpright : this.figure.holds.supportForward,
      );
    const grip = heldAt.map((value, index) => value + offset[index]!) as Vec3;
    this.addArm(other, grip, model?.hands?.support.pose ?? 'holding', {
      mount: { held, origin: heldAt },
      ...(hold ? { hold: { ...hold, at: [0, 0, 0] } } : {}),
    });
    if (model?.hands) {
      // The arm sits at the hold's offset from the held grip, so a closer hold is another offset on the same arm.
      this.supportBases.set(other, { normal: offset, prone: heldProneSupportAt(model, side) });
      this.proneAds = this.proneAdsOn;
    }
  }

  private addArm(
    side: HandSide,
    grip: Vec3,
    pose: keyof ArmRigDef['handPoses'],
    { mount, hold }: { mount?: { held: Group; origin: Vec3 }; hold?: HeldHoldFrame } = {},
  ): void {
    if (this.arms.has(side)) {
      return;
    }
    const arm = new Group();
    arm.name = `first-person-arm-${side}`;
    const anchor = new Object3D();
    anchor.name = 'grip-anchor';
    if (hold) {
      anchor.position.set(...hold.at);
      anchor.quaternion.setFromRotationMatrix(
        new Matrix4().makeBasis(
          new Vector3(...hold.thumbSide),
          new Vector3(...hold.fingers),
          new Vector3(...hold.palm),
        ),
      );
      this.holds.set(side, hold);
    }
    arm.add(anchor);
    this.gripAnchors.set(side, anchor);
    const part = side === 'right' ? 'rightArm' : 'leftArm';
    const definition = this.registry.models.get(this.figure.limbs[part].model);
    const scene = definition && this.models?.has(definition.id) ? this.models.part(definition.id) : undefined;
    if (definition && scene) {
      scene.traverse((node) => {
        if (typeof node.userData.part === 'string') {
          const key = `${part}/${node.userData.part}`;
          const nodes = this.baseParts.get(key) ?? [];
          nodes.push(node);
          this.baseParts.set(key, nodes);
        }
      });
      const rig = buildArmRig({ definition, scene }, this.figure.armRig, side, this.figure.armRig.handPoses[pose]);
      arm.add(rig.shoulder, rig.elbow, rig.hand);
      this.armRigs.set(side, rig);
      for (const [name, entry] of Object.entries(this.figure.attachmentFrames)) {
        if (entry.part !== part) {
          continue;
        }
        const parent = rig.attachmentParents.get(entry.pivot)!;
        const frame = new Group();
        frame.name = `wear-frame-${name}`;
        frame.position.set(...entry.at);
        frame.rotation.set(...(entry.turn.map((degrees) => (degrees * Math.PI) / 180) as Vec3));
        parent.add(frame);
        this.wornFrames.set(name, frame);
      }
    }
    const origin = mount?.origin ?? [0, 0, 0];
    const at = grip.map((value, index) => value - origin[index]!) as Vec3;
    arm.position.set(...at);
    this.arms.set(side, arm);
    this.handBases.set(side, at);
    arm.traverse((object) => {
      if (object instanceof Mesh) {
        object.receiveShadow = true;
      }
    });
    (mount?.held ?? this.torso).add(arm);
  }

  solve(side: HandSide, shoulder: Vector3, gripFrame?: Object3D): void {
    const rig = this.armRigs.get(side);
    const arm = this.arms.get(side);
    if (!(rig && arm)) {
      return;
    }
    const anchor = this.gripAnchors.get(side) ?? arm;
    const grip = this.frame.worldToLocal(anchor.getWorldPosition(new Vector3()));
    const rotation = this.frame.getWorldQuaternion(new Quaternion());
    const handFrame = gripFrame
      ? rotation.clone().invert().multiply(gripFrame.getWorldQuaternion(new Quaternion()))
      : undefined;
    const inverse = rotation.clone().invert();
    const right = new Vector3(1, 0, 0).applyQuaternion(rotation);
    right.y = 0;
    right.normalize().applyQuaternion(inverse);
    const up = new Vector3(0, 1, 0).applyQuaternion(inverse);
    const back = new Vector3().crossVectors(right, up);
    const down = Math.max(0, up.z);
    const pole = this.proneAdsOn ? this.figure.armRig.proneAdsElbowPole : this.figure.armRig.elbowPole;
    const [outward, vertical, backward] = pole.up.map(
      (value, axis) => value + (pole.down[axis]! - value) * down,
    ) as Vec3;
    const bendSide = right
      .multiplyScalar((side === 'right' ? 1 : -1) * outward)
      .addScaledVector(up, vertical)
      .addScaledVector(back, backward);
    const minimum = this.figure.armRig.minimumBendDegrees;
    const minimumBendDegrees = minimum.up + (minimum.down - minimum.up) * down;
    const solved = solveArmRig(rig, { shoulder, grip, handFrame, bendSide, up, minimumBendDegrees });
    const toArm = arm.getWorldQuaternion(new Quaternion()).invert().multiply(rotation);
    const place = (pivot: Object3D, at: Vector3, turn: Quaternion): void => {
      pivot.position.copy(arm.worldToLocal(this.frame.localToWorld(at.clone())));
      pivot.quaternion.copy(toArm).multiply(turn);
    };
    place(rig.shoulder, solved.shoulder, solved.upper);
    rig.shoulder.scale.set(1, solved.upperScale, 1);
    place(rig.elbow, solved.elbow, solved.fore);
    rig.elbow.scale.set(1, solved.foreScale, 1);
    place(rig.hand, grip, solved.hand);
  }
}
