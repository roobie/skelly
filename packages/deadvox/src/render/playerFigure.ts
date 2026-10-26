// The player's world body: the figure row's authored models posed about their joints.

import { Group, Object3D, type Vector3 } from 'three';
import type { BodyRegion } from '../core/body.ts';
import { dominantSide } from '../core/character.ts';
import type { FigureDef, ModelDef, Registry } from '../core/content.ts';
import { CORE_CONTENT_IDS } from '../core/contentIds.ts';
import type { Vec3 } from '../core/coords.ts';
import { firearmAimOffHand } from '../core/firearmAimOffHand.ts';
import { firearmAimHandPose } from '../core/firearmAimPose.ts';
import { readyFirearmPose } from '../core/heldPose.ts';
import type { HandSide, Inventory } from '../core/inventory.ts';
import { defOf, type Item } from '../core/items.ts';
import { type MeleePoseFrame, readyMeleePose } from '../core/meleePose.ts';
import type { Body } from '../core/physics.ts';
import type { PlayerStance } from '../core/playerStance.ts';
import {
  FIGURE_LIMB_JOINTS,
  FIGURE_LIMBS,
  type FigureJoint,
  type FigureLimb,
  LEG_SEGMENTS,
  type LegSegment,
  type WearSlot,
} from '../core/schema.ts';
import { FIGURE_BOXES, type FigureBox } from '../core/zombieRegions.ts';
import { HeldPresentation, type HeldPresentationFrame } from './heldPresentation.ts';
import type { ModelLibrary } from './models.ts';
import { castsAndReceives, PLAYER_FIGURE_LAYER } from './shadowFlags.ts';

/** Metres behind the eye; leaves the torso's front face 5 cm behind the eye. */
export const PLAYER_BODY_REAR_OFFSET = 0.19;

export interface PlayerFigurePlacement {
  bodyPosition: Vec3;
  yaw: number;
  blockSize: number;
  thirdPerson: boolean;
}

/** Places a metre offset from the block-based body base exactly as the world figure is drawn. */
export const setPlayerFigurePosition = (
  target: Vector3,
  placement: PlayerFigurePlacement,
  localPosition: readonly [number, number, number],
): void => {
  const { bodyPosition, yaw, blockSize, thirdPerson } = placement;
  const [localX, localY, localZ] = localPosition;
  const rearOffset = thirdPerson ? 0 : PLAYER_BODY_REAR_OFFSET;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  target.set(
    bodyPosition[0] * blockSize + sin * rearOffset + localX * cos + localZ * sin,
    bodyPosition[1] * blockSize + localY,
    bodyPosition[2] * blockSize + cos * rearOffset - localX * sin + localZ * cos,
  );
};

/** A shambler leg box's `at` is its top, at the hip; a region box's `at` is its centre. */
const legRegion = ({ size, at }: FigureBox): FigureBox => ({ size, at: [at[0], at[1] - size[1] / 2, at[2]] });

/** The body regions' boxes in the figure frame; gore lands on them, and the body simulation decides hits. */
export const PLAYER_REGION_BOXES: Readonly<Record<BodyRegion, FigureBox>> = {
  head: FIGURE_BOXES.head,
  torso: FIGURE_BOXES.body,
  leftArm: { size: [0.15, 0.42, 0.16], at: [-0.225, 1.15, 0] },
  rightArm: { size: [0.15, 0.42, 0.16], at: [0.225, 1.15, 0] },
  leftLeg: legRegion(FIGURE_BOXES.leftLeg),
  rightLeg: legRegion(FIGURE_BOXES.rightLeg),
};

/** Worn models attach where their `figureModel` is authored: about the head region's centre. */
const WORN_SLOTS: readonly WearSlot[] = ['head', 'eyes'];

type FigurePartName = 'body' | FigureLimb;

