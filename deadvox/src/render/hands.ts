// What you hold, in first person (DESIGN.md, "Hands: what you see is what's there"):
// the right hand, the left hand, or both for a two-handed item. Held items are drawn
// after the world, in their own scene with the depth buffer cleared, so they never
// clip into walls. World point lights cannot illuminate this scene; burning fallback
// models need their own flame or self-lit material to stay visible at night. An item
// without a model (or whose model hasn't loaded) is a plain box sized from its cells.

import {
  Box3,
  BoxGeometry,
  type BufferGeometry,
  ConeGeometry,
  DirectionalLight,
  DoubleSide,
  Euler,
  Group,
  HemisphereLight,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PerspectiveCamera,
  Quaternion,
  RingGeometry,
  Scene,
  Vector3,
  type WebGLRenderer,
} from 'three';
import { type AimFrame, NEUTRAL_AIM } from '../core/aim.ts';
import { dominantSide } from '../core/character.ts';
import type { FigureDef, ModelDef } from '../core/content.ts';
import type { Vec3 } from '../core/coords.ts';
import type { Job } from '../core/handling.ts';
import {
  HOLD,
  heldAnchorOffset,
  heldFirearmTransform,
  heldGripOffset,
  modelToView,
  readyFirearmPose,
} from '../core/heldPose.ts';
import type { HandSide, Inventory } from '../core/inventory.ts';
import { defOf, type Item } from '../core/items.ts';
import { interpolateHandPose, type MeleePoseFrame, readyMeleePose } from '../core/meleePose.ts';
import { opticWindowDistance, PLAYER_VIEW_FOV_DEGREES } from '../core/opticWindow.ts';
import { HELD_DISPLAY_KIND } from '../core/schema.ts';
import { createCompass } from './compass.ts';
import {
  type FirearmAction,
  type FirearmMode,
  type HeldActionPart,
  magazineMotion,
  poseActionParts,
  rackCant,
  rackGrip,
  sampleActionStroke,
} from './firearmModel.ts';
import { itemLook } from './itemLook.ts';
import { type ComposedSlot, LENS, type ModelLibrary } from './models.ts';
import { createFirstPersonArm, FIRST_PERSON_SHOULDER, placeFirstPersonSegment } from './playerFigure.ts';
import { rummageFrame, rummageGrip } from './rummagePose.ts';
import { shellLoadPose } from './shellLoadPose.ts';
import type { SkyTargets } from './sky.ts';

/** Metres per grid cell for the stand-in box. */
const CELL = 0.06;
const TORSO_Y_AXIS = new Vector3(0, 1, 0);
/** Presentation: how far a gun turns, muzzle in and up and rolled, so a magazine change or a rack is seen. */
const PRESENT_YAW_RADIANS = 0.45;
const PRESENT_ROLL_RADIANS = 0.5;
const PRESENT_PITCH_RADIANS = 0.2;

export interface HeldFirearmPose {
  readonly uid: number;
  readonly mode: FirearmMode | 'load' | 'magazine';
  readonly elapsed: number;
  readonly duration?: number;
  readonly roundType?: string;
  readonly magazine?: { readonly removeShare: number; readonly incoming?: string };
}

/** A world point the off hand reaches for, and how far it has gone from its grip there. */
interface OffHandGrip {
  readonly point: Vector3;
  readonly reach: number;
}

interface HeldReadiness {
  readonly uid: number;
  readonly progress: number;
  readonly aimingDownSights: boolean;
}

export interface HeldHandlingFrame {
  readonly firearms: readonly HeldFirearmPose[];
  readonly readiness?: HeldReadiness;
  readonly aim?: AimFrame;
  readonly job?: Readonly<Job> | undefined;
}

