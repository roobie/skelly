import { Box3, Euler, Group, MathUtils, Matrix4, type Mesh, Object3D, Quaternion, Vector3 } from 'three';
import { type AimFrame, NEUTRAL_AIM } from '../core/aim.ts';
import { dominantSide } from '../core/character.ts';
import type { FigureDef, ModelDef } from '../core/content.ts';
import { CORE_CONTENT_IDS } from '../core/contentIds.ts';
import type { Vec3 } from '../core/coords.ts';
import { type FirearmAimOffHand, firearmAimOffHand } from '../core/firearmAimOffHand.ts';
import { firearmAimHandPose } from '../core/firearmAimPose.ts';
import type { Job } from '../core/handling.ts';
import { heldAnchorOffset, modelToView, readyFirearmPose, throwStanceHandOffset } from '../core/heldPose.ts';
import { type HandSide, Inventory } from '../core/inventory.ts';
import { defOf, type Item } from '../core/items.ts';
import { type interpolateHandPose, type MeleePoseFrame, readyMeleePose } from '../core/meleePose.ts';
import type { OpticZoomFrame } from '../core/opticView.ts';
import { revolverChamberPoint } from '../core/revolverPose.ts';
import { HELD_DISPLAY_KIND } from '../core/schema.ts';
import { firearmsCombatTuning } from '../core/skillTraining.ts';
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
import type { HeldPresentation, HeldPresentationFrame } from './heldPresentation.ts';
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
import { type ComposedSlot, heldModelFrame, type ModelLibrary } from './models.ts';
import { rummageFrame, rummageGrip } from './rummagePose.ts';
import { shellLoadPose } from './shellLoadPose.ts';

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

export interface HeldHandlingFrame extends HeldPresentationFrame {
  readonly firearms: readonly HeldFirearmPose[];
  readonly opticZoom?: OpticZoomFrame | undefined;
  readonly throwing?: { readonly chargeProgress: number };
  readonly job?: Readonly<Job> | undefined;
  readonly grab?: { readonly progress: number };
  /** The frame's real seconds, used only to raise and lower a magazine being loaded. */
  readonly dt?: number;
  /** Metres the arms and held item are raised, to show a blow deflected. */
  readonly lift?: number;
  readonly magazineRaise?: Readonly<ReturnType<typeof createMagazineRaise>>;
  /** Wall-leeway debug spike: radians a long gun is lowered about its butt, before the arms solve. */
  readonly wallLowerRadians?: number;
}

/** Advance actor-owned smoothing once, then give both presentation adapters the same snapshot. */
export const createHeldAnimation = () => {
  const raise = createMagazineRaise();
  const magazine = createMagazineLoadFrame();
  return {
    advance(inventory: Inventory, handling: HeldHandlingFrame): HeldHandlingFrame {
      const running = readMagazineLoadFrame(inventory, handling.job, magazine) ? magazine : undefined;
      stepMagazineRaise(raise, running, handling.dt ?? 0);
      return { ...handling, magazineRaise: { ...raise } };
    },
  };
};

export interface ActorEyeFrame {
  readonly position: Vector3;
  readonly quaternion: Quaternion;
  readonly rotation: { readonly y: number };
}

export interface ActorViewPlacement {
  readonly fov: number;
  readonly poseItem: (frame: ActorItemPose) => void;
}

export interface ActorItemPose {
  readonly item: Item;
  readonly modelDefinition: ModelDef | undefined;
  readonly aimingDownSights: boolean;
  readonly firearmPose: ReturnType<HeldPresentation['firearmTransform']> | undefined;
  readonly transform: ReturnType<typeof interpolateHandPose>;
  readonly rotation: Quaternion;
  readonly handling: HeldHandlingFrame;
}

/** Physical movers shared by world and transitional view presentations. */
export class ActorAnimator {
  private readonly flames = new ModelFlames('held-light-flame');
  inventory: Pick<Inventory, 'registry' | 'hands'>;
  private simulation: Inventory | undefined;
  private readonly models: ModelLibrary | undefined;
  private readonly view: Object3D;
  private readonly torso: Object3D;
  private shoulderOf: (side: HandSide) => Vector3;
  private viewPlacement: ActorViewPlacement | undefined;
  private readonly emptyFists: boolean;
  private readonly shouldersFollowTorso: boolean;
  private drawn = '';
  /** What's drawn for each held item, by uid. */
  private readonly shown = new Map<number, Object3D>();
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
  readonly presentation: HeldPresentation;
  private get arms() {
    return this.presentation.arms;
  }
  private get armRigs() {
    return this.presentation.armRigs;
  }
  private get handBases() {
    return this.presentation.handBases;
  }
  private get gripAnchors() {
    return this.presentation.gripAnchors;
  }
  private get holds() {
    return this.presentation.holds;
  }
  /** The sides whose hand has left its hold this frame, to work the gun; the hand then follows its forearm. */
  private readonly handsOff = new Set<HandSide>();
  private get heldByHand() {
    return this.presentation.heldByHand;
  }
  private get displayPalms() {
    return this.presentation.displayPalms;
  }
  private readonly relativeCamera = new Quaternion();
  private readonly lockedCamera = new Quaternion();
  private readonly poseRotation = new Quaternion();
  private readonly recoilRotation = new Quaternion();
  private readonly rackRotation = new Quaternion();
  private readonly aimRotation = new Quaternion();
  private readonly poseMatrix = new Matrix4();
  private readonly poseEuler = new Euler();
  private readonly handPosition = new Vector3();
  private rummageSupportRest: { arm: Group; position: Vector3 } | undefined;