/** A figure part placed in the figure frame: its model's origin, the model turned to face -z as the figure does. */
interface FigurePart {
  name: FigurePartName;
  model: string;
  at: Vec3;
}

/** The figure's drawn layout: where each joint sits and where each part's model stands, before any pose. */
interface PlayerFigureLayout {
  hipHeight: number;
  joints: Readonly<Record<FigureJoint, Vec3>>;
  /** Where the head turns on the body. */
  head: Vec3;
  parts: readonly FigurePart[];
}

/**
 * Resolves a figure row against its models' anchors. A model faces +z with its left at +x; turned half round it
 * faces -z, so an anchor's x and z flip. The body stands with its hip anchors' midpoint at the hip height on the
 * centre line, and each limb with its joint anchor on the body's joint.
 */
const playerFigureLayout = (
  figure: FigureDef,
  models: ReadonlyMap<string, Pick<ModelDef, 'anchors'>>,
): PlayerFigureLayout => {
  const anchorOf = (model: string, anchor: string): Vec3 => {
    const point = models.get(model)?.anchors?.[anchor];
    if (!point) {
      throw new Error(`figure "${figure.id}": model "${model}" has no anchor "${anchor}"`);
    }
    return point;
  };
  const hipHeight = figure.hipHeightMetres;
  const { body } = figure;
  const left = anchorOf(body.model, body.joints.leftHip);
  const right = anchorOf(body.model, body.joints.rightHip);
  const at: Vec3 = [(left[0] + right[0]) / 2, hipHeight - (left[1] + right[1]) / 2, (left[2] + right[2]) / 2];
  const bodyPoint = (anchor: string): Vec3 => {
    const point = anchorOf(body.model, anchor);
    return [at[0] - point[0], at[1] + point[1], at[2] - point[2]];
  };
  const jointAt = (joint: FigureJoint): Vec3 => bodyPoint(body.joints[joint]);
  const joints = Object.fromEntries(
    (Object.keys(body.joints) as FigureJoint[]).map((joint) => [joint, jointAt(joint)]),
  ) as Record<FigureJoint, Vec3>;
  const limbs = FIGURE_LIMBS.map((name): FigurePart => {
    const { model, joint } = figure.limbs[name];
    const [x, y, z] = joints[FIGURE_LIMB_JOINTS[name]];
    const point = anchorOf(model, joint);
    return { name, model, at: [x + point[0], y - point[1], z + point[2]] };
  });
  return {
    hipHeight,
    joints,
    head: bodyPoint(body.head.pivot),
    parts: [{ name: 'body', model: body.model, at }, ...limbs],
  };
};

/** Where the first-person view hangs an arm, in the eye's frame (`src/render/hands.ts`, `HeldItems`). */
export const firstPersonShoulder = (figure: FigureDef, side: HandSide): Vec3 => {
  const [x, y, z] = figure.armRig.shoulderFromEye;
  return [side === 'right' ? x : -x, y, z];
};

interface FigureHeldItems {
  registry: Registry;
  hands: Readonly<Partial<Record<HandSide, Item>>>;
}

export interface PlayerFigurePose {
  body: Body;
  yaw: number;
  stepOffset: number;
  gaitPhase: number;
  moving: boolean;
  stance: PlayerStance;
  /** Real seconds since the last sync; the stance pose blends over it. */
  dt: number;
  thirdPerson?: boolean;
  inventory?: Inventory;
  heldItems?: FigureHeldItems;
  holdReady?: boolean;
  /** Draw empty fists through the same ready-pose source as the player's first-person presentation. */
  emptyFists?: boolean;
  eye?: Vec3;
  pitch?: number;
}

