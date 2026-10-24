// What you hold, in first person (`DESIGN.md`, "Hands: what you see is what's there"):
// the right hand, the left hand, or both for a two-handed item. Held items are drawn
// after the world, in their own scene with the depth buffer cleared, so they never
// clip into walls. The scene receives only the world's sun, its shadow and the sky's
// ambient light, so no nearby lamp or fire lights a held item, and burning fallback
// models need their own flame or self-lit material. An item
// without a model (or whose model hasn't loaded) is a plain box sized from its cells.

import {
  Box3,
  BoxGeometry,
  DirectionalLight,
  DoubleSide,
  Euler,
  Group,
  HemisphereLight,
  MathUtils,
  Matrix4,
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
import { CORE_CONTENT_IDS } from '../core/contentIds.ts';
import type { Vec3 } from '../core/coords.ts';
import type { Job } from '../core/handling.ts';
import {
  type HeldHoldFrame,
  HOLD,
  heldAnchorOffset,
  heldFirearmTransform,
  heldGripOffset,
  heldHoldFrame,
  modelToView,
  readyFirearmPose,
  throwStanceHandOffset,
} from '../core/heldPose.ts';
import type { HandSide, Inventory } from '../core/inventory.ts';
import { defOf, type Item } from '../core/items.ts';
import { isInHeldItemSlotTree } from '../core/itemTree.ts';
import { interpolateHandPose, type MeleePoseFrame, readyMeleePose } from '../core/meleePose.ts';
import type { OpticLensFrame, OpticViewSettings, OpticZoomFrame } from '../core/opticView.ts';
import { mountedOptic, opticViewSettings, projectLensAperture } from '../core/opticView.ts';
import { opticWindowDistance, PLAYER_VIEW_FOV_DEGREES } from '../core/opticWindow.ts';
import { revolverChamberPoint } from '../core/revolverPose.ts';
import { type ArmRigDef, HELD_DISPLAY_KIND } from '../core/schema.ts';
import { firearmsCombatTuning } from '../core/skillTraining.ts';
import { type ArmRig, buildArmRig, solveArmRig } from './armRig.ts';
import { createCompass } from './compass.ts';
import {
  type FirearmAction,
  type FirearmMode,
  type HeldActionPart,
  magazineMotion,
  poseActionParts,
  poseRevolverParts,
  rackGrip,
  revolverOpenAmount,
  sampleActionPose,
} from './firearmModel.ts';
import { sightedFirearmModel } from './firearmSight.ts';
import { grabPose } from './grabPose.ts';
import { handlingRotation } from './handlingTurn.ts';
import { presentHeldDisplay } from './heldDisplay.ts';
import { applyItemEmissive, disposeItemEmissiveMaterials } from './itemEmissive.ts';
import { itemLook } from './itemLook.ts';
import {
  createMagazineLoadFrame,
  createMagazinePress,
  createMagazineRaise,
  MAGAZINE_LOAD_POSE,
  magazinePress,
  readMagazineLoadFrame,
  stepMagazineRaise,
} from './magazineLoadPose.ts';
import { ModelFlames } from './modelFlame.ts';
import { modelMaterialWarmUp } from './modelMaterials.ts';
import { type ComposedSlot, heldModelFrame, LENS, type ModelLibrary } from './models.ts';
import { firstPersonShoulder } from './playerFigure.ts';
import { rummageFrame, rummageGrip } from './rummagePose.ts';
import { shellLoadPose } from './shellLoadPose.ts';
import type { SkyTargets } from './sky.ts';

/** Metres per grid cell for the stand-in box. */
const CELL = 0.06;
const TORSO_Y_AXIS = new Vector3(0, 1, 0);
const VIEW_X_AXIS = new Vector3(1, 0, 0);

const addShadowReceiver = (parent: Object3D, child: Object3D): void => {
  parent.add(child);
  child.traverse((object) => {
    if ((object as Mesh).isMesh) {
      object.receiveShadow = true;
    }
  });
};
/** A torso arm places its held item from its own position, so it needs no separate offset. */
const ARM_PLACED = { offset: [0, 0, 0] as Vec3 };
/**
 * Presentation estimate: the pressing wrist sits beside the round, on its own side and a little above, in view
 * metres for a magazine in the right hand; the left mirrors it. Beside, not over, so the round stays in view.
 */
const THUMB_PRESS_WRIST: Vec3 = [-0.05, 0.012, 0.01];

export interface HeldFirearmPose {
  readonly uid: number;
  readonly mode: FirearmMode | 'load' | 'magazine' | 'revolver';
  readonly revolver?: import('../game/revolverHandling.ts').RevolverFrame;
  readonly elapsed: number;
  readonly duration?: number;
  readonly roundType?: string;
  readonly actionOpen?: boolean;
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

/** The hand a carried item's tree path is rooted in. */
const HELD_ROOT_PATH = /^inventory\.hands\.(left|right)\./;

export interface HeldHandlingFrame {
  readonly firearms: readonly HeldFirearmPose[];
  readonly opticZoom?: OpticZoomFrame | undefined;
  readonly readiness?: HeldReadiness;
  readonly throwing?: { readonly chargeProgress: number };
  readonly aim?: AimFrame;
  readonly job?: Readonly<Job> | undefined;
  readonly grab?: { readonly progress: number };
  /** The frame's real seconds, used only to raise and lower a magazine being loaded. */
  readonly dt?: number;
  /** Metres the arms and held item are raised, to show a blow deflected. */
  readonly lift?: number;
}

export class HeldItems {
  private readonly scene = new Scene();
  private visor: Object3D | undefined;
  private readonly visorMaterials: MeshBasicMaterial[] = [];
  private readonly camera = new PerspectiveCamera(PLAYER_VIEW_FOV_DEGREES, 1, 0.01, 10);
  /** Turned and translated with the main camera so shadow lookups use world positions. */
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
  private skyVisibility = 1;
  private readonly geometry = new BoxGeometry(1, 1, 1);
  private readonly flames = new ModelFlames('held-light-flame');
  private readonly material = new MeshLambertMaterial({ color: 0x6b_66_60 });
  private readonly lightMaterials = new Map<string, MeshBasicMaterial | MeshLambertMaterial>();
  private readonly inventory: Inventory;
  private readonly models: ModelLibrary | undefined;
  private readonly sunSource: DirectionalLight | undefined;
  private drawn = '';
  /** What's drawn for each held item, by uid. */
  private readonly shown = new Map<number, Object3D>();
  private readonly attached: Object3D[] = [];
  private readonly compasses = new Map<number, ReturnType<typeof createCompass>>();
  private readonly firearmParts = new Map<number, { action?: FirearmAction; parts: readonly HeldActionPart[] }>();
  private readonly cylinderRounds = new Map<number, { key: string; group: Group }>();
  private readonly pumpModels = new Map<number, ModelDef>();
  /** Each held gun's magazine slot, with what is really fitted there (`DESIGN.md`, "Piles and item models"). */
  private readonly magazineSlots = new Map<number, ComposedSlot>();
  private readonly incomingMagazines = new Map<number, { object: Object3D; model: string }>();
  private readonly loadingShells = new Map<number, Object3D>();
  /** Each held magazine's top round seat, in its model's frame, with that round's tilt. */
  private readonly magazineSeats = new Map<number, { readonly seat: Object3D; readonly tiltRadians: number }>();
  /** The round the off hand presses into a magazine or strips from it; one at a time. */
  private magazineRound: { object: Object3D; type: string; uid: number } | undefined;
  private readonly magazineFrame = createMagazineLoadFrame();
  private readonly magazineRaise = createMagazineRaise();
  private readonly magazinePressPose = createMagazinePress();
  private readonly magazineTarget = new Vector3();
  private readonly magazineWrist = new Vector3();
  private readonly magazineTilt = new Quaternion();
  private readonly arms = new Map<HandSide, Group>();
  /** Each arm's rigged model, once its model has loaded; an arm without one is only its grip point. */
  private readonly armRigs = new Map<HandSide, ArmRig>();
  private readonly handBases = new Map<HandSide, Vec3>();
  /** Each arm's grip point: the arm's own origin, or a hold authored beside it. */
  private readonly gripAnchors = new Map<HandSide, Object3D>();
  /** The authored hold each arm's grip anchor carries (a long gun's grip or forend). */
  private readonly holds = new Map<HandSide, HeldHoldFrame>();
  /** The sides whose hand has left its hold this frame, to work the gun; the hand then follows its forearm. */
  private readonly handsOff = new Set<HandSide>();
  private readonly heldByHand = new Map<HandSide, Object3D>();
  /** The frame each hand's palm takes behind a held screen. */
  private readonly displayPalms = new Map<HandSide, Object3D>();
  private readonly relativeCamera = new Quaternion();
  private opticWindowShape = '';
  private opticViewFrame: OpticLensFrame | undefined;
  private readonly lockedCamera = new Quaternion();
  private readonly poseRotation = new Quaternion();
  private readonly recoilRotation = new Quaternion();
  private readonly rackRotation = new Quaternion();
  private readonly aimRotation = new Quaternion();
  private readonly poseMatrix = new Matrix4();
  private readonly poseEuler = new Euler();
  private readonly handPosition = new Vector3();
  private readonly opticRootRight = new Vector3();
  private readonly opticRootUp = new Vector3();
  private readonly opticRootBack = new Vector3();
  private readonly opticForward = new Vector3();
  private readonly opticUp = new Vector3();
  private readonly opticRight = new Vector3();
  private readonly opticEye = new Vector3();
  private readonly opticEyeOffset = new Vector3();
  private readonly opticBack = new Vector3();
  private readonly opticBaseRotation = new Quaternion();
  private readonly opticBaseInverse = new Quaternion();
  private rummageSupportRest: { arm: Group; position: Vector3 } | undefined;

  /** The player's figure row: names the arm models and how the view bends them. */
  private readonly figure: FigureDef;

  constructor(inventory: Inventory, models: ModelLibrary | undefined, figure: FigureDef, sunSource?: DirectionalLight) {
    this.view.name = 'held-items-view';
    this.inventory = inventory;
    this.models = models;
    this.figure = figure;
    this.sunSource = sunSource;
    if (sunSource) {
      this.light.shadow = sunSource.shadow;
      this.light.castShadow = sunSource.castShadow;
    }
    this.opticWindow.visible = false;
    this.opticWindow.renderOrder = 100;
    this.view.add(this.torso, this.opticWindow);
    this.scene.add(this.view, this.light, this.ambient, this.camera);
    // Hidden: gives `renderer.compile` the hand and held-model materials before anything is held. `sync`
    // only clears `view`.
    const warmUp = new Mesh(this.geometry, this.material);
    warmUp.receiveShadow = true;
    warmUp.visible = false;
    this.scene.add(warmUp, modelMaterialWarmUp(false));
  }

  /** Draws `object` in the hands' view, in view metres, for something held that this owner doesn't build. */
  attach(object: Object3D): void {
    this.attached.push(object);
    this.view.add(object);
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
    const renderPose = handling.grab ? grabPose(pose ?? readyMeleePose(false), handling.grab.progress) : pose;
    const baseCameraQuaternion = main.quaternion.clone();
    this.restoreRummageSupport();
    this.sync();
    this.handsOff.clear();
    this.poseFirearms(firearmPoses);
    const { loweredPitchRadians } = firearmsCombatTuning(this.inventory.registry);
    const leadingSide = dominantSide(this.inventory.character);
    const readyPose = readiness ? readyFirearmPose(leadingSide) : undefined;
    const readyAmount = readiness ? Math.max(0, Math.min(1, readiness.progress)) : 0;
    const easedReady = readyAmount * readyAmount * (3 - 2 * readyAmount);
    this.torso.rotation.y = renderPose?.torsoYaw ?? 0;
    this.opticWindow.visible = false;
    this.opticViewFrame = undefined;
    for (const side of ['right', 'left'] as const) {
      this.poseHeldHand({
        side,
        main,
        pose: renderPose,
        recoil,
        handling,
        leadingSide,
        readyPose,
        readyAmount,
        easedReady,
        loweredPitchRadians,
      });
    }
    this.camera.position.copy(main.position);
    this.camera.quaternion.copy(main.quaternion);
    this.view.position.copy(main.position);
    this.view.quaternion.copy(baseCameraQuaternion);
    this.view.updateMatrixWorld(true);
    for (const [uid, { parts }] of this.firearmParts) {
      this.poseBoltHand(
        uid,
        firearmPoses.find((frame) => frame.uid === uid),
        parts,
      );
    }
    this.poseRummage(renderPose, handling);
    this.poseMagazineLoad(handling);
    this.poseRevolverHands(firearmPoses);
    for (const compass of this.compasses.values()) {
      compass.update(main.rotation.y);
    }
    this.poseArms(firearmPoses);
    this.view.updateMatrixWorld(true);
  }

  /** Bends each arm to its grip point, with the hand frame its hold gives it, after every mover has placed the arm. */
  private poseArms(firearmPoses: readonly HeldFirearmPose[]): void {
    for (const [side, arm] of this.arms) {
      const revolver = this.revolverGripFrame(side, firearmPoses);
      const displayPalm = revolver ? undefined : this.displayPalms.get(side);
      // A hand off its hold (working the action, loading) grips where its arm was moved to, not at the hold.
      const hold = this.handsOff.has(side) ? undefined : this.holds.get(side);
      const anchor = this.gripAnchors.get(side);
      anchor?.position.set(...(hold?.at ?? [0, 0, 0]));
      this.updateArmChain(side, arm, revolver ?? displayPalm ?? (hold ? anchor : undefined));
    }
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
  }): void {
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
      return;
    }
    const transform = interpolateHandPose(base, stanceHand);
    this.poseRotation.setFromEuler(this.poseEuler.set(...transform.rotation, 'YXZ'));
    this.applyViewPose(main, pose, transform);
    this.lockCutBladeRoll(side, pose);
    const item = this.inventory.hands[side];
    const itemDefinition = item && defOf(this.inventory.registry, item.type);
    this.poseHeldItem({
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
  }): void {
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
    const { firearmPose, firearmReadiness, aimingDownSights, handlingTurn, modelDefinition } = presentation;
    if (firearmPose) {
      transform.offset = [...firearmPose.rootOffset];
      if (aimingDownSights) {
        this.poseMatrix.makeBasis(
          new Vector3(...firearmPose.rootRotation[0]),
          new Vector3(...firearmPose.rootRotation[1]),
          new Vector3(...firearmPose.rootRotation[2]),
        );
        this.poseRotation.setFromRotationMatrix(this.poseMatrix);
      }
    }
    const [turnPitch, turnYaw, turnRoll] = handlingTurn;
    const loweredPitch = itemDefinition?.firearm ? -loweredPitchRadians * (1 - firearmReadiness) : 0;
    const readyAim = handling.readiness?.uid === item?.uid && readyAmount >= 1 ? handling.aim : undefined;
    if (!aimingDownSights) {
      this.poseAim(item, readyAim);
      this.rackRotation.setFromEuler(this.poseEuler.set(loweredPitch + turnPitch, turnYaw, turnRoll, 'YXZ'));
      this.poseRotation.multiply(this.rackRotation);
    }
    const strength = Math.max(0, Math.min(1, recoil));
    const throwOffset = throwStanceHandOffset(
      side,
      handling.throwing !== undefined,
      handling.throwing?.chargeProgress ?? 0,
    );
    transform.offset = transform.offset.map((value, axis) => value + throwOffset[axis]!) as Vec3;
    transform.offset[1] += 0.012 * strength + Math.max(0, handling.lift ?? 0);
    transform.offset[2] += 0.025 * strength;
    this.recoilRotation.setFromEuler(this.poseEuler.set(-0.08 * strength, 0, 0, 'YXZ'));
    this.poseRotation.multiply(this.recoilRotation);
    this.placeHandAndHeldItem(side, arm, transform, firearmPose);
    if (item && itemDefinition?.firearm) {
      const opticSettings = this.mountedOpticSettings(item, handling.opticZoom);
      const opticSight = Boolean(aimingDownSights && modelDefinition?.gun?.sight?.kind === 'optic' && opticSettings);
      const heldModel = this.shown.get(item.uid);
      if (heldModel) {
        heldModel.visible = !opticSight;
      }
      const ocularDiameter = modelDefinition?.gun?.sight?.ocularDiameterMetres;
      const apertureFill = this.inventory.registry.skills.get(CORE_CONTENT_IDS.firearmsCombat)?.combat?.firearms
        ?.adsApertureFill;
      this.updateOpticWindow({
        active: opticSight,
        settings: opticSettings,
        diameter: ocularDiameter,
        fill: apertureFill,
        fov: main.fov,
        aspect: main.aspect,
        rootOffset: transform.offset,
        rootRotation: firearmPose?.rootRotation,
        heldRotation: this.poseRotation,
        sightEyeOffset: firearmPose?.sightEyeOffset,
        sightDirection: firearmPose?.sightDirection,
        sightUp: firearmPose?.sightUp,
      });
    }
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
    const baseModel = itemDefinition?.model ? this.inventory.registry.models.get(itemDefinition.model) : undefined;
    const modelDefinition =
      item && itemDefinition?.firearm ? sightedFirearmModel(this.inventory.registry, item) : baseModel;
    const firearmReadiness = handling.readiness?.uid === item?.uid ? readyAmount : 0;
    const aimingDownSights = Boolean(
      item && handling.readiness?.uid === item.uid && handling.readiness.aimingDownSights,
    );
    const poseInput =
      itemDefinition?.firearm && modelDefinition
        ? {
            model: modelDefinition,
            side,
            leadingSide,
            twoHanded: Boolean(itemDefinition.twoHanded),
            progress: firearmReadiness,
            aimingDownSights,
            aimFrame: handling.aim ?? NEUTRAL_AIM,
            loweredPitchRadians,
            adsApertureFill: this.inventory.registry.skills.get(CORE_CONTENT_IDS.firearmsCombat)?.combat?.firearms
              ?.adsApertureFill,
            verticalFovDegrees: main.fov,
          }
        : undefined;
    const basePose = poseInput ? heldFirearmTransform(poseInput) : undefined;
    const frame = item && handling.firearms.find((entry) => entry.uid === item.uid);
    const handlingTurn = handlingRotation(modelDefinition, side, frame, {
      x: basePose?.rootOffset[0] ?? 0,
      y: basePose?.rootOffset[1] ?? 0,
    });
    const firearmPose = poseInput ? heldFirearmTransform({ ...poseInput, handlingTurn }) : undefined;
    return { firearmPose, firearmReadiness, aimingDownSights, handlingTurn, modelDefinition };
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

  /**
   * Raises a held magazine while rounds go in or out of it, and has the other hand press each round from its job's
   * progress, so the press never shows a round the simulation hasn't moved (`DESIGN.md`, "Hands: what you see is what's there").
   */
  private poseMagazineLoad(handling: HeldHandlingFrame): void {
    const running = readMagazineLoadFrame(this.inventory, handling.job, this.magazineFrame)
      ? this.magazineFrame
      : undefined;
    stepMagazineRaise(this.magazineRaise, running, handling.dt ?? 0);
    const { side, uid, weight } = this.magazineRaise;
    const arm = side && this.arms.get(side);
    const held = uid === undefined ? undefined : this.shown.get(uid);
    if (!(side && arm && held && weight > 0 && arm.parent === this.torso && this.inventory.hands[side]?.uid === uid)) {
      this.hideMagazineRound();
      return;
    }
    const [x, y, z] = MAGAZINE_LOAD_POSE.raised;
    this.magazineTarget.set(side === 'right' ? x : -x, y, z).applyAxisAngle(TORSO_Y_AXIS, -this.torso.rotation.y);
    const eased = weight * weight * (3 - 2 * weight);
    arm.position.lerp(this.magazineTarget, eased);
    arm.quaternion.multiply(
      this.magazineTilt.setFromAxisAngle(VIEW_X_AXIS, MAGAZINE_LOAD_POSE.raisedTiltRadians * eased),
    );
    this.placeHeldItem(held, arm, ARM_PLACED);
    this.view.updateMatrixWorld(true);
    const seat = uid === undefined ? undefined : this.magazineSeats.get(uid);
    const offArm = this.arms.get(side === 'right' ? 'left' : 'right');
    if (!(running && seat && offArm?.parent)) {
      this.hideMagazineRound();
      return;
    }
    const press = this.magazinePressPose;
    magazinePress(running, press);
    // The fingers hold the round at `press.round`; the wrist sits beside it, where the thumb presses.
    seat.seat.localToWorld(this.magazineTarget.set(...press.round));
    const [wristX, wristY, wristZ] = THUMB_PRESS_WRIST;
    this.magazineWrist.set(side === 'right' ? wristX : -wristX, wristY, wristZ).applyQuaternion(this.view.quaternion);
    this.magazineTarget.add(this.magazineWrist);
    offArm.position.lerp(offArm.parent.worldToLocal(this.magazineTarget), press.reach);
    const offHeld = this.heldByHand.get(side === 'right' ? 'left' : 'right');
    if (offHeld) {
      this.placeHeldItem(offHeld, offArm, ARM_PLACED);
    }
    this.view.updateMatrixWorld(true);
    const round = this.pressedRound(running.uid, seat, running.roundType);
    if (round) {
      // The round rides in the fingers until it seats, without becoming a second inventory item.
      offArm.getWorldPosition(this.magazineTarget).sub(this.magazineWrist);
      round.position.copy(seat.seat.worldToLocal(this.magazineTarget));
      round.visible = press.visible;
    }
  }

  /** The round model under the thumb, built once per magazine and round type. */
  private pressedRound(
    uid: number,
    seat: { readonly seat: Object3D; readonly tiltRadians: number },
    type: string | undefined,
  ): Object3D | undefined {
    const current = this.magazineRound;
    if (current && current.uid === uid && current.type === type) {
      return current.object;
    }
    current?.object.removeFromParent();
    this.magazineRound = undefined;
    const modelId = type === undefined ? undefined : defOf(this.inventory.registry, type).model;
    const object = modelId === undefined ? undefined : this.models?.part(modelId);
    if (!(type && object)) {
      return undefined;
    }
    object.rotation.z = seat.tiltRadians;
    addShadowReceiver(seat.seat, object);
    this.magazineRound = { object, type, uid };
    return object;
  }

  private hideMagazineRound(): void {
    if (this.magazineRound) {
      this.magazineRound.object.visible = false;
    }
  }

  private updateOpticWindow({
    active,
    settings,
    diameter,
    fill,
    fov,
    aspect,
    rootOffset,
    rootRotation,
    heldRotation,
    sightEyeOffset,
    sightDirection,
    sightUp,
  }: {
    active: boolean;
    settings: OpticViewSettings | undefined;
    diameter: number | undefined;
    fill: number | undefined;
    fov: number;
    aspect: number;
    rootOffset: Vec3 | undefined;
    rootRotation: readonly [Vec3, Vec3, Vec3] | undefined;
    heldRotation: Quaternion;
    sightEyeOffset: Vec3 | undefined;
    sightDirection: Vec3 | undefined;
    sightUp: Vec3 | undefined;
  }): void {
    if (
      !(
        active &&
        diameter !== undefined &&
        fill !== undefined &&
        rootOffset &&
        rootRotation &&
        sightEyeOffset &&
        sightDirection &&
        sightUp
      )
    ) {
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
    this.opticRootRight.fromArray(rootRotation[0]);
    this.opticRootUp.fromArray(rootRotation[1]);
    this.opticRootBack.fromArray(rootRotation[2]);
    this.poseMatrix.makeBasis(this.opticRootRight, this.opticRootUp, this.opticRootBack);
    this.opticBaseRotation.setFromRotationMatrix(this.poseMatrix);
    this.opticBaseInverse.copy(this.opticBaseRotation).invert();
    this.opticForward
      .fromArray(sightDirection)
      .applyQuaternion(this.opticBaseInverse)
      .applyQuaternion(heldRotation)
      .normalize();
    this.opticUp.fromArray(sightUp).applyQuaternion(this.opticBaseInverse).applyQuaternion(heldRotation).normalize();
    this.opticRight.crossVectors(this.opticForward, this.opticUp).normalize();
    this.opticUp.crossVectors(this.opticRight, this.opticForward).normalize();
    this.opticBack.copy(this.opticForward).negate();
    this.poseMatrix.makeBasis(this.opticRight, this.opticUp, this.opticBack);
    this.opticWindow.quaternion.setFromRotationMatrix(this.poseMatrix);
    this.opticEyeOffset.fromArray(sightEyeOffset).applyQuaternion(this.opticBaseInverse).applyQuaternion(heldRotation);
    this.opticEye.fromArray(rootOffset).add(this.opticEyeOffset);
    this.opticWindow.position.copy(this.opticEye.addScaledVector(this.opticForward, distance));
    this.opticWindow.visible = true;
    if (settings) {
      const center = this.opticWindow.position;
      const aperture = projectLensAperture({
        center: [center.x, center.y, center.z],
        right: [this.opticRight.x, this.opticRight.y, this.opticRight.z],
        up: [this.opticUp.x, this.opticUp.y, this.opticUp.z],
        radius: innerRadius,
        verticalFovDegrees: fov,
        aspect,
      });
      if (aperture) {
        this.opticViewFrame = { ...settings, ...aperture };
      }
    }
  }

  private mountedOpticSettings(firearm: Item, zoom?: OpticZoomFrame): OpticViewSettings | undefined {
    const optic = mountedOptic(this.inventory.registry, firearm);
    const settings = optic && opticViewSettings(optic.item, optic.model);
    return settings && zoom?.uid === firearm.uid && zoom.opticUid === optic?.uid
      ? { ...settings, magnification: zoom.magnification }
      : settings;
  }

  get opticLensFrame(): OpticLensFrame | undefined {
    return this.opticViewFrame;
  }

  private poseAim(item: Item | undefined, aim: AimFrame | undefined): void {
    if (!(item && aim && defOf(this.inventory.registry, item.type).firearm)) {
      return;
    }
    this.aimRotation.setFromEuler(this.poseEuler.set(aim.pitch, aim.yaw, 0, 'YXZ'));
    this.poseRotation.premultiply(this.aimRotation);
  }

  private poseFirearms(frames: readonly HeldFirearmPose[]): void {
    for (const [uid, data] of this.firearmParts) {
      this.poseFirearm(
        uid,
        data,
        frames.find((entry) => entry.uid === uid),
      );
    }
  }

  private poseFirearm(
    uid: number,
    { action, parts }: { action?: FirearmAction; parts: readonly HeldActionPart[] },
    frame: HeldFirearmPose | undefined,
  ): void {
    const item = this.inventory.itemByUid(uid);
    const modelId = item && defOf(this.inventory.registry, item.type).model;
    const definition = modelId ? this.inventory.registry.models.get(modelId) : undefined;
    if (definition?.gun?.revolver && item?.firearm?.cylinder) {
      poseRevolverParts(parts, definition.gun.revolver, item.firearm.cylinder, frame);
      this.updateRevolver(item, definition, frame);
      return;
    }
    if (!action) {
      return;
    }
    const { mode, stroke, turn } = sampleActionPose(action, frame);
    poseActionParts(parts, mode, stroke, turn);
    this.updatePump(uid, frame, stroke);
    const held = this.shown.get(uid);
    if (held && !this.pumpModels.has(uid)) {
      const magazineGrip = this.poseMagazine(uid, frame);
      this.reachOffHand(
        uid,
        held,
        mode === 'hand' && action ? this.rackHandGrip(held, action, parts, frame!) : magazineGrip,
      );
    }
  }

  private poseBoltHand(uid: number, frame: HeldFirearmPose | undefined, parts: readonly HeldActionPart[]): void {
    const knob = parts.find((part) => part.id === 'knob' && part.turn);
    if (!knob) {
      return;
    }
    const side = this.inventory.hands.right?.uid === uid ? 'right' : 'left';
    const arm = this.arms.get(side);
    if (!arm?.parent) {
      return;
    }
    if (frame?.mode === 'hand') {
      knob.node.updateWorldMatrix(true, true);
      const point = new Box3().setFromObject(knob.node).getCenter(new Vector3());
      arm.position.copy(arm.parent.worldToLocal(point));
      this.handsOff.add(side);
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
    addShadowReceiver(slot, object);
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
      this.handsOff.add(side);
    }
  }

  private cylinderRoundGroup(item: Item, model: ModelDef): Group {
    const roundModels = item.firearm!.cylinder!.chambers.map((chamber) => {
      if (chamber.state === 'empty') {
        return null;
      }
      if (chamber.state === 'round') {
        return defOf(this.inventory.registry, chamber.roundType).model;
      }
      return [...this.inventory.registry.models.values()].find(
        (candidate) => candidate.gun?.calibre === model.gun?.calibre && candidate.id.startsWith('case_'),
      )?.id;
    });
    const key = `${this.models?.version}:${roundModels.join(',')}`;
    const current = this.cylinderRounds.get(item.uid);
    if (current?.key === key) {
      return current.group;
    }
    current?.group.removeFromParent();
    const group = new Group();
    roundModels.forEach((id, index) => {
      const object = id ? this.models?.part(id) : undefined;
      if (object) {
        object.userData.chamber = index;
        group.add(object);
      }
    });
    heldModelFrame(this.shown.get(item.uid)!).add(group);
    this.cylinderRounds.set(item.uid, { key, group });
    return group;
  }

  private updateRevolver(item: Item, model: ModelDef, frame: HeldFirearmPose | undefined): void {
    const cylinder = item.firearm!.cylinder!;
    const data = model.gun!.revolver!;
    const target = frame?.revolver?.chamber ?? cylinder.aligned;
    const progress = Math.min(1, (frame?.elapsed ?? 0) / (frame?.duration ?? 1));
    const opening = revolverOpenAmount(cylinder.open, frame?.revolver?.step, progress);
    for (const object of this.cylinderRoundGroup(item, model).children) {
      object.position.set(
        ...revolverChamberPoint(
          data,
          Number(object.userData.chamber),
          cylinder.open ? target : cylinder.aligned,
          opening,
        ),
      );
      object.quaternion.setFromAxisAngle(new Vector3(...data.crane.axis), data.crane.openRadians * opening);
    }
  }

  private poseRevolverHands(frames: readonly HeldFirearmPose[]): void {
    for (const item of Object.values(this.inventory.hands)) {
      const modelId = item && defOf(this.inventory.registry, item.type).model;
      const model = modelId ? this.inventory.registry.models.get(modelId) : undefined;
      if (item?.firearm?.cylinder && model?.gun?.revolver) {
        this.revolverLoadingHand(
          item,
          model,
          frames.find((frame) => frame.uid === item.uid),
        );
      }
    }
  }

  private revolverGripFrame(side: HandSide, frames: readonly HeldFirearmPose[]): Object3D | undefined {
    const loading = frames.find((frame) => frame.revolver?.step === 'load');
    return loading && !this.inventory.hands[side] ? this.shown.get(loading.uid) : undefined;
  }

  private revolverLoadingHand(item: Item, model: ModelDef, frame: HeldFirearmPose | undefined): void {
    const held = this.shown.get(item.uid)!;
    const side = this.inventory.hands.right?.uid === item.uid ? 'left' : 'right';
    const cylinder = item.firearm!.cylinder!;
    const target = frame?.revolver?.chamber ?? cylinder.aligned;
    const point = revolverChamberPoint(model.gun!.revolver!, target, target, cylinder.open ? 1 : 0);
    const port = modelToView(model, point.map((value, index) => value - model.grip!.at[index]!) as Vec3);
    const arm = this.arms.get(side);
    held.updateWorldMatrix(true, false);
    const rest = arm?.parent ? (held.worldToLocal(arm.getWorldPosition(new Vector3())).toArray() as Vec3) : undefined;
    const tuning = defOf(this.inventory.registry, item.type).firearm!.revolver!.loadPose;
    const feed =
      frame?.revolver?.step === 'load' && rest
        ? shellLoadPose(rest, port, side, { ...frame, feed: tuning })
        : undefined;
    const reaching = feed?.wrist ?? (frame?.revolver?.step === 'pick' ? port : undefined);
    if (arm?.parent && reaching && !this.inventory.hands[side]) {
      arm.position.copy(arm.parent.worldToLocal(held.localToWorld(new Vector3(...reaching))));
      this.handsOff.add(side);
    }
    this.poseLoadingShell(item.uid, held, frame?.roundType, feed);
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
    const part = model.gun?.action?.parts.forend;
    if (arm && base) {
      arm.position.set(...base);
      if (part) {
        const travel = modelToView(model, part.axis.map((value) => value * part.strokeMetres) as Vec3);
        arm.position.addScaledVector(new Vector3(...travel), stroke);
      }
    }
    const feed =
      frame?.mode === 'load' && arm && base
        ? shellLoadPose(base, heldAnchorOffset(model, 'loading_port'), side, {
            ...frame,
            topFeed: Object.values(model.gun?.action?.parts ?? {}).some((mover) => mover.turn),
          })
        : undefined;
    if (feed) {
      arm?.position.set(...feed.wrist);
      this.handsOff.add(side);
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
        addShadowReceiver(held, shell);
        this.loadingShells.set(uid, shell);
      }
    }
    if (shell) {
      // The round follows the feeding wrist until seated, without becoming a second inventory item.
      shell.position.set(...feed.shell);
      const model = this.pumpModels.get(uid);
      if (model && Object.values(model.gun?.action?.parts ?? {}).some((part) => part.turn)) {
        const direction = new Vector3(...heldAnchorOffset(model, 'loading_port')).sub(shell.position);
        if (direction.lengthSq() > 0) {
          shell.quaternion.setFromUnitVectors(new Vector3(1, 0, 0), direction.normalize());
        }
      }
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

  /** Where the view hangs an arm, in the eye's frame. */
  viewShoulder(side: HandSide): Vector3 {
    return new Vector3(...firstPersonShoulder(this.figure, side));
  }

  /** Places a torso arm's grip, kept within the arm's reach plus the short shoulder lead a stretch allows. */
  private placeTorsoArm(side: HandSide, arm: Group, transform: ReturnType<typeof interpolateHandPose>): void {
    this.handPosition.set(...transform.offset).applyAxisAngle(TORSO_Y_AXIS, -this.torso.rotation.y);
    transform.offset = [this.handPosition.x, this.handPosition.y, this.handPosition.z];
    const rig = this.armRigs.get(side);
    if (rig) {
      const shoulder = this.viewShoulder(side);
      const grip = new Vector3(...transform.offset);
      const reach = rig.upperLength + rig.foreLength + rig.gripFromWrist.length() + 0.08;
      if (shoulder.distanceTo(grip) > reach) {
        grip.sub(shoulder).normalize().multiplyScalar(reach).add(shoulder);
        transform.offset = [grip.x, grip.y, grip.z];
      }
    }
    arm.position.set(...transform.offset);
  }

  /** The model drawn for an item: its own if held, else the held root's model that carries it (a mounted light). */
  private shownModelOf(item: Item): Object3D | undefined {
    const own = this.shown.get(item.uid);
    if (own) {
      return own;
    }
    for (const { item: found, path } of this.inventory.carriedTree()) {
      if (found === item) {
        const side = isInHeldItemSlotTree(path) ? (HELD_ROOT_PATH.exec(path)?.[1] as HandSide | undefined) : undefined;
        return side && this.shown.get(this.inventory.hands[side]!.uid);
      }
    }
    return undefined;
  }

  /** Where a held item's lens is, in world metres; false if it isn't held. Call after `update`. */
  lensOf(item: Item, out: Vector3): boolean {
    const lens = this.shownModelOf(item)?.getObjectByName(LENS);
    if (!lens) {
      return false;
    }
    lens.getWorldPosition(out);
    return true;
  }

  /** World position for a held light without a model-specific lens anchor. */
  lightPositionOf(item: Item, out: Vector3): boolean {
    const visual = this.shown.get(item.uid);
    if (!visual) {
      return false;
    }
    if (this.lensOf(item, out)) {
      return true;
    }
    visual.getWorldPosition(out);
    return true;
  }

  /** Sets the camera's sky visibility so the held scene shares indoor ambient darkening. */
  setSkyVisibility(visibility: number): void {
    this.skyVisibility = visibility;
  }

  /** Draws what's in your hands over the frame the main camera just rendered. */
  render(renderer: WebGLRenderer, main: PerspectiveCamera, sky: SkyTargets): void {
    if (this.view.children.length === 0) {
      return;
    }
    this.light.position.copy(sky.light.position);
    this.light.color.copy(sky.light.color);
    this.light.intensity = sky.light.intensity;
    this.light.castShadow = this.sunSource?.castShadow ?? false;
    this.ambient.color.copy(sky.ambient.color);
    this.ambient.groundColor.copy(sky.ambient.groundColor);
    this.ambient.intensity = sky.ambient.intensity * this.skyVisibility;
    if (this.camera.fov !== main.fov || this.camera.aspect !== main.aspect) {
      this.camera.fov = main.fov;
      this.camera.aspect = main.aspect;
      this.camera.updateProjectionMatrix();
    }
    this.visor?.scale.set(
      this.camera.aspect * Math.tan(MathUtils.degToRad(this.camera.fov / 2)),
      Math.tan(MathUtils.degToRad(this.camera.fov / 2)),
      1,
    );
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
    this.syncVisor();
    this.disposeCompasses();
    this.clearArms();
    for (const held of this.shown.values()) {
      disposeItemEmissiveMaterials(held);
    }
    this.view.clear();
    this.view.add(this.torso, this.opticWindow, ...this.attached);
    this.shown.clear();
    this.firearmParts.clear();
    this.cylinderRounds.clear();
    this.pumpModels.clear();
    this.magazineSlots.clear();
    this.incomingMagazines.clear();
    this.loadingShells.clear();
    this.magazineSeats.clear();
    this.magazineRound = undefined;
    this.handBases.clear();
    this.heldByHand.clear();
    this.displayPalms.clear();
    const { hands } = this.inventory;
    this.syncHand('right', hands.right);
    this.syncHand('left', hands.left);
    this.syncFistHand('right');
    this.syncFistHand('left');
  }

  private clearVisor(): void {
    this.visor?.removeFromParent();
    this.visor = undefined;
    for (const material of this.visorMaterials) {
      material.dispose();
    }
    this.visorMaterials.length = 0;
  }

  private syncVisor(): void {
    this.clearVisor();
    const { head } = this.inventory.worn;
    const entry = head && defOf(this.inventory.registry, head.type).wearable?.viewModel;
    const model = entry && this.models?.part(entry.model);
    if (!(entry && model)) {
      return;
    }
    model.traverse((object) => {
      if (!(object instanceof Mesh)) {
        return;
      }
      const source = Array.isArray(object.material) ? object.material[0] : object.material;
      const material = new MeshBasicMaterial({
        color: source.color,
        transparent: true,
        opacity: object.name === 'pane' ? entry.tint : entry.darkening,
        depthWrite: false,
        side: DoubleSide,
      });
      object.material = material;
      this.visorMaterials.push(material);
    });
    this.visor = model;
    this.camera.add(model);
  }

  private disposeCompasses(): void {
    for (const compass of this.compasses.values()) {
      compass.dispose();
    }
    this.compasses.clear();
  }

  /** Releases the spike's owned display resources on page teardown too. */
  dispose(): void {
    this.clearVisor();
    this.disposeCompasses();
    this.clearArms();
    for (const material of this.lightMaterials.values()) {
      material.dispose();
    }
    this.lightMaterials.clear();
    this.flames.dispose();
    this.opticWindow.geometry.dispose();
    (this.opticWindow.material as MeshBasicMaterial).dispose();
    for (const held of this.shown.values()) {
      disposeItemEmissiveMaterials(held);
    }
    this.view.clear();
    this.shown.clear();
    this.heldByHand.clear();
    // A bfcache pageshow may resume this owner; its next update must rebuild disposed displays.
    this.drawn = '';
  }

  /** Detaches the arms before rebuilding the hands scene; their meshes are the model library's shared copies. */
  private clearArms(): void {
    for (const arm of this.arms.values()) {
      arm.removeFromParent();
    }
    this.arms.clear();
    this.armRigs.clear();
    this.gripAnchors.clear();
    this.holds.clear();
  }

  /**
   * Bends the arm from its shoulder to its grip point, in the view's frame. The hand takes `gripFrame` when it has
   * one (a screen's back, a revolver being loaded, a long gun's authored hold), else it continues the forearm.
   */
  private updateArmChain(side: HandSide, arm: Group, gripFrame: Object3D | undefined): void {
    const rig = this.armRigs.get(side);
    if (!rig) {
      return;
    }
    const baseShoulder = this.viewShoulder(side);
    const shoulder =
      arm.parent === this.torso ? this.view.worldToLocal(this.torso.localToWorld(baseShoulder)) : baseShoulder;
    const anchor = this.gripAnchors.get(side) ?? arm;
    const grip = this.view.worldToLocal(anchor.getWorldPosition(new Vector3()));
    const viewRotation = this.view.getWorldQuaternion(new Quaternion());
    const handFrame = gripFrame
      ? viewRotation.clone().invert().multiply(gripFrame.getWorldQuaternion(new Quaternion()))
      : undefined;
    const bendSide = new Vector3(side === 'right' ? 1 : -1, 0, 0);
    const solved = solveArmRig(rig, { shoulder, grip, handFrame, bendSide, up: TORSO_Y_AXIS });
    const toArm = arm.getWorldQuaternion(new Quaternion()).invert().multiply(viewRotation);
    const place = (pivot: Object3D, at: Vector3, rotation: Quaternion): void => {
      pivot.position.copy(arm.worldToLocal(this.view.localToWorld(at.clone())));
      pivot.quaternion.copy(toArm).multiply(rotation);
    };
    place(rig.shoulder, solved.shoulder, solved.upper);
    place(rig.elbow, solved.elbow, solved.fore);
    place(rig.hand, grip, solved.hand);
  }

  /** The figure's arm model for `side`, once the library has it. */
  private armModel(side: HandSide): { definition: ModelDef; scene: Object3D } | undefined {
    const definition = this.inventory.registry.models.get(
      this.figure.limbs[side === 'right' ? 'rightArm' : 'leftArm'].model,
    );
    const scene = definition && this.models?.has(definition.id) ? this.models.part(definition.id) : undefined;
    return definition && scene ? { definition, scene } : undefined;
  }

  /**
   * An arm whose grip point is `grip` in the torso's frame, or in a held item's when `mount` names one, posed as
   * `pose` says; the arm's own origin is that grip point, so a held item placed from the arm's position sits in its
   * hand. A `hold` moves the hand's grip anchor off that origin, to where the authored palm meets the held model, and
   * sets the hand's frame there.
   */
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
    const gripAnchor = new Object3D();
    gripAnchor.name = 'grip-anchor';
    if (hold) {
      gripAnchor.position.set(...hold.at);
      gripAnchor.quaternion.setFromRotationMatrix(
        new Matrix4().makeBasis(
          new Vector3(...hold.thumbSide),
          new Vector3(...hold.fingers),
          new Vector3(...hold.palm),
        ),
      );
      this.holds.set(side, hold);
    }
    this.gripAnchors.set(side, gripAnchor);
    arm.add(gripAnchor);
    const model = this.armModel(side);
    if (model) {
      const { armRig } = this.figure;
      const rig = buildArmRig(model, armRig, side, armRig.handPoses[pose]);
      arm.add(rig.shoulder, rig.elbow, rig.hand);
      this.armRigs.set(side, rig);
    }
    const origin = mount?.origin ?? [0, 0, 0];
    const localGrip: Vec3 = [grip[0] - origin[0], grip[1] - origin[1], grip[2] - origin[2]];
    arm.position.set(...localGrip);
    this.arms.set(side, arm);
    this.handBases.set(side, localGrip);
    addShadowReceiver(mount?.held ?? this.torso, arm);
  }

  private syncFistHand(side: HandSide): void {
    if (!this.inventory.hands[side]) {
      this.addArm(side, HOLD[side], 'fist');
    }
  }

  private syncHand(side: HandSide, item: Item | undefined): void {
    if (!item) {
      return;
    }
    const def = defOf(this.inventory.registry, item.type);
    const model = def.model === undefined ? undefined : this.inventory.registry.models.get(def.model);
    // A permanently raised inspection pose keeps this small display legible without a new input route.
    const heldAt: Vec3 =
      def.heldDisplay === undefined
        ? heldGripOffset(side, Boolean(def.twoHanded), model)
        : [side === 'right' ? 0.14 : -0.14, -0.13, -0.3];
    const held = new Group();
    held.position.set(...heldAt);
    held.add(this.shape(item));
    if (def.heldDisplay !== undefined && model?.display && this.models?.has(model.id)) {
      const palm = presentHeldDisplay(held.children[0]!, model.display, heldAt);
      held.add(palm);
      this.displayPalms.set(side, palm);
    }
    addShadowReceiver(this.view, held);
    this.shown.set(item.uid, held);
    this.heldByHand.set(side, held);
    if (model?.hands) {
      this.addArm(side, heldAt, model.hands.firing.pose, { hold: heldHoldFrame(model, side, 'firing') });
    } else {
      this.addArm(side, heldAt, this.displayPalms.has(side) ? 'open' : 'holding');
    }
    if (def.twoHanded) {
      this.syncOffhandArm(side, heldAt, model, held);
    }
  }

  private syncOffhandArm(side: HandSide, heldAt: Vec3, model: ModelDef | undefined, held: Group): void {
    const otherSide: HandSide = side === 'right' ? 'left' : 'right';
    if (model?.hands) {
      const support = heldHoldFrame(model, otherSide, 'support');
      const offhandGrip: Vec3 = support.at.map((value, index) => value + heldAt[index]!) as Vec3;
      this.addArm(otherSide, offhandGrip, model.hands.support.pose, {
        mount: { held, origin: heldAt },
        hold: { ...support, at: [0, 0, 0] },
      });
      return;
    }
    const pose = model?.hold;
    const offhandGrip: Vec3 =
      pose === 'upright' ? [heldAt[0], heldAt[1] + 0.14, heldAt[2]] : [heldAt[0], heldAt[1], heldAt[2] - 0.14];
    this.addArm(otherSide, offhandGrip, 'holding', { mount: { held, origin: heldAt } });
  }

  private shape(item: Item): Object3D {
    const def = defOf(this.inventory.registry, item.type);
    const look = itemLook(this.inventory.registry, item);
    const model = look && this.models?.heldLook(look);
    // Until its model loads, a held display shows the placeholder any item does.
    if (def.heldDisplay === HELD_DISPLAY_KIND.compass && model) {
      const definition = this.inventory.registry.models.get(def.model!);
      if (!(definition?.display && definition.anchors?.needle_mount && definition.dial)) {
        throw new Error(`Held compass ${item.type} needs a model with a display, a needle_mount anchor and a dial`);
      }
      const compass = createCompass({
        root: model.root,
        display: definition.display,
        needleMount: definition.anchors.needle_mount,
        dial: definition.dial,
      });
      this.compasses.set(item.uid, compass);
      return compass.group;
    }
    if (model) {
      applyItemEmissive(model.root, item, def, this.inventory.registry.models.get(def.model!));
      this.flames.onModel(this.inventory.registry, item, model.root, heldModelFrame);
      const [top] = this.inventory.registry.models.get(def.model!)?.gun?.rounds ?? [];
      if (top) {
        const seat = new Object3D();
        seat.position.set(...top.at);
        heldModelFrame(model.root).add(seat);
        this.magazineSeats.set(item.uid, { seat, tiltRadians: MathUtils.degToRad(top.tilt) });
      }
      this.registerFirearmModel(item.uid, this.inventory.registry.models.get(def.model!)!, model);
      return model.root;
    }
    return this.fallbackShape(item, def);
  }

  private registerFirearmModel(
    uid: number,
    definition: ModelDef,
    model: NonNullable<ReturnType<ModelLibrary['heldLook']>>,
  ): void {
    const action = definition.gun?.action;
    if (model.slots.magazine) {
      this.magazineSlots.set(uid, model.slots.magazine);
    }
    if (action || definition.gun?.revolver) {
      this.firearmParts.set(uid, { ...(action ? { action } : {}), parts: model.parts });
      if (definition.gun?.internalMagazine) {
        this.pumpModels.set(uid, definition);
      }
    }
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
      const flame = this.flames.mesh(def.light.color);
      flame.scale.set(short * 0.5, short * 1.5, short * 0.5);
      flame.position.set(0, short * 1.05, lens.position.z);
      shape.add(flame);
    }
    return shape;
  }
}
