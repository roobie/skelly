// The player's world body and held-item arms: one shared figure layout, with a
// player palette and a short first-person arm ending at each held item's grip.

import {
  BoxGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Mesh,
  MeshLambertMaterial,
  Object3D,
  Vector3,
} from 'three';
import type { BodyRegion } from '../core/body.ts';
import type { FigureDef, ModelDef } from '../core/content.ts';
import type { Vec3 } from '../core/coords.ts';
import type { HandSide, Inventory } from '../core/inventory.ts';
import { defOf } from '../core/items.ts';
import type { Body } from '../core/physics.ts';
import type { PlayerStance } from '../core/playerStance.ts';
import { FIGURE_BOX_PARTS, type FigureBoxPart, type FigureJoint, type WearSlot } from '../core/schema.ts';
import { FIGURE_BOXES, type FigureBox } from '../core/zombieRegions.ts';
import { PLAYER_ARM_BOXES } from './figure.ts';
import { withHeightFog } from './heightFog.ts';
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
/** The box layout before any joint moves a box; hit regions keep it, so gore lands where it always has. */
const PLAYER_BOXES: Readonly<Record<FigureBoxPart, FigureBox>> = {
  body: FIGURE_BOXES.body,
  head: FIGURE_BOXES.head,
  leftUpperArm: PLAYER_ARM_BOXES.leftUpperArm,
  rightUpperArm: PLAYER_ARM_BOXES.rightUpperArm,
  leftForearm: PLAYER_ARM_BOXES.leftForearm,
  rightForearm: PLAYER_ARM_BOXES.rightForearm,
  leftHand: PLAYER_ARM_BOXES.leftHand,
  rightHand: PLAYER_ARM_BOXES.rightHand,
  leftLeg: FIGURE_BOXES.leftLeg,
  rightLeg: FIGURE_BOXES.rightLeg,
  leftFoot: { size: [0.18, 0.12, 0.28], at: [-0.12, 0.06, -0.16] },
  rightFoot: { size: [0.18, 0.12, 0.28], at: [0.12, 0.06, -0.16] },
};

const WORN_ATTACHMENTS: Partial<Record<WearSlot, FigureBoxPart>> = { head: 'head', eyes: 'head' };

/** An authored part placed in the figure frame: its model's origin, the model turned to face -z as the boxes do. */
export interface AuthoredFigurePart {
  model: string;
  draws: readonly FigureBoxPart[];
  at: Vec3;
}

/** The figure's drawn layout: boxes hung from the joints, and the authored parts that draw in place of some. */
export interface PlayerFigureLayout {
  hipHeight: number;
  joints: Readonly<Record<FigureJoint, Vec3>>;
  boxes: Readonly<Record<FigureBoxPart, FigureBox>>;
  authored: readonly AuthoredFigurePart[];
}

const ARM_CHAINS: Readonly<Record<'leftShoulder' | 'rightShoulder', readonly FigureBoxPart[]>> = {
  leftShoulder: ['leftUpperArm', 'leftForearm', 'leftHand'],
  rightShoulder: ['rightUpperArm', 'rightForearm', 'rightHand'],
};
const LEGS: Readonly<Record<'leftHip' | 'rightHip', readonly FigureBoxPart[]>> = {
  leftHip: ['leftLeg', 'leftFoot'],
  rightHip: ['rightLeg', 'rightFoot'],
};

/**
 * Resolves a figure row against its models' anchors. A model faces +z with its left at +x; turned half round it
 * faces -z, the boxes' way, so an anchor's x and z flip. Each part stands with its hip joints' midpoint at the
 * figure's hip height on the centre line.
 */