type StancePose = FigureDef['stancePoses']['prone'];
const STANDING_POSE: StancePose = {
  hipDropMetres: 0,
  torsoForwardDegrees: 0,
  legsForwardDegrees: 0,
  kneeBendDegrees: 0,
  ankleDegrees: 0,
  armsForwardDegrees: 0,
  elbowBendDegrees: 0,
  headUpDegrees: 0,
};
const STANCE_POSE_KEYS = Object.keys(STANDING_POSE) as (keyof StancePose)[];
const RADIANS = Math.PI / 180;
const ARM_SIDE: Partial<Record<FigurePartName, HandSide>> = { rightArm: 'right', leftArm: 'left' };
const isArm = (name: string): boolean => name === 'leftArm' || name === 'rightArm';
const isLeg = (name: string): boolean => name === 'leftLeg' || name === 'rightLeg';

/**
 * The pivots inside the drawn parts, by name, so tests and later poses find them without knowing the tree. A stance
 * turns the head, knee, ankle and elbow; the wrist carries the hand for poses that turn it.
 */
export const FIGURE_PIVOT: Readonly<Record<'head' | LegSegment | 'elbow' | 'wrist', string>> = {
  head: 'figure-head',
  shin: 'leg-knee',
  foot: 'leg-ankle',
  elbow: 'figure-elbow',
  wrist: 'figure-wrist',
};

/** Model parts turned together: the name their pivot takes, the parts, and the anchor they turn about. */
interface PivotedParts {
  name: string;
  parts: readonly string[];
  pivot: string;
}

/** Which pivot chain a drawn part carries. */
type PivotedKind = 'body' | 'leg' | 'arm';
const pivotedKind = (name: FigurePartName): PivotedKind => {
  if (isArm(name)) {
    return 'arm';
  }
  return isLeg(name) ? 'leg' : 'body';
};

/**
 * Hangs a model's parts from pivots at their joints, each pivot inside the one before, so turning one turns the parts
 * after it. The parts keep their exported placement, so with every pivot at rest the model draws unchanged.
 */
const hangFromPivots = (
  scene: Object3D,
  anchors: Readonly<Record<string, Vec3>>,
  chain: readonly PivotedParts[],
): Object3D[] => {
  scene.updateMatrixWorld(true);
  const nodes = chain.map(({ parts }) =>
    parts.map((part) => {
      let node: Object3D | undefined;
      scene.traverse((object) => {
        node ??= object.userData.part === part ? object : undefined;
      });
      if (!node) {
        throw new Error(`Figure model has no part "${part}"`);
      }
      return node;
    }),
  );
  let parent = scene;
  return chain.map(({ name, pivot: anchor }, index) => {
    const pivot = new Object3D();
    pivot.name = name;
    pivot.position.set(...anchors[anchor]!);
    scene.add(pivot);
    parent.attach(pivot);
    for (const node of nodes[index]!) {
      pivot.attach(node);
    }
    parent = pivot;
    return pivot;
  });
};

/**
 * The player's world body from its figure row, each part drawn once its model loads. The body, head included,
 * stays drawn in first person, where the head sits behind the eye; the arms show only in third person.
 */
export class PlayerMeshes {
  readonly group = new Group();
  private readonly heldFrame = new Group();
  private readonly figure: FigureDef;
  private presentation: HeldPresentation | undefined;
  private heldVersion = '';
  private lastPose: PlayerFigurePose | undefined;
  private handPose: MeleePoseFrame | undefined;
  private handling: HeldPresentationFrame = {};
  private readonly layout: PlayerFigureLayout;
  /** Each part's drawn model, once it has loaded. */
  private readonly drawn = new Map<FigurePart, Group>();
  /** Each drawn part's pivots: the body's head, each leg's knee then ankle, each arm's elbow then wrist. */
  private readonly pivots = new Map<FigurePart, Object3D[]>();
  private readonly modelDefs: ReadonlyMap<string, Pick<ModelDef, 'anchors'>>;
  private readonly pivotedParts: Readonly<Record<PivotedKind, readonly PivotedParts[]>>;
  private attachments: Group[] = [];
  private wornVersion = '';
  private readonly models: ModelLibrary;
  private readonly dummy = new Object3D();
  private readonly placement: PlayerFigurePlacement;
  private readonly localPosition: Vec3 = [0, 0, 0];
  private readonly stancePoses: FigureDef['stancePoses'];
  private readonly gait: FigureDef['gait'];
  private stance: PlayerStance = 'standing';
  /** The drawn pose blends from `blendFrom` to the stance's pose as `blendProgress` runs from 0 to 1. */
  private readonly blendFrom: StancePose = { ...STANDING_POSE };
  private blendProgress = 1;
  private readonly shownPose: StancePose = { ...STANDING_POSE };