export class HeldItems {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(PLAYER_VIEW_FOV_DEGREES, 1, 0.01, 10);
  /** Turned like the main camera each frame, so the sky's light directions carry over as they are. */
  private readonly view = new Group();
  private readonly opticWindow = new Mesh(
    new RingGeometry(0.01, 0.011, 64),
    new MeshBasicMaterial({
      color: 0x0b_0c_0d,
      side: DoubleSide,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  /** First-person shoulder frame; unlike the camera, this can twist during an unarmed strike. */
  private readonly torso = new Group();
  private readonly light = new DirectionalLight();
  private readonly ambient = new HemisphereLight();
  private readonly geometry = new BoxGeometry(1, 1, 1);
  private readonly flameGeometry = new ConeGeometry(1, 1, 6);
  private readonly material = new MeshLambertMaterial({ color: 0x6b_66_60 });
  private readonly lightMaterials = new Map<string, MeshBasicMaterial | MeshLambertMaterial>();
  private readonly flameMaterials = new Map<string, MeshBasicMaterial>();
  private readonly inventory: Inventory;
  private readonly models: ModelLibrary | undefined;
  private drawn = '';
  /** What's drawn for each held item, by uid. */
  private readonly shown = new Map<number, Object3D>();
  private readonly compasses = new Map<number, ReturnType<typeof createCompass>>();
  private readonly firearmParts = new Map<number, { action: FirearmAction; parts: readonly HeldActionPart[] }>();
  private readonly pumpModels = new Map<number, ModelDef>();
  /** Each held gun's magazine slot, with what is really fitted there (DESIGN.md, "One item, one look"). */
  private readonly magazineSlots = new Map<number, ComposedSlot>();
  private readonly incomingMagazines = new Map<number, { object: Object3D; model: string }>();
  private readonly loadingShells = new Map<number, Object3D>();
  private readonly arms = new Map<HandSide, Group>();
  private readonly armLengths = new Map<Group, readonly [number, number]>();
  private readonly handBases = new Map<HandSide, Vec3>();
  private readonly heldByHand = new Map<HandSide, Object3D>();
  private readonly relativeCamera = new Quaternion();
  private readonly opticWindowRotation = new Quaternion();
  private readonly baseCameraQuaternion = new Quaternion();
  private opticWindowShape = '';
  private readonly lockedCamera = new Quaternion();
  private readonly poseRotation = new Quaternion();
  private readonly recoilRotation = new Quaternion();
  private readonly rackRotation = new Quaternion();
  private readonly aimRotation = new Quaternion();
  private readonly poseEuler = new Euler();
  private readonly handPosition = new Vector3();
  private readonly pivotPosition = new Vector3();
  private rummageSupportRest: { arm: Group; position: Vector3 } | undefined;

  private readonly palette: FigureDef['palette'];

  constructor(inventory: Inventory, models: ModelLibrary | undefined, palette: FigureDef['palette']) {
    this.inventory = inventory;
    this.models = models;
    this.palette = palette;
    this.opticWindow.visible = false;
    this.opticWindow.renderOrder = 100;
    this.view.add(this.torso, this.opticWindow);
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
  update(
    main: PerspectiveCamera,
    pose?: MeleePoseFrame,
    recoil = 0,
    handling: HeldHandlingFrame = { firearms: [] },
  ): void {
    const { firearms: firearmPoses, readiness } = handling;
    const baseCameraQuaternion = main.quaternion.clone();
    this.baseCameraQuaternion.copy(baseCameraQuaternion);
    this.restoreRummageSupport();
    this.sync();
    this.poseFirearms(firearmPoses);
    const loweredPitchRadians =
      this.inventory.registry.skills.get('firearms_combat')?.combat?.firearms?.loweredPitchRadians ?? 0;
    const leadingSide = dominantSide(this.inventory.character);
    const readyPose = readiness ? readyFirearmPose(leadingSide) : undefined;
    const readyAmount = readiness ? Math.max(0, Math.min(1, readiness.progress)) : 0;
    const easedReady = readyAmount * readyAmount * (3 - 2 * readyAmount);
    let adsSightWorld: Vector3 | undefined;
    let adsSightUpWorld: Vector3 | undefined;
    this.torso.rotation.y = pose?.torsoYaw ?? 0;
    this.opticWindow.visible = false;
    for (const side of ['right', 'left'] as const) {
      const sights = this.poseHeldHand({
        side,
        main,
        pose,
        recoil,
        handling,
        leadingSide,
        readyPose,
        readyAmount,
        easedReady,
        loweredPitchRadians,
      });
      adsSightWorld = sights.direction ?? adsSightWorld;
      adsSightUpWorld = sights.up ?? adsSightUpWorld;
    }
    if (adsSightWorld && adsSightUpWorld) {
      const currentForward = new Vector3(0, 0, -1).applyQuaternion(main.quaternion);
      const alignSight = new Quaternion().setFromUnitVectors(currentForward, adsSightWorld);
      main.quaternion.premultiply(alignSight);
      const cameraUp = new Vector3(0, 1, 0).applyQuaternion(main.quaternion);
      const roll = Math.atan2(
        adsSightWorld.dot(cameraUp.clone().cross(adsSightUpWorld)),
        cameraUp.dot(adsSightUpWorld),
      );
      main.quaternion.premultiply(new Quaternion().setFromAxisAngle(adsSightWorld, roll));
      main.rotation.setFromQuaternion(main.quaternion, 'YXZ');
      main.updateMatrixWorld(true);
    }
    this.camera.quaternion.copy(main.quaternion);
    this.view.quaternion.copy(baseCameraQuaternion);
    this.view.updateMatrixWorld(true);
    this.poseRummage(pose, handling);
    for (const compass of this.compasses.values()) {
      compass.update(main.rotation.y);
    }
    for (const [side, arm] of this.arms) {
      this.updateArmChain(side, arm);
    }
    this.view.updateMatrixWorld(true);
  }

  private poseHeldHand({
    side,
    main,
    pose,
    recoil,
    handling,
    leadingSide,
    readyPose,
    readyAmount,
    easedReady,
    loweredPitchRadians,
  }: {
    side: HandSide;
    main: PerspectiveCamera;
    pose: MeleePoseFrame | undefined;
    recoil: number;
    handling: HeldHandlingFrame;
    leadingSide: HandSide;
    readyPose: ReturnType<typeof readyMeleePose> | undefined;
    readyAmount: number;
    easedReady: number;
    loweredPitchRadians: number;
  }): { direction?: Vector3; up?: Vector3 } {
    const neutral = { offset: [0, 0, 0] as Vec3, rotation: [0, 0, 0] as Vec3 };
    const hand = pose?.[side] ?? neutral;
    const target = readyPose?.[side];
    const stanceHand = target
      ? {
          offset: hand.offset.map((value, index) => value + (target.offset[index]! - value) * easedReady) as Vec3,
          rotation: hand.rotation.map((value, index) => value + (target.rotation[index]! - value) * easedReady) as Vec3,
        }
      : hand;
    const base = this.handBases.get(side);
    const arm = this.arms.get(side);
    if (!(base && arm)) {
      return {};
    }
    const transform = interpolateHandPose(base, stanceHand);
    this.poseRotation.setFromEuler(this.poseEuler.set(...transform.rotation, 'YXZ'));
    this.applyViewPose(main, pose, transform);
    this.lockCutBladeRoll(side, pose);
    const item = this.inventory.hands[side];
    const itemDefinition = item && defOf(this.inventory.registry, item.type);
    return this.poseHeldItem({
      side,
      main,
      recoil,
      handling,
      leadingSide,
      readyAmount,
      loweredPitchRadians,
      arm,
      transform,
      item,
      itemDefinition,
    });
  }

  private poseHeldItem({
    side,
    main,
    recoil,
    handling,
    leadingSide,
    readyAmount,
    loweredPitchRadians,
    arm,
    transform,
    item,
    itemDefinition,
  }: {
    side: HandSide;
    main: PerspectiveCamera;
    recoil: number;
    handling: HeldHandlingFrame;
    leadingSide: HandSide;
    readyAmount: number;
    loweredPitchRadians: number;
    arm: Group;
    transform: ReturnType<typeof interpolateHandPose>;
    item: Item | undefined;
    itemDefinition: ReturnType<typeof defOf> | undefined;
  }): { direction?: Vector3; up?: Vector3 } {
    const presentation = this.heldFirearmPresentation({
      side,
      main,
      handling,
      leadingSide,
      readyAmount,
      loweredPitchRadians,
      item,
      itemDefinition,
    });
    const { firearmPose, firearmReadiness, aimingDownSights, sights, modelDefinition } = presentation;
    if (firearmPose) {
      transform.offset = [...firearmPose.rootOffset];
      if (aimingDownSights) {
        transform.rotation = firearmPose.aimingRotation ?? [0, 0, 0];
        this.poseRotation.setFromEuler(this.poseEuler.set(...transform.rotation, 'YXZ'));
      }
    }
    const pumpModel = item && this.pumpModels.get(item.uid);
    const frame = item && handling.firearms.find((entry) => entry.uid === item.uid);
    const cant = rackCant(pumpModel, side, frame, { x: transform.offset[0], y: transform.offset[1] });
    const loweredPitch = itemDefinition?.firearm ? -loweredPitchRadians * (1 - firearmReadiness) : 0;
    const readyAim = handling.readiness?.uid === item?.uid && readyAmount >= 1 ? handling.aim : undefined;
    this.poseAim(item, readyAim);
    const shown = this.handlingPresentation(item, frame) * (side === 'right' ? 1 : -1);
    this.rackRotation.setFromEuler(
      this.poseEuler.set(
        loweredPitch + Math.abs(shown) * PRESENT_PITCH_RADIANS,
        shown * PRESENT_YAW_RADIANS,
        cant - shown * PRESENT_ROLL_RADIANS,
        'YXZ',
      ),
    );
    this.poseRotation.multiply(this.rackRotation);
    const strength = Math.max(0, Math.min(1, recoil));
    transform.offset[1] += 0.012 * strength;
    transform.offset[2] += 0.025 * strength;
    this.recoilRotation.setFromEuler(this.poseEuler.set(-0.08 * strength, 0, 0, 'YXZ'));
    this.poseRotation.multiply(this.recoilRotation);
    this.placeHandAndHeldItem(side, arm, transform, firearmPose);
    if (item && itemDefinition?.firearm) {
      const opticSight = Boolean(aimingDownSights && modelDefinition?.sight?.kind === 'optic');
      const heldModel = this.shown.get(item.uid);
      if (heldModel) {
        heldModel.visible = !opticSight;
      }
      const ocularDiameter = modelDefinition?.sight?.ocularDiameterMetres;
      const apertureFill = this.inventory.registry.skills.get('firearms_combat')?.combat?.firearms?.adsApertureFill;
      this.updateOpticWindow({
        active: opticSight,
        diameter: ocularDiameter,
        fill: apertureFill,
        fov: main.fov,
        baseCamera: this.baseCameraQuaternion,
        aimedCamera: main.quaternion,
      });
    }
    return sights;
  }

  private heldFirearmPresentation({
    side,
    main,
    handling,
    leadingSide,
    readyAmount,
    loweredPitchRadians,
    item,
    itemDefinition,
  }: {
    side: HandSide;
    main: PerspectiveCamera;
    handling: HeldHandlingFrame;
    leadingSide: HandSide;
    readyAmount: number;
    loweredPitchRadians: number;
    item: Item | undefined;
    itemDefinition: ReturnType<typeof defOf> | undefined;
  }) {
    const modelDefinition = itemDefinition?.model
      ? this.inventory.registry.models.get(itemDefinition.model)
      : undefined;
    const firearmReadiness = handling.readiness?.uid === item?.uid ? readyAmount : 0;
    const aimingDownSights = Boolean(
      item && handling.readiness?.uid === item.uid && handling.readiness.aimingDownSights,
    );
    const firearmPose =
      itemDefinition?.firearm && modelDefinition
        ? heldFirearmTransform({
            model: modelDefinition,
            side,
            leadingSide,
            twoHanded: Boolean(itemDefinition.twoHanded),
            progress: firearmReadiness,
            aimingDownSights,
            aimFrame: handling.aim ?? NEUTRAL_AIM,
            loweredPitchRadians,
            adsApertureFill: this.inventory.registry.skills.get('firearms_combat')?.combat?.firearms?.adsApertureFill,
            verticalFovDegrees: main.fov,
          })
        : undefined;
    const sights =
      aimingDownSights && firearmPose?.sightDirection && firearmPose.sightUp
        ? {
            direction: new Vector3(...firearmPose.sightDirection).applyQuaternion(main.quaternion).normalize(),
            up: new Vector3(...firearmPose.sightUp).applyQuaternion(main.quaternion).normalize(),
          }
        : {};
    return { firearmPose, firearmReadiness, aimingDownSights, sights, modelDefinition };
  }

  private placeHandAndHeldItem(
    side: HandSide,
    arm: Group,
    transform: ReturnType<typeof interpolateHandPose>,
    firearmPose: ReturnType<typeof heldFirearmTransform> | undefined,
  ): void {
    if (arm.parent === this.torso) {
      if (firearmPose) {
        arm.position.set(...transform.offset);
      } else {
        this.placeTorsoArm(side, arm, transform);
      }
      arm.quaternion.copy(this.poseRotation);
    }
    const held = this.heldByHand.get(side);
    if (held) {
      this.placeHeldItem(held, arm, transform);
    }
  }

  private restoreRummageSupport(): void {
    // A support arm parented to an item needs its local rest restored before projecting the next frame.
    if (this.rummageSupportRest) {
      this.rummageSupportRest.arm.position.copy(this.rummageSupportRest.position);
      this.rummageSupportRest = undefined;
    }
  }

  private poseRummage(pose: MeleePoseFrame | undefined, handling: HeldHandlingFrame): void {
    if (handling.firearms.length > 0 || (handling.readiness?.progress ?? 0) > 0 || pose?.viewOrientation) {
      return;
    }
    const frame = rummageFrame(this.inventory, handling.job);
    if (!frame) {
      return;
    }
    const rests = new Map<HandSide, Vec3>();
    for (const [side, arm] of this.arms) {
      const rest = this.view.worldToLocal(arm.getWorldPosition(new Vector3()));
      rests.set(side, [rest.x, rest.y, rest.z]);
    }
    const otherSide = frame.holdingSide === 'right' ? 'left' : 'right';
    for (const side of [frame.holdingSide, otherSide] as const) {
      const arm = this.arms.get(side);
      const rest = rests.get(side);
      if (!(arm?.parent && rest)) {
        continue;
      }
      const grip = rummageGrip(rest, side, frame);
      if (arm.parent !== this.torso) {
        this.rummageSupportRest = { arm, position: arm.position.clone() };
      }
      arm.position.copy(arm.parent.worldToLocal(this.view.localToWorld(new Vector3(...grip))));
      const held = this.heldByHand.get(side);
      if (held) {
        this.placeHeldItem(held, arm, { offset: grip });
      }
      this.view.updateMatrixWorld(true);
    }
  }

  private updateOpticWindow({
    active,
    diameter,
    fill,
    fov,
    baseCamera,
    aimedCamera,
  }: {
    active: boolean;
    diameter: number | undefined;
    fill: number | undefined;
    fov: number;
    baseCamera: Quaternion;
    aimedCamera: Quaternion;
  }): void {
    if (!(active && diameter !== undefined && fill !== undefined)) {
      this.opticWindow.visible = false;
      return;
    }
    const distance = opticWindowDistance(diameter, fill, fov);
    const innerRadius = diameter / 2;
    const outerRadius = innerRadius * 1.12;
    const shape = `${innerRadius}:${outerRadius}`;
    if (shape !== this.opticWindowShape) {
      this.opticWindow.geometry.dispose();
      this.opticWindow.geometry = new RingGeometry(innerRadius, outerRadius, 64);
      this.opticWindowShape = shape;
    }
    this.opticWindow.position.set(0, 0, -distance);
    this.opticWindowRotation.copy(baseCamera).invert().multiply(aimedCamera);
    this.opticWindow.quaternion.copy(this.opticWindowRotation);
    this.opticWindow.visible = true;
  }

  /**
   * How far a magazine job or a rifle's rack turns the gun to show the hands at work, 0 to 1, from the job alone. The
   * pump turns its own port instead (`rackCant`).
   */
  private handlingPresentation(item: Item | undefined, frame: HeldFirearmPose | undefined): number {
    if (!(item && frame) || this.pumpModels.has(item.uid)) {
      return 0;
    }
    if (frame.mode === 'magazine' && frame.magazine && frame.duration !== undefined) {
      return magazineMotion(frame.elapsed, frame.duration, frame.magazine.removeShare).reach;
    }
    const action = frame.mode === 'hand' ? this.firearmParts.get(item.uid)?.action : undefined;
    return action ? rackGrip(action, frame.elapsed, frame.duration).reach : 0;
  }

  private poseAim(item: Item | undefined, aim: AimFrame | undefined): void {
    if (!(item && aim && defOf(this.inventory.registry, item.type).firearm)) {
      return;
    }
    this.aimRotation.setFromEuler(this.poseEuler.set(aim.pitch, aim.yaw, 0, 'YXZ'));
    this.poseRotation.premultiply(this.aimRotation);
  }

  private poseFirearms(frames: readonly HeldFirearmPose[]): void {
    for (const [uid, { action, parts }] of this.firearmParts) {
      const frame = frames.find((entry) => entry.uid === uid);
      const mode = frame?.mode === 'fire' || frame?.mode === 'hand' ? frame.mode : undefined;
      const stroke = frame && mode ? sampleActionStroke(action, mode, frame.elapsed, frame.duration) : 0;
      poseActionParts(parts, mode, stroke);
      this.updatePump(uid, frame, stroke);
      const held = this.shown.get(uid);
      if (held && !this.pumpModels.has(uid)) {
        const magazineGrip = this.poseMagazine(uid, frame);
        this.reachOffHand(uid, held, mode === 'hand' ? this.rackHandGrip(held, action, parts, frame!) : magazineGrip);
      }
    }
  }

  /** Where the off hand holds the charging handle through a hand cycle: on its middle, rearmost once it lets go. */
  private rackHandGrip(
    held: Object3D,
    action: FirearmAction,
    parts: readonly HeldActionPart[],
    frame: HeldFirearmPose,
  ): OffHandGrip | undefined {
    // A handle of its own moves only by hand; otherwise the hand works the carrier, as on an AK.
    const handle =
      parts.find((part) => !part.modes.includes('fire')) ?? parts.find((part) => part.modes.includes('hand'));
    const { reach, stroke } = rackGrip(action, frame.elapsed, frame.duration);
    const parent = handle?.node.parent;
    if (!(handle && parent && reach > 0)) {
      return undefined;
    }
    held.updateMatrixWorld(true);
    const middle = new Box3().setFromObject(handle.node).getCenter(new Vector3());
    const now = parent.localToWorld(handle.node.position.clone());
    const gripped = parent.localToWorld(handle.rest.clone().addScaledVector(handle.travel, stroke));
    return { point: middle.add(gripped.sub(now)), reach };
  }

  /** Plays a magazine job on the held gun: the fitted one leaves the well, the new one seats; returns the hand's grip. */
  private poseMagazine(uid: number, frame: HeldFirearmPose | undefined): OffHandGrip | undefined {
    const slot = this.magazineSlots.get(uid);
    if (!slot) {
      return undefined;
    }
    const motion =
      frame?.mode === 'magazine' && frame.magazine && frame.duration !== undefined
        ? magazineMotion(frame.elapsed, frame.duration, frame.magazine.removeShare)
        : undefined;
    const fitted = slot.model && slot.modelId ? { object: slot.model, model: slot.modelId } : undefined;
    if (fitted) {
      fitted.object.visible = motion === undefined || motion.outgoing !== undefined;
      this.placeMagazine(fitted, motion?.outgoing ?? 0);
    }
    const incoming = this.incomingMagazine(
      uid,
      slot.frame,
      motion?.incoming === undefined ? undefined : frame?.magazine?.incoming,
    );
    if (incoming) {
      this.placeMagazine(incoming, motion!.incoming!);
    }
    const moving = motion?.outgoing === undefined ? incoming : fitted;
    const bounds = moving && this.models?.partBounds(moving.model);
    if (!(moving && bounds && motion && motion.reach > 0)) {
      return undefined;
    }
    moving.object.updateWorldMatrix(true, false);
    return { point: moving.object.localToWorld(bounds.getCenter(new Vector3())), reach: motion.reach };
  }

  /** Slides a magazine out of its well along the slot's down axis by its own height, so it just clears. */
  private placeMagazine({ object, model }: { object: Object3D; model: string }, out: number): void {
    const bounds = this.models?.partBounds(model);
    const height = bounds ? bounds.max.y - bounds.min.y : 0;
    object.position.set(0, -out * height, 0);
  }

  /** The magazine a change is seating, drawn in the slot until the job ends; none outside its insert phase. */
  private incomingMagazine(
    uid: number,
    slot: Object3D,
    model: string | undefined,
  ): { object: Object3D; model: string } | undefined {
    const current = this.incomingMagazines.get(uid);
    if (current && current.model === model) {
      return current;
    }
    current?.object.removeFromParent();
    this.incomingMagazines.delete(uid);
    const object = model === undefined ? undefined : this.models?.part(model);
    if (!(model && object)) {
      return undefined;
    }
    slot.add(object);
    const entry = { object, model };
    this.incomingMagazines.set(uid, entry);
    return entry;
  }

  /** Moves a two-handed gun's off hand from its grip toward `grip`, or back onto its grip without one. */
  private reachOffHand(uid: number, held: Object3D, grip: OffHandGrip | undefined): void {
    const side = this.inventory.hands.right?.uid === uid ? 'left' : 'right';
    const arm = this.arms.get(side);
    const base = this.handBases.get(side);
    if (!(arm && base && arm.parent === held)) {
      return;
    }
    arm.position.set(...base);
    if (grip) {
      held.updateMatrixWorld(true);
      arm.position.lerp(held.worldToLocal(grip.point.clone()), grip.reach);
    }
  }

  private updatePump(uid: number, frame: HeldFirearmPose | undefined, stroke: number): void {
    const model = this.pumpModels.get(uid);
    const held = this.shown.get(uid);
    if (!(model && held)) {
      return;
    }
    const side = this.inventory.hands.right?.uid === uid ? 'left' : 'right';
    const arm = this.arms.get(side);
    const base = this.handBases.get(side);
    const part = model.action?.parts.forend;
    if (arm && base) {
      arm.position.set(...base);
      if (part) {
        const travel = modelToView(model, part.axis.map((value) => value * part.strokeMetres) as Vec3);
        arm.position.addScaledVector(new Vector3(...travel), stroke);
      }
    }
    const feed =
      frame?.mode === 'load' && arm && base
        ? shellLoadPose(base, heldAnchorOffset(model, 'loading_port'), side, frame)
        : undefined;
    if (feed) {
      arm?.position.set(...feed.wrist);
    }
    this.poseLoadingShell(uid, held, frame?.roundType, feed);
  }

  private poseLoadingShell(
    uid: number,
    held: Object3D,
    roundType: string | undefined,
    feed: ReturnType<typeof shellLoadPose>,
  ): void {
    if (!feed) {
      this.loadingShells.get(uid)?.removeFromParent();
      this.loadingShells.delete(uid);
      return;
    }
    let shell = this.loadingShells.get(uid);
    if (!shell && roundType) {
      const id = defOf(this.inventory.registry, roundType).model;
      shell = id ? this.models?.held(id)?.root : undefined;
      if (shell) {
        held.add(shell);
        this.loadingShells.set(uid, shell);
      }
    }
    if (shell) {
      // The round follows the feeding wrist until seated, without becoming a second inventory item.
      shell.position.set(...feed.shell);
      shell.visible = feed.visible;
    }
  }

  /** Keep the cutting edge's rest orientation while preserving the target forward axis. */
  private lockCutBladeRoll(side: HandSide, pose: MeleePoseFrame | undefined): void {
    const item = this.inventory.hands[side];
    if (!item || defOf(this.inventory.registry, item.type).weapon?.melee?.type !== 'cut') {
      return;
    }
    const rest = readyMeleePose(true, dominantSide(this.inventory.character))[side];
    const restOrientation = new Quaternion().setFromEuler(this.poseEuler.set(...rest.rotation, 'YXZ'));
    if (pose?.viewOrientation) {
      restOrientation.premultiply(this.relativeCamera);
    }
    const restForward = new Vector3(0, 0, -1).applyQuaternion(restOrientation).normalize();
    const currentForward = new Vector3(0, 0, -1).applyQuaternion(this.poseRotation).normalize();
    const swing = new Quaternion().setFromUnitVectors(restForward, currentForward);
    this.poseRotation.copy(swing.multiply(restOrientation));
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

  private placeHeldItem(held: Object3D, arm: Group, transform: { offset: Vec3 }): void {
    if (arm.parent === this.torso) {
      this.handPosition.copy(arm.position).applyQuaternion(this.torso.quaternion);
      held.position.copy(this.handPosition);
      held.quaternion.copy(this.torso.quaternion).multiply(arm.quaternion);
      return;
    }
    held.position.set(...transform.offset);
    held.quaternion.copy(this.poseRotation);
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

  /** World position for a held light without a model-specific lens anchor. */
  lightPositionOf(item: Item, main: PerspectiveCamera, out: Vector3): boolean {
    const visual = this.shown.get(item.uid);
    if (!visual) {
      return false;
    }
    if (this.lensOf(item, main, out)) {
      return true;
    }
    visual.getWorldPosition(out).add(main.position);
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
    this.disposeCompasses();
    this.clearArms();
    this.view.clear();
    this.view.add(this.torso, this.opticWindow);
    this.shown.clear();
    this.firearmParts.clear();
    this.pumpModels.clear();
    this.magazineSlots.clear();
    this.incomingMagazines.clear();
    this.loadingShells.clear();
    this.armLengths.clear();
    this.handBases.clear();
    this.heldByHand.clear();
    const { hands } = this.inventory;
    this.syncHand('right', hands.right);
    this.syncHand('left', hands.left);
    this.syncFistHand('right');
    this.syncFistHand('left');
  }

  private disposeCompasses(): void {
    for (const compass of this.compasses.values()) {
      compass.dispose();
    }
    this.compasses.clear();
  }

  /** Releases the spike's owned display resources on page teardown too. */
  dispose(): void {
    this.disposeCompasses();
    this.clearArms();
    for (const material of this.lightMaterials.values()) {
      material.dispose();
    }
    this.lightMaterials.clear();
    for (const material of this.flameMaterials.values()) {
      material.dispose();
    }
    this.flameMaterials.clear();
    this.flameGeometry.dispose();
    this.opticWindow.geometry.dispose();
    (this.opticWindow.material as MeshBasicMaterial).dispose();
    this.view.clear();
    this.shown.clear();
    this.heldByHand.clear();
    // A bfcache pageshow may resume this owner; its next update must rebuild disposed displays.
    this.drawn = '';
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
    // A permanently raised inspection pose keeps this small display legible without a new input route.
    const heldAt: Vec3 =
      def.heldDisplay === undefined
        ? heldGripOffset(side, Boolean(def.twoHanded))
        : [side === 'right' ? 0.14 : -0.14, -0.13, -0.3];
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
    const model = modelId ? this.inventory.registry.models.get(modelId) : undefined;
    if (model?.tube && model.anchors?.support) {
      const support = heldAnchorOffset(model, 'support');
      const offhandGrip: Vec3 = support.map((value, index) => value + heldAt[index]!) as Vec3;
      this.addArm(otherSide, offhandGrip, held, heldAt);
      return;
    }
    const pose = model?.hold;
    const offhandGrip: Vec3 =
      pose === 'upright' ? [heldAt[0], heldAt[1] + 0.14, heldAt[2]] : [heldAt[0], heldAt[1], heldAt[2] - 0.14];
    this.addArm(otherSide, offhandGrip, held, heldAt);
  }

  private shape(item: Item): Object3D {
    const def = defOf(this.inventory.registry, item.type);
    if (def.heldDisplay === HELD_DISPLAY_KIND.compass) {
      const compass = createCompass();
      this.compasses.set(item.uid, compass);
      return compass.group;
    }
    const look = itemLook(this.inventory.registry, item);
    const model = look && this.models?.heldLook(look);
    if (model) {
      const action = this.inventory.registry.models.get(def.model!)?.action;
      if (model.slots.magazine) {
        this.magazineSlots.set(item.uid, model.slots.magazine);
      }
      if (action) {
        this.firearmParts.set(item.uid, { action, parts: model.parts });
        const definition = this.inventory.registry.models.get(def.model!)!;
        if (definition.tube) {
          this.pumpModels.set(item.uid, definition);
        }
      }
      return model.root;
    }
    return this.fallbackShape(item, def);
  }

  private fallbackShape(item: Item, def: ReturnType<typeof defOf>): Object3D {
    // Long side forward, short side across, and flatter than it is wide.
    const long = Math.max(...def.size) * CELL;
    const short = Math.min(...def.size) * CELL;
    const materialKey = `${item.type}:${item.on ? 'lit' : 'unlit'}`;
    let material = def.light ? this.lightMaterials.get(materialKey) : undefined;
    if (def.light && !material) {
      material = item.on
        ? new MeshBasicMaterial({ color: def.light.color, toneMapped: false })
        : new MeshLambertMaterial({ color: def.light.color });
      this.lightMaterials.set(materialKey, material);
    }
    const box = new Mesh(this.geometry, material ?? this.material);
    if (item.on && def.light) {
      box.name = 'held-light-body';
    }
    box.scale.set(short, short * 0.6, long);
    box.position.z = -long / 2 + short / 2; // the hand holds its near end
    const lens = new Object3D();
    lens.name = LENS;
    lens.position.z = -long + short / 2;
    const shape = new Group().add(box, lens);
    if (item.on && def.light?.burning?.ignition === 'firestarter') {
      const flameMaterial =
        this.flameMaterials.get(def.light.color) ??
        new MeshBasicMaterial({
          color: def.light.color,
          toneMapped: false,
        });
      this.flameMaterials.set(def.light.color, flameMaterial);
      const flame = new Mesh(this.flameGeometry, flameMaterial);
      flame.name = 'held-light-flame';
      flame.scale.set(short * 0.5, short * 1.5, short * 0.5);
      flame.position.set(0, short * 1.05, lens.position.z);
      shape.add(flame);
    }
    return shape;
  }
}