const playerFigureLayout = (
  figure: FigureDef,
  models: ReadonlyMap<string, Pick<ModelDef, 'anchors'>>,
): PlayerFigureLayout => {
  const hipHeight = figure.hipHeightMetres;
  const upperArmTop = (part: FigureBoxPart): Vec3 => {
    const { at, size } = PLAYER_BOXES[part];
    return [at[0], at[1] + size[1] / 2, at[2]];
  };
  const joints: Record<FigureJoint, Vec3> = {
    leftHip: [PLAYER_BOXES.leftLeg.at[0], hipHeight, 0],
    rightHip: [PLAYER_BOXES.rightLeg.at[0], hipHeight, 0],
    leftShoulder: upperArmTop('leftUpperArm'),
    rightShoulder: upperArmTop('rightUpperArm'),
  };
  const authored = (figure.parts ?? []).flatMap((part) => {
    const anchors = models.get(part.model)?.anchors;
    const left = anchors?.[part.joints.leftHip];
    const right = anchors?.[part.joints.rightHip];
    if (!(anchors && left && right)) {
      return [];
    }
    const at: Vec3 = [(left[0] + right[0]) / 2, hipHeight - (left[1] + right[1]) / 2, (left[2] + right[2]) / 2];
    for (const [joint, anchor] of Object.entries(part.joints) as [FigureJoint, string | undefined][]) {
      const point = anchor === undefined ? undefined : anchors[anchor];
      if (point) {
        joints[joint] = [at[0] - point[0], at[1] + point[1], at[2] - point[2]];
      }
    }
    return [{ model: part.model, draws: part.draws, at }];
  });
  const boxes = { ...PLAYER_BOXES };
  for (const [joint, chain] of Object.entries(ARM_CHAINS) as ['leftShoulder' | 'rightShoulder', FigureBoxPart[]][]) {
    const top = upperArmTop(chain[0]!);
    const shift = joints[joint].map((value, axis) => value - top[axis]!);
    for (const part of chain) {
      const { at, size } = PLAYER_BOXES[part];
      boxes[part] = { size, at: [at[0] + shift[0]!, at[1] + shift[1]!, at[2] + shift[2]!] };
    }
  }
  // A box leg's `at` is its top, at the hip; it reaches the ground, and its foot sits under it.
  for (const [joint, [leg, foot]] of Object.entries(LEGS) as ['leftHip' | 'rightHip', FigureBoxPart[]][]) {
    const [x, y, z] = joints[joint];
    const { size } = PLAYER_BOXES[leg!];
    boxes[leg!] = { size: [size[0], y, size[2]], at: [x, y, z] };
    const footBox = PLAYER_BOXES[foot!];
    boxes[foot!] = { size: footBox.size, at: [x, footBox.at[1], footBox.at[2] + z] };
  }
  return { hipHeight, joints, boxes, authored };
};

const regionBox = (part: FigureBoxPart, anchoredLeg = false): FigureBox => {
  const box = PLAYER_BOXES[part];
  return {
    size: box.size,
    at: [box.at[0], box.at[1] - (anchoredLeg ? box.size[1] / 2 : 0), box.at[2]],
  };
};

export const PLAYER_REGION_BOXES: Readonly<Record<BodyRegion, FigureBox>> = {
  head: regionBox('head'),
  torso: regionBox('body'),
  leftArm: regionBox('leftUpperArm'),
  rightArm: regionBox('rightUpperArm'),
  leftLeg: regionBox('leftLeg', true),
  rightLeg: regionBox('rightLeg', true),
};

const PLAYER_COLORS: Readonly<Record<FigureBoxPart, keyof FigureDef['palette']>> = {
  body: 'shirt',
  head: 'skin',
  leftUpperArm: 'shirt',
  rightUpperArm: 'shirt',
  leftForearm: 'skin',
  rightForearm: 'skin',
  leftHand: 'skin',
  rightHand: 'skin',
  leftLeg: 'trousers',
  rightLeg: 'trousers',
  leftFoot: 'trousers',
  rightFoot: 'trousers',
};

export const FIRST_PERSON_SHOULDER: Readonly<Record<HandSide, Vec3>> = {
  right: [0.3, -0.55, 0.05],
  left: [-0.3, -0.55, 0.05],
};
/** The first-person hand's box: across the palm, along the fingers, and through from palm to back. */
export const FIRST_PERSON_PALM: Vec3 = [0.09, 0.08, 0.09];
const SEGMENT_UP = new Vector3(0, 1, 0);
const segmentDirection = new Vector3();