  constructor(
    blockSize: number,
    figure: FigureDef,
    modelDefs: ReadonlyMap<string, Pick<ModelDef, 'anchors'>>,
    models: ModelLibrary,
  ) {
    this.figure = figure;
    this.heldFrame.name = 'world-held-items';
    this.group.add(this.heldFrame);
    this.layout = playerFigureLayout(figure, modelDefs);
    this.modelDefs = modelDefs;
    const { body, legRig, armRig } = figure;
    this.pivotedParts = {
      body: [{ name: FIGURE_PIVOT.head, parts: [body.head.part], pivot: body.head.pivot }],
      leg: LEG_SEGMENTS.map((segment) => ({
        name: FIGURE_PIVOT[segment],
        parts: [legRig[segment].part],
        pivot: legRig[segment].pivot,
      })),
      // The body arm bends on the same parts and pivots as the first-person rig, so both views share one arm.
      arm: [
        { name: FIGURE_PIVOT.elbow, parts: [armRig.fore.part], pivot: armRig.fore.pivot },
        {
          name: FIGURE_PIVOT.wrist,
          parts: [armRig.hand.part, armRig.fingers.part, armRig.thumb.part],
          pivot: armRig.hand.pivot,
        },
      ],
    };
    this.stancePoses = figure.stancePoses;
    this.gait = figure.gait;
    this.models = models;
    this.placement = { bodyPosition: [0, 0, 0], yaw: 0, blockSize, thirdPerson: false };
  }

  /** Whether every part's model has loaded and is drawn. */
  get loaded(): boolean {
    return this.drawn.size === this.layout.parts.length;
  }

  sync(pose: PlayerFigurePose): void {
    const { inventory, thirdPerson = false } = pose;
    this.syncWorn(inventory);
    this.blendStance(pose.stance, pose.dt);
    this.placement.bodyPosition = pose.body.pos;
    this.placement.yaw = pose.yaw;
    this.placement.thirdPerson = thirdPerson;
    this.syncModels();
    this.lastPose = pose;
    this.syncHeld(pose);
    const { kneeBendDegrees, ankleDegrees, headUpDegrees, elbowBendDegrees } = this.shownPose;
    // Models face +z, so turning about +x swings a shin back and tips a toe or the face down; a forearm bends forward
    // the other way. A stance leaves the wrist alone.
    const turns: Readonly<Record<PivotedKind, readonly number[]>> = {
      body: [-headUpDegrees],
      leg: [kneeBendDegrees, -ankleDegrees],
      arm: [-elbowBendDegrees],
    };
    for (const [part, pivots] of this.pivots) {
      turns[pivotedKind(part.name)].forEach((degrees, index) => {
        pivots[index]!.rotation.x = degrees * RADIANS;
      });
    }
    for (const [part, drawn] of this.drawn) {
      // In first person the view draws both arms, gripping or as fists (`HeldItems`), so the body's arms would double them.
      const side = ARM_SIDE[part.name];
      drawn.visible = !isArm(part.name) || (thirdPerson && !(side && this.presentation?.arms.has(side)));
      this.posePoint(part.at, part.name, pose);
      drawn.position.copy(this.dummy.position);
      drawn.quaternion.copy(this.dummy.quaternion);
      drawn.rotateY(Math.PI); // Models face +z and the figure faces -z.
    }
    if (this.attachments.length > 0) {
      this.posePoint(FIGURE_BOXES.head.at, 'head', pose);
    }
    for (const attachment of this.attachments) {
      // Worn head gear is drawn from inside in first person, so the body copy shows only in third person.
      attachment.visible = thirdPerson;
      attachment.position.copy(this.dummy.position);
      attachment.quaternion.copy(this.dummy.quaternion);
    }
  }