  /** The player's figure row: names the arm models and how the view bends them. */
  private readonly figure: FigureDef;

  constructor(
    inventory: Pick<Inventory, 'registry' | 'hands'>,
    presentation: HeldPresentation,
    shoulderOf: (side: HandSide) => Vector3,
    { emptyFists = true, shouldersFollowTorso = true } = {},
  ) {
    this.emptyFists = emptyFists;
    this.shouldersFollowTorso = shouldersFollowTorso;
    this.inventory = inventory;
    this.simulation = inventory instanceof Inventory ? inventory : undefined;
    this.models = presentation.models;
    this.figure = presentation.figure;
    this.presentation = presentation;
    this.view = presentation.frame;
    this.torso = presentation.torso;
    this.shoulderOf = shoulderOf;
  }

  setSource(source: Pick<Inventory, 'registry' | 'hands'>): void {
    this.inventory = source;
    this.simulation = source instanceof Inventory ? source : undefined;
  }

  setShoulders(shoulderOf: (side: HandSide) => Vector3): void {
    this.shoulderOf = shoulderOf;
  }

  /** Samples simulation-owned action time and poses in the actor's eye frame. */
  update(
    main: ActorEyeFrame,
    {
      pose,
      recoil = 0,
      handling = { firearms: [] },
      viewPlacement,
      emptyFists = this.emptyFists,
    }: {
      emptyFists?: boolean;
      pose?: MeleePoseFrame | undefined;
      recoil?: number;
      handling?: HeldHandlingFrame;
      viewPlacement?: ActorViewPlacement;
    } = {},
  ): void {
    this.viewPlacement = viewPlacement;
    const { firearms: firearmPoses, readiness } = handling;
    const renderPose = handling.grab ? grabPose(pose ?? readyMeleePose(false), handling.grab.progress) : pose;
    const baseCameraQuaternion = main.quaternion.clone();
    this.restoreRummageSupport();
    const activeEmpty =
      emptyFists ||
      Boolean(
        readiness ||
          pose?.viewOrientation ||
          handling.grab ||
          handling.job ||
          handling.throwing ||
          firearmPoses.length > 0,
      );
    this.sync(activeEmpty);
    this.handsOff.clear();
    this.poseFirearms(firearmPoses);
    const { loweredPitchRadians } = firearmsCombatTuning(this.inventory.registry);
    const leadingSide = this.leadingSide();
    const readyPose = readiness ? readyFirearmPose(leadingSide, this.figure.holds) : undefined;
    const aimOffHand = firearmAimOffHand(this.inventory.hands, readiness, this.firearmSupportMounted(readiness));
    const readyAmount = readiness ? Math.max(0, Math.min(1, readiness.progress)) : 0;
    const easedReady = readyAmount * readyAmount * (3 - 2 * readyAmount);
    this.torso.rotation.y = renderPose?.torsoYaw ?? 0;
    for (const side of ['right', 'left'] as const) {
      this.poseHeldHand({
        side,
        main,
        pose: renderPose,
        recoil,
        handling,
        leadingSide,
        readyPose,
        aimOffHand,
        readyAmount,
        easedReady,
        loweredPitchRadians,
      });
    }
    if (aimOffHand?.mode === 'support') {
      this.placeFirearmAimSupport(aimOffHand, readiness!.uid, easedReady);
    }
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

  private firearmSupportMounted(readiness: HeldPresentationFrame['readiness']): boolean {
    if (!readiness) {
      return false;
    }
    const firearmSide = (['right', 'left'] as const).find((hand) => this.inventory.hands[hand]?.uid === readiness.uid);
    if (!firearmSide) {
      return false;
    }
    const side = firearmSide === 'right' ? 'left' : 'right';
    const arm = this.arms.get(side);
    return arm !== undefined && arm.parent !== this.torso;
  }

  private placeFirearmAimSupport({ side, firearmSide }: FirearmAimOffHand, uid: number, easedReady: number): void {
    const arm = this.arms.get(side);
    const held = this.shown.get(uid);
    if (!(arm?.parent && held)) {
      return;
    }
    const [x, y, z] = this.figure.holds.supportForward;
    const target = held.localToWorld(new Vector3(firearmSide === 'right' ? x : -x, y, z));
    arm.position.lerp(arm.parent.worldToLocal(target), easedReady);
    this.handsOff.add(side);
  }

  private poseHeldHand({
    side,
    main,
    pose,
    recoil,
    handling,
    leadingSide,
    readyPose,
    aimOffHand,
    readyAmount,
    easedReady,
    loweredPitchRadians,
  }: {
    side: HandSide;
    main: ActorEyeFrame;
    pose: MeleePoseFrame | undefined;
    recoil: number;
    handling: HeldHandlingFrame;
    leadingSide: HandSide;
    readyPose: ReturnType<typeof readyMeleePose> | undefined;
    aimOffHand: FirearmAimOffHand | undefined;
    readyAmount: number;
    easedReady: number;
    loweredPitchRadians: number;
  }): void {
    const neutral = { offset: [0, 0, 0] as Vec3, rotation: [0, 0, 0] as Vec3 };
    const activeHand = firearmAimHandPose({ side, aimOffHand, readyPose, holds: this.figure.holds, easedReady });
    const hand = activeHand ?? pose?.[side] ?? neutral;
    const itemInHand = this.inventory.hands[side];
    const restingItem = itemInHand && handling.readiness?.uid !== itemInHand.uid && !activeHand;
    const target = restingItem ? undefined : readyPose?.[side];
    const stanceHand =
      !activeHand && target
        ? {
            offset: hand.offset.map((value, index) => value + (target.offset[index]! - value) * easedReady) as Vec3,
            rotation: hand.rotation.map(
              (value, index) => value + (target.rotation[index]! - value) * easedReady,
            ) as Vec3,
          }
        : hand;
    const base = this.handBases.get(side);
    const arm = this.arms.get(side);
    if (!(base && arm)) {
      return;
    }
    const transform = this.presentation.handTransform(side, stanceHand)!;
    this.poseRotation.setFromEuler(this.poseEuler.set(...transform.rotation, 'YXZ'));
    this.applyViewPose(main, pose, transform);
    this.lockCutBladeRoll(side, pose);
    const item = this.inventory.hands[side];
    const itemDefinition = item && defOf(this.inventory.registry, item.type);
    this.poseHeldItem({
      side,
      recoil,
      handling,
      leadingSide,
      readyAmount,
      loweredPitchRadians,
      transform,
      item,
      itemDefinition,
    });
  }

  private poseHeldItem({
    side,
    recoil,
    handling,
    leadingSide,
    readyAmount,
    loweredPitchRadians,
    transform,
    item,
    itemDefinition,
  }: {
    side: HandSide;
    recoil: number;
    handling: HeldHandlingFrame;
    leadingSide: HandSide;
    readyAmount: number;
    loweredPitchRadians: number;
    transform: ReturnType<typeof interpolateHandPose>;
    item: Item | undefined;
    itemDefinition: ReturnType<typeof defOf> | undefined;
  }): void {
    const presentation = this.heldFirearmPresentation({
      side,
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
    const loweredPitch = itemDefinition?.firearm
      ? -loweredPitchRadians * (1 - firearmReadiness) - (handling.wallLowerRadians ?? 0)
      : 0;
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
    this.presentation.place(side, transform, {
      rotation: this.poseRotation,
      shoulder: this.shoulderOf(side),
      firearm: Boolean(firearmPose),
    });
    if (item && itemDefinition?.firearm) {
      this.viewPlacement?.poseItem({
        item,
        modelDefinition,
        aimingDownSights,
        firearmPose,
        transform,
        rotation: this.poseRotation,
        handling,
      });
    }
  }

  private heldFirearmPresentation({
    side,
    handling,
    leadingSide,
    readyAmount,
    loweredPitchRadians,
    item,
    itemDefinition,
  }: {
    side: HandSide;
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
      this.viewPlacement && item && handling.readiness?.uid === item.uid && handling.readiness.aimingDownSights,
    );
    const poseInput =
      itemDefinition?.firearm && modelDefinition
        ? {
            model: modelDefinition,
            holds: this.figure.holds,
            side,
            leadingSide,
            twoHanded: Boolean(itemDefinition.twoHanded),
            progress: firearmReadiness,
            aimingDownSights,
            aimFrame: handling.aim ?? NEUTRAL_AIM,
            loweredPitchRadians,
            extraLoweredPitch: handling.wallLowerRadians,
            adsApertureFill: this.inventory.registry.skills.get(CORE_CONTENT_IDS.firearmsCombat)?.combat?.firearms
              ?.adsApertureFill,
            ...(this.viewPlacement ? { verticalFovDegrees: this.viewPlacement.fov } : {}),
          }
        : undefined;
    const basePose = poseInput ? this.presentation.firearmTransform(poseInput) : undefined;
    const frame = item && handling.firearms.find((entry) => entry.uid === item.uid);
    const handlingTurn = handlingRotation(modelDefinition, side, frame, {
      x: basePose?.rootOffset[0] ?? 0,
      y: basePose?.rootOffset[1] ?? 0,
    });
    const firearmPose = poseInput ? this.presentation.firearmTransform({ ...poseInput, handlingTurn }) : undefined;
    return { firearmPose, firearmReadiness, aimingDownSights, handlingTurn, modelDefinition };
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
  private magazineLoading(handling: HeldHandlingFrame) {
    const running = readMagazineLoadFrame(
      {
        hands: this.inventory.hands,
        itemByUid: (uid) => this.itemByUid(uid),
      },
      handling.job,
      this.magazineFrame,
    )
      ? this.magazineFrame
      : undefined;
    if (handling.magazineRaise) {
      Object.assign(this.magazineRaise, handling.magazineRaise);
    } else {
      stepMagazineRaise(this.magazineRaise, running, handling.dt ?? 0);
    }
    return running;
  }

  private poseMagazineLoad(handling: HeldHandlingFrame): void {
    const running = this.magazineLoading(handling);
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
    const item = this.itemByUid(uid);
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
    heldModelFrame(this.shown.get(item.uid)!.children[0]!).add(group);
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
    const rest = readyMeleePose(true, this.figure.holds, this.leadingSide())[side];
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
    main: ActorEyeFrame,
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
    this.presentation.placeHeld(held, arm, transform, this.poseRotation);
  }

  private itemByUid(uid: number): Item | undefined {
    return (
      this.simulation?.itemByUid(uid) ?? Object.values(this.inventory.hands).find((candidate) => candidate?.uid === uid)
    );
  }

  private leadingSide(): HandSide {
    if (this.simulation) {
      return dominantSide(this.simulation.character);
    }
    return this.inventory.hands.left ? 'left' : 'right';
  }

  modelOf(item: Item): Object3D | undefined {
    return this.shown.get(item.uid);
  }

  /** Rebuilds what's held when the hands changed or a model loaded. */
  private sync(activeEmpty: boolean): void {
    const { right, left } = this.inventory.hands;
    const version = `${this.simulation?.version}:${this.models?.version ?? 0}:${right?.uid}:${right?.type}:${left?.uid}:${left?.type}:${activeEmpty}`;
    if (version === this.drawn) {
      return;
    }
    this.drawn = version;
    this.disposeCompasses();
    this.clearArms();
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
    if (activeEmpty) {
      this.syncFistHand('right');
      this.syncFistHand('left');
    }
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
    this.presentation.dispose();
    this.flames.dispose();
    this.shown.clear();
    this.heldByHand.clear();
    // A bfcache pageshow may resume this owner; its next update must rebuild disposed displays.
    this.drawn = '';
  }

  /** Detaches the arms before rebuilding the hands scene; their meshes are the model library's shared copies. */
  private clearArms(): void {
    this.presentation.clear();
  }

  /**
   * Bends the arm from its shoulder to its grip point, in the view's frame. The hand takes `gripFrame` when it has
   * one (a screen's back, a revolver being loaded, a long gun's authored hold), else it continues the forearm.
   */
  private updateArmChain(side: HandSide, arm: Group, gripFrame: Object3D | undefined): void {
    if (!this.armRigs.has(side)) {
      return;
    }
    const baseShoulder = this.shoulderOf(side);
    const shoulder =
      this.shouldersFollowTorso && arm.parent === this.torso
        ? this.view.worldToLocal(this.torso.localToWorld(baseShoulder))
        : baseShoulder;
    this.presentation.solve(side, shoulder, gripFrame);
  }

  private syncFistHand(side: HandSide): void {
    if (!this.inventory.hands[side]) {
      this.presentation.addFist(side);
    }
  }

  private syncHand(side: HandSide, item: Item | undefined): void {
    if (!item) {
      return;
    }
    const held = this.presentation.addItem(side, item, (value) => this.shape(value));
    addShadowReceiver(this.view, held);
    this.shown.set(item.uid, held);
  }

  private shape(item: Item): Object3D {
    const def = defOf(this.inventory.registry, item.type);
    const model = this.presentation.model(item);
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
    return this.presentation.fallback(item, (color) => this.flames.mesh(color));
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
}