const armSideOf = (part: FigureBoxPart): HandSide | undefined => {
  if (part.startsWith('left')) {
    return 'left';
  }
  if (part.startsWith('right')) {
    return 'right';
  }
  return undefined;
};

/** A leg's walking swing about its hip, in radians; the two sides swing opposite ways. */
const strideOf = (part: FigureBoxPart, gaitPhase: number): number =>
  (part.startsWith('left') ? 1 : -1) * Math.sin(gaitPhase) * 0.22;

const isArmPart = (part: FigureBoxPart): boolean =>
  part.includes('UpperArm') || part.includes('Forearm') || part.includes('Hand');

const hiddenWorldArms = (inventory?: Inventory): Record<HandSide, boolean> => {
  const hidden: Record<HandSide, boolean> = { right: false, left: false };
  if (!inventory) {
    return hidden;
  }
  for (const side of ['right', 'left'] as const) {
    const held = inventory.hands[side];
    if (!held) {
      continue;
    }
    hidden[side] = true;
    if (defOf(inventory.registry, held.type).twoHanded) {
      hidden[side === 'right' ? 'left' : 'right'] = true;
    }
  }
  return hidden;
};

export const placeFirstPersonSegment = (
  mesh: Mesh,
  start: Vector3,
  end: Vector3,
  { width, depth }: { width: number; depth: number },
): void => {
  segmentDirection.subVectors(end, start);
  const length = segmentDirection.length();
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(SEGMENT_UP, segmentDirection.normalize());
  mesh.scale.set(width, length, depth);
};