  dispose(): void {
    this.presentation?.dispose();
    this.heldVersion = '';
    this.lastPose = undefined;
  }

  /** Static holds share the first-person owner; view-only handling effects can update them after camera sync. */
  syncHeldView(handPose: MeleePoseFrame | undefined, handling: HeldPresentationFrame): void {
    this.handPose = handPose;
    this.handling = handling;
    if (this.lastPose) {
      this.syncHeld(this.lastPose);
    }
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: shared presentation roles and mounts resolve in one frame.
  private syncHeld(pose: PlayerFigurePose): void {
    const source = pose.heldItems ?? pose.inventory;
    this.heldFrame.visible = pose.thirdPerson === true;
    if (!source) {
      this.presentation?.clear();
      this.heldVersion = '';
      return;
    }
    const { registry, hands } = source;
    const version = `${pose.inventory?.version}:${this.models.version}:${hands.right?.uid}:${hands.right?.type}:${hands.left?.uid}:${hands.left?.type}:${pose.emptyFists}:${this.handling.readiness?.uid}`;
    const presentation = this.prepareHeld(source, version);
    this.addEmptyFists(presentation, hands, pose.emptyFists ?? false);
    const aimOffHand = firearmAimOffHand(
      hands,
      this.handling.readiness,
      (() => {
        const firearmSide = (['right', 'left'] as const).find(
          (hand) => hands[hand]?.uid === this.handling.readiness?.uid,
        );
        const side = firearmSide === 'right' ? 'left' : 'right';
        const supportArm = presentation.arms.get(side);
        return supportArm !== undefined && supportArm.parent !== presentation.torso;
      })(),
    );
    if (aimOffHand?.mode === 'support') {
      presentation.addAimSupport(aimOffHand.firearmSide);
    }
    this.positionHeldFrame(pose, registry);
    const shoulderOf = (side: HandSide): Vector3 => {
      const joint = this.layout.joints[side === 'right' ? 'rightShoulder' : 'leftShoulder'];
      this.posePoint(joint, 'body', pose);
      return this.heldFrame.worldToLocal(this.dummy.position.clone());
    };
    const holdingSide = hands.left ? 'left' : 'right';
    const leading = pose.inventory ? dominantSide(pose.inventory.character) : holdingSide;
    const handPose = this.handPose ?? readyMeleePose(pose.holdReady ?? false, this.figure.holds, leading);
    const readyAmount = this.handling.readiness ? Math.max(0, Math.min(1, this.handling.readiness.progress)) : 0;
    const easedReady = readyAmount * readyAmount * (3 - 2 * readyAmount);
    const active = firearmAimHandPose({
      side: aimOffHand?.side ?? leading,
      aimOffHand,
      readyPose: this.handling.readiness ? readyFirearmPose(leading, this.figure.holds) : undefined,
      holds: this.figure.holds,
      easedReady,
    });
    const activeHandPose = active && aimOffHand ? { ...handPose, [aimOffHand.side]: active } : handPose;
    presentation.poseStatic(hands, activeHandPose, {
      leading,
      ready: pose.holdReady ?? false,
      handling: this.handling,
      shoulderOf,
    });
    this.heldFrame.updateMatrixWorld(true);
    for (const side of presentation.arms.keys()) {
      const shoulder = shoulderOf(side);
      const anchor = presentation.gripAnchors.get(side)!;
      const hold = presentation.holds.get(side);
      anchor.position.set(...(hold?.at ?? [0, 0, 0]));
      presentation.solve(side, shoulder, presentation.displayPalms.get(side) ?? (hold ? anchor : undefined));
    }
  }

  /** Adds the unarmed half of an explicitly posed pair of hands. */
  private addEmptyFists(presentation: HeldPresentation, hands: FigureHeldItems['hands'], emptyFists: boolean): void {
    if (!emptyFists) {
      return;
    }
    for (const side of ['right', 'left'] as const) {
      if (!hands[side]) {
        presentation.addFist(side);
      }
    }
  }

  private prepareHeld({ registry, hands }: FigureHeldItems, version: string): HeldPresentation {
    if (this.presentation?.registry !== registry) {
      this.presentation?.dispose();
      this.presentation = new HeldPresentation(registry, this.figure, this.models, {
        frame: this.heldFrame,
        torso: this.heldFrame,
      });
      this.heldVersion = '';
    }
    const presentation = this.presentation!;
    if (version !== this.heldVersion) {
      presentation.clear();
      for (const side of ['right', 'left'] as const) {
        const item = hands[side];
        if (item) {
          presentation.addItem(side, item);
        }
      }
      this.heldVersion = version;
      this.heldFrame.traverse((object) => object.layers.set(PLAYER_FIGURE_LAYER));
      castsAndReceives(this.heldFrame);
    }
    return presentation;
  }

  private positionHeldFrame(pose: PlayerFigurePose, registry: Registry): void {
    const player = registry.player.get(CORE_CONTENT_IDS.player)!;
    const lowered = pose.stance === 'crouching' ? player.crouch : player.prone;
    const drop = pose.stance === 'standing' ? 0 : lowered.eyeDropMetres;
    if (pose.eye) {
      this.heldFrame.position.set(...(pose.eye.map((value) => value * this.placement.blockSize) as Vec3));
    } else {
      this.heldFrame.position.set(
        pose.body.pos[0] * this.placement.blockSize,
        pose.body.pos[1] * this.placement.blockSize + player.eye - drop + pose.stepOffset,
        pose.body.pos[2] * this.placement.blockSize,
      );
    }
    this.heldFrame.rotation.set(pose.pitch ?? 0, pose.yaw, 0, 'YXZ');
    this.heldFrame.updateMatrixWorld(true);
  }

  /** Adds each part whose model has loaded since the last sync. */
  private syncModels(): void {
    for (const part of this.layout.parts) {
      if (this.drawn.has(part) || !this.models.has(part.model)) {
        continue;
      }
      const model = new Group();
      model.name = `figure-${part.name}`;
      const scene = this.models.part(part.model)!;
      const chain = this.pivotedParts[pivotedKind(part.name)];
      this.pivots.set(part, hangFromPivots(scene, this.modelDefs.get(part.model)?.anchors ?? {}, chain));
      model.add(scene);
      model.traverse((object) => object.layers.set(PLAYER_FIGURE_LAYER));
      this.drawn.set(part, model);
      this.group.add(castsAndReceives(model));
    }
  }

  private blendStance(stance: PlayerStance, dt: number): void {
    if (stance !== this.stance) {
      this.stance = stance;
      Object.assign(this.blendFrom, this.shownPose);
      this.blendProgress = 0;
    }
    this.blendProgress = Math.min(1, this.blendProgress + dt / this.stancePoses.blendRealSeconds);
    const target = stance === 'standing' ? STANDING_POSE : this.stancePoses[stance];
    for (const key of STANCE_POSE_KEYS) {
      this.shownPose[key] = this.blendFrom[key] + (target[key] - this.blendFrom[key]) * this.blendProgress;
    }
  }

  private syncWorn(inventory?: Inventory): void {
    const version = `${inventory?.version}:${this.models.version}`;
    if (version === this.wornVersion) {
      return;
    }
    this.wornVersion = version;
    for (const attachment of this.attachments) {
      attachment.removeFromParent();
    }
    this.attachments = [];
    for (const slot of WORN_SLOTS) {
      const item = inventory?.worn[slot];
      const entry = item && defOf(inventory!.registry, item.type).wearable?.figureModel;
      const model = entry && this.models.part(entry.model);
      if (!(entry && model)) {
        continue;
      }
      model.position.set(...entry.at);
      model.rotation.set(...(entry.turn.map((degrees) => degrees * RADIANS) as [number, number, number]));
      const attachment = new Group();
      attachment.name = `worn-${slot}`;
      attachment.add(model);
      attachment.traverse((object) => object.layers.set(PLAYER_FIGURE_LAYER));
      this.attachments.push(attachment);
      this.group.add(castsAndReceives(attachment));
    }
  }

  /** A limb's walking swing about its joint, in radians: the legs swing opposite ways, each arm against its leg. */
  private gaitSwing(name: FigurePartName, gaitPhase: number): number {
    const swing = Math.sin(gaitPhase) * RADIANS;
    switch (name) {
      case 'leftLeg':
        return swing * this.gait.legSwingDegrees;
      case 'rightLeg':
        return -swing * this.gait.legSwingDegrees;
      case 'leftArm':
        return -swing * this.gait.armSwingDegrees;
      case 'rightArm':
        return swing * this.gait.armSwingDegrees;
      default:
        return 0;
    }
  }

  /**
   * Puts `dummy` at figure-frame point `at`, posed as part `name`: a limb swings about its joint and the head tips about
   * its pivot, then all lean.
   */
  private posePoint(at: Vec3, name: FigurePartName | 'head', pose: PlayerFigurePose): void {
    const { yaw, stepOffset, gaitPhase, moving } = pose;
    const hip = this.layout.hipHeight;
    const { hipDropMetres, torsoForwardDegrees, legsForwardDegrees, armsForwardDegrees, headUpDegrees } =
      this.shownPose;
    let pivot: Vec3 = [0, hip, 0];
    let stride = 0;
    if (name === 'head') {
      pivot = this.layout.head;
      stride = headUpDegrees * RADIANS;
    } else if (name !== 'body') {
      pivot = this.layout.joints[FIGURE_LIMB_JOINTS[name]];
      stride = (moving ? this.gaitSwing(name, gaitPhase) : 0) + (isArm(name) ? armsForwardDegrees * RADIANS : 0);
    }
    const [, pivotY, pivotZ] = pivot;
    const localY = pivotY + (at[1] - pivotY) * Math.cos(stride) - (at[2] - pivotZ) * Math.sin(stride);
    const localZ = pivotZ + (at[1] - pivotY) * Math.sin(stride) + (at[2] - pivotZ) * Math.cos(stride);
    // The stance swings the legs and the upper body about the hip, then lowers the hip.
    const swing = (isLeg(name) ? legsForwardDegrees : -torsoForwardDegrees) * RADIANS;
    const aboveHip = localY - hip;
    this.localPosition[0] = at[0];
    this.localPosition[1] = stepOffset + hip - hipDropMetres + aboveHip * Math.cos(swing) - localZ * Math.sin(swing);
    this.localPosition[2] = aboveHip * Math.sin(swing) + localZ * Math.cos(swing);
    if (!this.placement.thirdPerson) {
      // The eye stays over the standing column, so the lean must not carry the head, and the body behind it, ahead of the eye.
      const headAboveHip = FIGURE_BOXES.head.at[1] - hip;
      this.localPosition[2] -= headAboveHip * Math.sin(-torsoForwardDegrees * RADIANS);
    }
    setPlayerFigurePosition(this.dummy.position, this.placement, this.localPosition);
    this.dummy.rotation.order = 'YXZ';
    this.dummy.rotation.set(stride + swing, yaw, 0);
  }
}
