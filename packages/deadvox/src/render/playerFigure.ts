// The player's world body: the figure row's authored models posed about their joints.

import { Group, Object3D, type Vector3 } from 'three';
import type { BodyRegion } from '../core/body.ts';
import type { FigureDef, ModelDef } from '../core/content.ts';
import type { Vec3 } from '../core/coords.ts';
import type { HandSide, Inventory } from '../core/inventory.ts';
import { defOf } from '../core/items.ts';
import type { Body } from '../core/physics.ts';
import type { PlayerStance } from '../core/playerStance.ts';
import { FIGURE_LIMB_JOINTS, FIGURE_LIMBS, type FigureJoint, type FigureLimb, type WearSlot } from '../core/schema.ts';
import { FIGURE_BOXES, type FigureBox } from '../core/zombieRegions.ts';
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
  const jointAt = (joint: FigureJoint): Vec3 => {
    const point = anchorOf(body.model, body.joints[joint]);
    return [at[0] - point[0], at[1] + point[1], at[2] - point[2]];
  };
  const joints = Object.fromEntries(
    (Object.keys(body.joints) as FigureJoint[]).map((joint) => [joint, jointAt(joint)]),
  ) as Record<FigureJoint, Vec3>;
  const limbs = FIGURE_LIMBS.map((name): FigurePart => {
    const { model, joint } = figure.limbs[name];
    const [x, y, z] = joints[FIGURE_LIMB_JOINTS[name]];
    const point = anchorOf(model, joint);
    return { name, model, at: [x + point[0], y - point[1], z + point[2]] };
  });
  return { hipHeight, joints, parts: [{ name: 'body', model: body.model, at }, ...limbs] };
};

/** Where the first-person view hangs each arm, in the eye's frame (`src/render/hands.ts`, `HeldItems`). */
export const FIRST_PERSON_SHOULDER: Readonly<Record<HandSide, Vec3>> = {
  right: [0.3, -0.55, 0.05],
  left: [-0.3, -0.55, 0.05],
};

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
}

type StancePose = FigureDef['stancePoses']['prone'];
const STANDING_POSE: StancePose = { hipDropMetres: 0, torsoForwardDegrees: 0, legsForwardDegrees: 0 };
const STANCE_POSE_KEYS = Object.keys(STANDING_POSE) as (keyof StancePose)[];
const RADIANS = Math.PI / 180;
const isArm = (name: FigurePartName): boolean => name === 'leftArm' || name === 'rightArm';
const isLeg = (name: FigurePartName): boolean => name === 'leftLeg' || name === 'rightLeg';

/**
 * The player's world body from its figure row, each part drawn once its model loads. The body, head included,
 * stays drawn in first person, where the head sits behind the eye; the arms show only in third person.
 */
export class PlayerMeshes {
  readonly group = new Group();
  private readonly layout: PlayerFigureLayout;
  /** Each part's drawn model, once it has loaded. */
  private readonly drawn = new Map<FigurePart, Group>();
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
    this.layout = playerFigureLayout(figure, modelDefs);
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
    for (const [part, drawn] of this.drawn) {
      // In first person the view draws both arms, gripping or as fists (`HeldItems`), so the body's arms would double them.
      drawn.visible = thirdPerson || !isArm(part.name);
      this.posePoint(part.at, part.name, pose);
      drawn.position.copy(this.dummy.position);
      drawn.quaternion.copy(this.dummy.quaternion);
      drawn.rotateY(Math.PI); // Models face +z and the figure faces -z.
    }
    if (this.attachments.length > 0) {
      this.posePoint(FIGURE_BOXES.head.at, 'body', pose);
    }
    for (const attachment of this.attachments) {
      // Worn head gear is drawn from inside in first person, so the body copy shows only in third person.
      attachment.visible = thirdPerson;
      attachment.position.copy(this.dummy.position);
      attachment.quaternion.copy(this.dummy.quaternion);
    }
  }

  /** Adds each part whose model has loaded since the last sync. */
  private syncModels(): void {
    for (const part of this.layout.parts) {
      if (this.drawn.has(part) || !this.models.has(part.model)) {
        continue;
      }
      const model = new Group();
      model.name = `figure-${part.name}`;
      model.add(this.models.part(part.model)!);
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

  /** Puts `dummy` at figure-frame point `at`, posed as part `name`: a limb swings about its joint, all lean. */
  private posePoint(at: Vec3, name: FigurePartName, pose: PlayerFigurePose): void {
    const { yaw, stepOffset, gaitPhase, moving } = pose;
    const hip = this.layout.hipHeight;
    const stride = moving ? this.gaitSwing(name, gaitPhase) : 0;
    const [, pivotY, pivotZ] = name === 'body' ? [0, hip, 0] : this.layout.joints[FIGURE_LIMB_JOINTS[name]];
    const localY = pivotY + (at[1] - pivotY) * Math.cos(stride) - (at[2] - pivotZ) * Math.sin(stride);
    const localZ = pivotZ + (at[1] - pivotY) * Math.sin(stride) + (at[2] - pivotZ) * Math.cos(stride);
    // The stance swings the legs and the upper body about the hip, then lowers the hip.
    const { hipDropMetres, torsoForwardDegrees, legsForwardDegrees } = this.shownPose;
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