/** A sleeve, skin forearm and hand whose palm anchor is exactly at `grip`. */
export const createFirstPersonArm = (palette: FigureDef['palette'], side: HandSide, grip: Vec3): Group => {
  const arm = new Group();
  arm.name = `first-person-arm-${side}`;
  const shirt = new MeshLambertMaterial({ color: palette.shirt });
  const skin = new MeshLambertMaterial({ color: palette.skin });
  const geometry = new BoxGeometry(1, 1, 1);
  const shoulder = new Vector3(...FIRST_PERSON_SHOULDER[side]);
  const wrist = new Vector3(...grip);
  const elbow = shoulder.clone().lerp(wrist, 0.56);
  const sleeve = new Mesh(geometry, shirt);
  placeFirstPersonSegment(sleeve, shoulder, elbow, { width: 0.12, depth: 0.12 });
  arm.add(sleeve);
  const forearm = new Mesh(geometry, skin);
  placeFirstPersonSegment(forearm, elbow, wrist, { width: 0.09, depth: 0.09 });
  arm.add(forearm);
  const palm = new Mesh(new BoxGeometry(...FIRST_PERSON_PALM), skin);
  palm.position.copy(wrist);
  palm.quaternion.setFromUnitVectors(SEGMENT_UP, wrist.clone().sub(elbow).normalize());
  arm.add(palm);
  const gripAnchor = new Object3D();
  gripAnchor.name = 'grip-anchor';
  gripAnchor.position.copy(wrist);
  arm.add(gripAnchor);
  return arm;
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

/**
 * The player's world body from its figure row: authored parts once their models load, boxes for the rest. The box
 * head shows only in third person; an authored head stays drawn behind the first-person eye.
 */
export class PlayerMeshes {
  readonly group = new Group();
  readonly layout: PlayerFigureLayout;
  private readonly meshes = new Map<FigureBoxPart, InstancedMesh>();
  private readonly attachments = new Map<FigureBoxPart, Group[]>();
  /** Each authored part's drawn model, once it has loaded. */
  private readonly authored = new Map<AuthoredFigurePart, Group>();
  private wornVersion = '';
  private readonly models: ModelLibrary | undefined;
  private readonly dummy = new Object3D();
  private readonly placement: PlayerFigurePlacement;
  private readonly localPosition: Vec3 = [0, 0, 0];
  private readonly stancePoses: FigureDef['stancePoses'];
  private stance: PlayerStance = 'standing';
  /** The drawn pose blends from `blendFrom` to the stance's pose as `blendProgress` runs from 0 to 1. */
  private readonly blendFrom: StancePose = { ...STANDING_POSE };
  private blendProgress = 1;
  private readonly shownPose: StancePose = { ...STANDING_POSE };

  constructor(
    blockSize: number,
    figure: FigureDef,
    modelDefs: ReadonlyMap<string, Pick<ModelDef, 'anchors'>>,
    models?: ModelLibrary,
  ) {
    const { palette } = figure;
    this.layout = playerFigureLayout(figure, modelDefs);
    this.stancePoses = figure.stancePoses;
    this.models = models;
    this.placement = { bodyPosition: [0, 0, 0], yaw: 0, blockSize, thirdPerson: false };
    for (const part of FIGURE_BOX_PARTS) {
      const mesh = new InstancedMesh(
        new BoxGeometry(1, 1, 1),
        withHeightFog(new MeshLambertMaterial({ color: palette[PLAYER_COLORS[part]] }), 'player'),
        1,
      );
      mesh.count = 0;
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.layers.set(PLAYER_FIGURE_LAYER);
      this.meshes.set(part, mesh);
      this.group.add(castsAndReceives(mesh));
    }
  }

  sync(pose: PlayerFigurePose): void {
    const { inventory, thirdPerson = false } = pose;
    this.syncWorn(inventory);
    this.blendStance(pose.stance, pose.dt);
    this.placement.bodyPosition = pose.body.pos;
    this.placement.yaw = pose.yaw;
    this.placement.thirdPerson = thirdPerson;
    const hidden = thirdPerson ? { right: false, left: false } : hiddenWorldArms(inventory);
    const modelDrawn = this.syncAuthored();
    for (const part of FIGURE_BOX_PARTS) {
      const side = armSideOf(part);
      const hiddenHeldArm = isArmPart(part) && side !== undefined && hidden[side];
      const hiddenInFirstPerson = part === 'head' && !thirdPerson && !modelDrawn.has(part);
      this.syncPart(part, pose, !(hiddenHeldArm || hiddenInFirstPerson), modelDrawn.has(part));
    }
    for (const [part, drawn] of this.authored) {
      this.posePoint(part.at, part.draws[0]!, pose);
      drawn.position.copy(this.dummy.position);
      drawn.quaternion.copy(this.dummy.quaternion);
      drawn.rotateY(Math.PI); // Models face +z and the figure faces -z.
    }
  }

  /** Poses a shown box part and its worn gear; the box itself draws only while no model draws it. */
  private syncPart(part: FigureBoxPart, pose: PlayerFigurePose, shown: boolean, modelDrawn: boolean): void {
    const mesh = this.meshes.get(part)!;
    mesh.count = shown && !modelDrawn ? 1 : 0;
    const attachments = this.attachments.get(part) ?? [];
    for (const attachment of attachments) {
      // Worn head gear is drawn from inside in first person, so the body copy shows only in third person.
      attachment.visible = shown && (pose.thirdPerson === true || part !== 'head');
    }
    if (shown) {
      this.updatePart(part, mesh, pose);
      for (const attachment of attachments) {
        attachment.position.copy(this.dummy.position);
        attachment.quaternion.copy(this.dummy.quaternion);
      }
    }
  }

  /** Adds each authored part whose model has loaded; returns the box parts those models now draw. */
  private syncAuthored(): Set<FigureBoxPart> {
    const drawn = new Set<FigureBoxPart>();
    for (const part of this.layout.authored) {
      if (!this.authored.has(part) && this.models?.has(part.model)) {
        const model = new Group();
        model.name = `figure-${part.model}`;
        model.add(this.models.part(part.model)!);
        model.traverse((object) => object.layers.set(PLAYER_FIGURE_LAYER));
        this.authored.set(part, model);
        this.group.add(castsAndReceives(model));
      }
      if (this.authored.has(part)) {
        for (const box of part.draws) {
          drawn.add(box);
        }
      }
    }
    return drawn;
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
    const version = `${inventory?.version}:${this.models?.version}`;
    if (version === this.wornVersion) {
      return;
    }
    this.wornVersion = version;
    for (const attachment of [...this.attachments.values()].flat()) {
      attachment.removeFromParent();
    }
    this.attachments.clear();
    for (const [slot, part] of Object.entries(WORN_ATTACHMENTS)) {
      if (!part) {
        continue;
      }
      const item = inventory?.worn[slot as WearSlot];
      const entry = item && defOf(inventory!.registry, item.type).wearable?.figureModel;
      const model = entry && this.models?.part(entry.model);
      if (!(entry && model)) {
        continue;
      }
      model.position.set(...entry.at);
      model.rotation.set(...(entry.turn.map((degrees) => (degrees * Math.PI) / 180) as [number, number, number]));
      const attachment = new Group();
      attachment.name = `worn-${slot}`;
      attachment.add(model);
      attachment.traverse((object) => object.layers.set(PLAYER_FIGURE_LAYER));
      this.attachments.set(part, [...(this.attachments.get(part) ?? []), attachment]);
      this.group.add(castsAndReceives(attachment));
    }
  }

  private updatePart(part: FigureBoxPart, mesh: InstancedMesh, pose: PlayerFigurePose): void {
    const box = this.layout.boxes[part];
    const isLeg = part === 'leftLeg' || part === 'rightLeg';
    this.posePoint(box.at, part, pose);
    if (isLeg && pose.moving) {
      this.dummy.rotateX(strideOf(part, pose.gaitPhase));
    }
    if (isLeg) {
      this.dummy.translateY(-box.size[1] / 2);
    }
    this.dummy.scale.set(...box.size);
    this.dummy.updateMatrix();
    mesh.setMatrixAt(0, this.dummy.matrix);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.boundingSphere = null;
  }

  /** Puts `dummy` at figure-frame point `at`, posed as `part` is: legs and feet about the hips, the rest leaning. */
  private posePoint(at: Vec3, part: FigureBoxPart, pose: PlayerFigurePose): void {
    const { yaw, stepOffset, gaitPhase, moving } = pose;
    const hip = this.layout.hipHeight;
    const isLeg = part === 'leftLeg' || part === 'rightLeg';
    const isFoot = part === 'leftFoot' || part === 'rightFoot';
    const footStride = isFoot && moving ? strideOf(part, gaitPhase) : 0;
    const localY = hip + (at[1] - hip) * Math.cos(footStride) - at[2] * Math.sin(footStride);
    const localZ = (at[1] - hip) * Math.sin(footStride) + at[2] * Math.cos(footStride);
    // The stance swings the legs and the upper body about the hip, then lowers the hip.
    const { hipDropMetres, torsoForwardDegrees, legsForwardDegrees } = this.shownPose;
    const swing = ((isLeg || isFoot ? legsForwardDegrees : -torsoForwardDegrees) * Math.PI) / 180;
    const aboveHip = localY - hip;
    this.localPosition[0] = at[0];
    this.localPosition[1] = stepOffset + hip - hipDropMetres + aboveHip * Math.cos(swing) - localZ * Math.sin(swing);
    this.localPosition[2] = aboveHip * Math.sin(swing) + localZ * Math.cos(swing);
    if (!this.placement.thirdPerson) {
      // The eye stays over the standing column, so the lean must not carry the head, and the body behind it, ahead of the eye.
      const headAboveHip = PLAYER_BOXES.head.at[1] - hip;
      this.localPosition[2] -= headAboveHip * Math.sin((-torsoForwardDegrees * Math.PI) / 180);
    }
    setPlayerFigurePosition(this.dummy.position, this.placement, this.localPosition);
    this.dummy.rotation.order = 'YXZ';
    this.dummy.rotation.set(footStride + swing, yaw, 0);
  }
}
