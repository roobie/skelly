// The player's world body: the figure row's authored models posed about their joints.

import { Group, type Material, Mesh, type MeshStandardMaterial, Object3D, Quaternion, Vector3 } from 'three';
import type { BodyRegion } from '../core/body.ts';
import { dominantSide } from '../core/character.ts';
import type { FigureDef, ModelDef, Registry } from '../core/content.ts';
import type { Vec3 } from '../core/coords.ts';
import type { HandSide, Inventory } from '../core/inventory.ts';
import { defOf, type Item } from '../core/items.ts';
import { type MeleePoseFrame, readyMeleePose } from '../core/meleePose.ts';
import type { Body } from '../core/physics.ts';
import {
  type FigureStancePose,
  type PlayerLookPose,
  playerHeldSeatFrame,
  playerLookPose,
  playerPosePoint,
} from '../core/playerLookPose.ts';
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
import { ActorAnimator, type HeldHandlingFrame } from './actorAnimator.ts';
import { HeldPresentation } from './heldPresentation.ts';
import { LENS, type ModelLibrary } from './models.ts';
import { OwnBodyClip } from './ownBodyClip.ts';
import { castsAndReceives, PLAYER_FIGURE_LAYER, PLAYER_SELF_MASK_LAYER } from './shadowFlags.ts';
import { WornModels } from './wornModels.ts';

export interface PlayerFigurePlacement {
  bodyPosition: Vec3;
  yaw: number;
  blockSize: number;
}

/** Places a metre offset from the block-based body base exactly as the world figure is drawn. */
export const setPlayerFigurePosition = (
  target: Vector3,
  placement: PlayerFigurePlacement,
  localPosition: readonly [number, number, number],
): void => {
  const { bodyPosition, yaw, blockSize } = placement;
  const [localX, localY, localZ] = localPosition;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  target.set(
    bodyPosition[0] * blockSize + localX * cos + localZ * sin,
    bodyPosition[1] * blockSize + localY,
    bodyPosition[2] * blockSize - localX * sin + localZ * cos,
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

export interface WornPresentation {
  registry: Registry;
  worn: Readonly<Partial<Record<WearSlot, Item>>>;
}

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
    parts: [{ name: 'body', model: body.model, at }, ...limbs],
  };
};

/** Where the first-person view hangs an arm, in the eye's frame (`src/render/hands.ts`, `HeldItems`). */
export const firstPersonShoulder = (figure: FigureDef, side: HandSide): Vec3 => {
  const [x, y, z] = figure.armRig.shoulderFromEye;
  return [side === 'right' ? x : -x, y, z];
};

export const heldBodyShoulder = (
  figure: FigureDef,
  models: ReadonlyMap<string, ModelDef>,
  side: HandSide,
  { eyeMetres, leanDegrees }: { eyeMetres: number; leanDegrees: number },
): Vec3 => {
  const layout = playerFigureLayout(figure, models);
  const [x, y, z] = layout.joints[side === 'right' ? 'rightShoulder' : 'leftShoulder'];
  const lean = (leanDegrees * Math.PI) / 180;
  const aboveHip = y - layout.hipHeight;
  return [
    x,
    layout.hipHeight + aboveHip * Math.cos(lean) + z * Math.sin(lean) - eyeMetres,
    -aboveHip * Math.sin(lean) + z * Math.cos(lean),
  ];
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
  wornItems?: WornPresentation;
  heldItems?: FigureHeldItems;
  holdReady?: boolean;
  /** Draw empty fists through the same ready-pose source as the player's first-person presentation. */
  emptyFists?: boolean;
  eye?: Vec3;
  pitch?: number;
  stancePose?: FigureStancePose;
  ads?: import('../core/playerLookPose.ts').PlayerAdsPose | undefined;
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

type Outfit = FigureDef['outfits'][string];
type DressedMaterials = Map<Material, Map<string, Material>>;

/** How a figure other than the player's own is drawn: in an outfit, and on a layer other than the player's. */
interface FigureDress {
  outfit: Outfit;
  layer: number;
}

/**
 * Temporary corpse role tint; delete with #1366. Parts share skin materials, so repaint copies by colour rather
 * than changing the shared material or letting one part's tint leak into another's.
 */
const dress = (scene: Object3D, outfit: Outfit, dressed: DressedMaterials): void => {
  const repaint = (material: Material, colour: string): Material => {
    let colours = dressed.get(material);
    if (!colours) {
      colours = new Map();
      dressed.set(material, colours);
    }
    let copy = colours.get(colour);
    if (!copy) {
      copy = material.clone();
      (copy as MeshStandardMaterial).color.set(colour);
      colours.set(colour, copy);
    }
    return copy;
  };
  scene.traverse((part) => {
    const slots = typeof part.userData.part === 'string' ? outfit[part.userData.part] : undefined;
    if (!slots) {
      return;
    }
    part.traverse((object) => {
      if (!(object instanceof Mesh) || Array.isArray(object.material)) {
        return;
      }
      const { slot } = object.geometry.userData;
      if (typeof slot === 'string' && Object.hasOwn(slots, slot)) {
        object.material = repaint(object.material, slots[slot]!);
      }
    });
  });
};

/** The actor's common body and held presentation, independent of the observing camera. */
export class PlayerMeshes {
  readonly group = new Group();
  private readonly heldFrame = new Group();
  private readonly heldTorso = new Group();
  private animator: ActorAnimator | undefined;
  private readonly figure: FigureDef;
  private readonly ownBodyClip: OwnBodyClip;
  private presentation: HeldPresentation | undefined;
  private lastPose: PlayerFigurePose | undefined;
  private lookPose: PlayerLookPose | undefined;
  private handPose: MeleePoseFrame | undefined;
  private handling: HeldHandlingFrame = { firearms: [] };
  private recoil = 0;
  private readonly layout: PlayerFigureLayout;
  /** Each part's drawn model, once it has loaded. */
  private readonly drawn = new Map<FigurePart, Group>();
  /** Each drawn part's pivots: the body's head, each leg's knee then ankle, each arm's elbow then wrist. */
  private readonly pivots = new Map<FigurePart, Object3D[]>();
  private readonly modelDefs: ReadonlyMap<string, Pick<ModelDef, 'anchors'>>;
  private readonly pivotedParts: Readonly<Record<PivotedKind, readonly PivotedParts[]>>;
  private readonly attachmentFrames = new Map<string, Group>();
  private readonly baseParts = new Map<string, Object3D[]>();
  private readonly worn: WornModels;
  private readonly models: ModelLibrary;
  private layer = PLAYER_FIGURE_LAYER;
  private readonly dummy = new Object3D();
  private readonly jointTurn = new Quaternion();
  private readonly placement: PlayerFigurePlacement;
  private readonly localPosition: Vec3 = [0, 0, 0];
  private readonly stancePoses: FigureDef['stancePoses'];
  private readonly gait: FigureDef['gait'];
  private stance: PlayerStance = 'standing';
  /** The drawn pose blends from `blendFrom` to the stance's pose as `blendProgress` runs from 0 to 1. */
  private readonly blendFrom: StancePose = { ...STANDING_POSE };
  private blendProgress = 1;
  private readonly shownPose: StancePose = { ...STANDING_POSE };
  /** Set by `holdPose`: the drawn pose stays put whatever stance a sync names. */
  private fixedPose = false;
  private outfit: Outfit | undefined;
  private readonly dressed: DressedMaterials = new Map();

  constructor(
    blockSize: number,
    figure: FigureDef,
    modelDefs: ReadonlyMap<string, Pick<ModelDef, 'anchors'>>,
    models: ModelLibrary,
  ) {
    this.figure = figure;
    this.ownBodyClip = new OwnBodyClip(figure.aimPose.ads.ownBodyClipMetres);
    this.worn = new WornModels(figure, models, this.attachmentFrames, this.baseParts);
    this.heldFrame.name = 'world-held-items';
    this.group.add(this.heldFrame);
    this.heldFrame.add(this.heldTorso);
    this.layout = playerFigureLayout(figure, modelDefs);
    this.modelDefs = modelDefs;
    const { body, legRig, armRig } = figure;
    this.pivotedParts = {
      body: [
        { name: 'figure-spine', parts: [body.spine.part], pivot: body.spine.pivot },
        { name: 'figure-neck', parts: [body.neck.part], pivot: body.neck.pivot },
        { name: FIGURE_PIVOT.head, parts: [body.head.part], pivot: body.head.pivot },
      ],
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
    this.placement = { bodyPosition: [0, 0, 0], yaw: 0, blockSize };
  }

  setLayer(layer: number): void {
    this.layer = layer;
    this.group.traverse((object) => object.layers.set(layer));
  }

  /** Whether every part's model has loaded and is drawn. */
  get loaded(): boolean {
    return this.drawn.size === this.layout.parts.length;
  }

  /** Dresses a figure other than the player's own. Parts take it as they load, so it comes before the first sync. */
  dress({ outfit, layer }: FigureDress): void {
    this.outfit = outfit;
    this.layer = layer;
  }

  /** Draws `pose` from now on, at once and whatever stance later syncs name, as a body that no longer moves. */
  holdPose(pose: Omit<StancePose, 'hipDropMetres'>): void {
    Object.assign(this.shownPose, pose, { hipDropMetres: 0 });
    this.fixedPose = true;
  }

  sync(pose: PlayerFigurePose): void {
    if (!this.fixedPose) {
      if (pose.stancePose) {
        Object.assign(this.shownPose, pose.stancePose);
      } else {
        this.blendStance(pose.stance, pose.dt);
      }
    }
    this.lookPose = playerLookPose({
      figure: this.figure,
      models: this.modelDefs,
      pitch: pose.pitch ?? 0,
      stance: pose.stance,
      stancePose: this.shownPose,
      ads: pose.ads,
    });
    this.placement.bodyPosition = pose.body.pos;
    this.placement.yaw = pose.yaw;
    this.syncModels();
    this.worn.sync(pose.wornItems ?? pose.inventory);
    this.lastPose = pose;
    this.syncHeld(pose);
    this.ownBodyClip.active = this.layer === PLAYER_FIGURE_LAYER && pose.ads !== undefined && pose.stance !== 'prone';
    this.ownBodyClip.attach(this.drawn.values());
    const { kneeBendDegrees, ankleDegrees, headUpDegrees, elbowBendDegrees } = this.shownPose;
    // Models face +z, so turning about +x swings a shin back and tips a toe or the face down; a forearm bends forward
    // the other way. A stance leaves the wrist alone.
    const turns: Readonly<Record<PivotedKind, readonly number[]>> = {
      body: this.fixedPose
        ? [0, 0, -headUpDegrees]
        : [-this.lookPose.spineTurn / RADIANS, -this.lookPose.neckTurn / RADIANS, -this.lookPose.headTurn / RADIANS],
      leg: [kneeBendDegrees, -ankleDegrees],
      arm: [-elbowBendDegrees],
    };
    for (const [part, pivots] of this.pivots) {
      turns[pivotedKind(part.name)].forEach((degrees, index) => {
        pivots[index]!.rotation.x = degrees * RADIANS;
      });
      if (part.name === 'body' && !this.fixedPose) {
        const look = this.lookPose;
        [look.spineRotation, look.neckRotation, look.headRotation].forEach((turn, index) => {
          pivots[index]!.quaternion.set(-turn[0], turn[1], -turn[2], turn[3]);
        });
        const anchors = this.modelDefs.get(part.model)!.anchors!;
        pivots[2]!.position
          .set(...anchors[this.figure.body.head.pivot]!)
          .sub(new Vector3(...anchors[this.figure.body.neck.pivot]!))
          .multiplyScalar(look.neckScale);
        pivots[1]!.getObjectByName('figure-neck-skin')!.scale.y = look.neckScale;
      }
    }
    for (const [part, drawn] of this.drawn) {
      const side = ARM_SIDE[part.name];
      drawn.visible = !(side && this.presentation?.arms.has(side));
      this.posePoint(part.at, part.name, pose, part.name === 'body');
      drawn.position.copy(this.dummy.position);
      drawn.quaternion.copy(this.dummy.quaternion);
      drawn.rotateY(Math.PI); // Models face +z and the figure faces -z.
    }
    this.applySelfMask();
  }

  get stockSeats(): PlayerLookPose['stockSeats'] | undefined {
    return this.lookPose?.stockSeats;
  }

  get adsEyes(): PlayerLookPose['eyes'] | undefined {
    return this.lookPose?.eyes;
  }

  dispose(): void {
    this.animator?.dispose();
    this.animator = undefined;
    this.presentation = undefined;
    this.lastPose = undefined;
  }

  /** Actor action input is independent of the observing camera. */
  syncHeldView(
    handPose: MeleePoseFrame | undefined,
    handling: HeldHandlingFrame,
    recoil = 0,
  ): HeldPresentation | undefined {
    this.handPose = handPose;
    this.handling = handling;
    this.recoil = recoil;
    if (this.lastPose) {
      this.syncHeld(this.lastPose);
    }
    return this.presentation;
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: shared presentation roles and worn mounts resolve in one frame.
  private syncHeld(pose: PlayerFigurePose): void {
    const source = pose.heldItems ?? pose.inventory;
    this.heldFrame.visible = true;
    if (!source) {
      this.animator?.dispose();
      this.animator = undefined;
      this.presentation = undefined;
      return;
    }
    const { registry, hands } = source;
    this.positionHeldFrame(pose);
    const shoulderOf = (side: HandSide): Vector3 => {
      const joint = this.layout.joints[side === 'right' ? 'rightShoulder' : 'leftShoulder'];
      this.posePoint(joint, 'body', pose);
      return this.heldFrame.worldToLocal(this.dummy.position.clone());
    };
    const holdingSide = hands.left ? 'left' : 'right';
    const leading = pose.inventory ? dominantSide(pose.inventory.character) : holdingSide;
    const handPose = this.handPose ?? readyMeleePose(pose.holdReady ?? false, this.figure.holds, leading);
    if (this.presentation?.registry !== registry) {
      this.animator?.dispose();
      this.presentation = new HeldPresentation(registry, this.figure, this.models, {
        frame: this.heldFrame,
        torso: this.heldTorso,
      });
      this.animator = new ActorAnimator(source, this.presentation, shoulderOf, {
        emptyFists: false,
        shouldersFollowTorso: false,
      });
    }
    this.presentation!.stockSeats = this.lookPose!.stockSeats;
    this.presentation!.seatFrame = playerHeldSeatFrame(this.lookPose!, pose.pitch ?? 0);
    this.presentation!.adsEyes = this.lookPose!.eyes;
    this.animator!.setSource(source);
    this.animator!.setShoulders(shoulderOf);
    const readyGun = pose.holdReady && Object.values(hands).find((item) => item && defOf(registry, item.type).firearm);
    const readiness =
      this.handling.readiness ?? (readyGun ? { uid: readyGun.uid, progress: 1, aimingDownSights: false } : undefined);
    this.animator!.update(
      {
        position: this.heldFrame.position.clone(),
        quaternion: this.heldFrame.quaternion.clone(),
        rotation: { x: pose.pitch ?? 0, y: pose.yaw },
      },
      {
        pose: handPose,
        recoil: this.recoil,
        emptyFists: pose.emptyFists ?? false,
        handling: { ...this.handling, ...(readiness ? { readiness } : {}) },
      },
    );
    this.heldFrame.traverse((object) => object.layers.set(this.layer));
    castsAndReceives(this.heldFrame);
    this.presentation.syncWorn(pose.wornItems ?? pose.inventory);
    this.ownBodyClip.attach(this.presentation.arms.values());
    for (const [part, drawn] of this.drawn) {
      const side = ARM_SIDE[part.name];
      if (side) {
        drawn.visible = !this.presentation!.arms.has(side);
      }
    }
  }

  private positionHeldFrame(pose: PlayerFigurePose): void {
    if (pose.eye) {
      this.heldFrame.position.set(...(pose.eye.map((value) => value * this.placement.blockSize) as Vec3));
    } else {
      setPlayerFigurePosition(this.heldFrame.position, this.placement, this.lookPose!.eye);
    }
    this.heldFrame.position.y += pose.stepOffset;
    this.heldFrame.rotation.set(pose.pitch ?? 0, pose.yaw, 0, 'YXZ');
    this.heldFrame.updateMatrixWorld(true);
  }

  private addNeckSkin(part: FigurePart): void {
    if (part.name !== 'body') {
      return;
    }
    const neck = this.pivots.get(part)![1]!;
    const skin = new Group();
    skin.name = 'figure-neck-skin';
    const nodes = neck.children.filter((node) => node.userData.part === this.figure.body.neck.part);
    neck.add(skin);
    for (const node of nodes) {
      skin.attach(node);
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
      const scene = this.models.part(part.model)!;
      if (this.outfit) {
        dress(scene, this.outfit, this.dressed);
      }
      const chain = this.pivotedParts[pivotedKind(part.name)];
      this.pivots.set(part, hangFromPivots(scene, this.modelDefs.get(part.model)?.anchors ?? {}, chain));
      this.addNeckSkin(part);
      scene.traverse((node) => {
        if (typeof node.userData.part === 'string') {
          const key = `${part.name}/${node.userData.part}`;
          const nodes = this.baseParts.get(key) ?? [];
          nodes.push(node);
          this.baseParts.set(key, nodes);
        }
      });
      model.add(scene);
      model.traverse((object) => object.layers.set(this.layer));
      this.drawn.set(part, model);
      this.group.add(castsAndReceives(model));
      for (const [name, entry] of Object.entries(this.figure.attachmentFrames)) {
        if (entry.part !== part.name) {
          continue;
        }
        const index = chain.findIndex((pivot) => pivot.pivot === entry.pivot);
        const parent = entry.pivot === undefined ? scene : this.pivots.get(part)![index]!;
        const frame = new Group();
        frame.name = `wear-frame-${name}`;
        frame.layers.set(this.layer);
        frame.position.set(...entry.at);
        frame.rotation.set(...(entry.turn.map((degrees) => degrees * RADIANS) as Vec3));
        parent.add(frame);
        this.attachmentFrames.set(name, frame);
      }
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

  private applySelfMask(): void {
    if (this.layer !== PLAYER_FIGURE_LAYER) {
      return;
    }
    const adsLayer = this.ownBodyClip.active ? PLAYER_SELF_MASK_LAYER : this.layer;
    for (const role of this.figure.aimPose.ads.ownBodyHide) {
      for (const node of this.baseParts.get(`body/${this.figure.body[role].part}`) ?? []) {
        node.traverse((object) => object.layers.set(adsLayer));
      }
    }
    for (const pivots of this.pivots.values()) {
      const head = pivots.find((pivot) => pivot.name === FIGURE_PIVOT.head);
      head?.traverse((object) => object.layers.set(PLAYER_SELF_MASK_LAYER));
    }
    // Head-mounted gear stays on its own frame; only its optical interior remains transitional.
    for (const [name, frame] of this.attachmentFrames) {
      const entry = this.figure.attachmentFrames[name]!;
      const layer = entry.insideView || this.adsMasksFrame(entry) ? PLAYER_SELF_MASK_LAYER : this.layer;
      frame.traverse((object) => object.layers.set(layer));
    }
    for (const group of this.worn.groupsOf('eyes')) {
      group.traverse((object) => object.layers.set(PLAYER_SELF_MASK_LAYER));
    }
  }

  private adsMasksFrame(frame: FigureDef['attachmentFrames'][string]): boolean {
    return (
      this.ownBodyClip.active &&
      frame.part === 'body' &&
      this.figure.aimPose.ads.ownBodyHide.some((role) => this.figure.body[role].pivot === frame.pivot)
    );
  }

  aimDirection(out: Vector3): void {
    this.heldFrame.getWorldDirection(out).negate();
  }

  eyePosition(out: Vector3): void {
    this.heldFrame.getWorldPosition(out);
  }

  shoulderPosition(side: HandSide, out: Vector3): void {
    if (!this.lastPose) {
      return;
    }
    this.posePoint(this.layout.joints[side === 'right' ? 'rightShoulder' : 'leftShoulder'], 'body', this.lastPose);
    out.copy(this.dummy.position);
  }

  private shownModelOf(item: Item): Object3D | undefined {
    const direct = this.animator?.modelOf(item);
    if (direct) {
      return direct;
    }
    const source = this.lastPose?.heldItems ?? this.lastPose?.inventory;
    const contains = (candidate: Item): boolean =>
      candidate === item ||
      Object.values(candidate.slots ?? {}).some((child) => child !== undefined && contains(child));
    const root = Object.values(source?.hands ?? {}).find((entry) => entry && contains(entry));
    if (root) {
      return this.animator?.modelOf(root);
    }
    return this.worn.modelOf(item);
  }

  lensOf(item: Item, out: Vector3): boolean {
    const lens = this.shownModelOf(item)?.getObjectByName(LENS);
    if (!lens) {
      return false;
    }
    this.group.updateMatrixWorld(true);
    lens.getWorldPosition(out);
    return true;
  }

  lightPositionOf(item: Item, out: Vector3): boolean {
    const model = this.shownModelOf(item);
    if (!model) {
      return false;
    }
    this.group.updateMatrixWorld(true);
    if (!this.lensOf(item, out)) {
      model.getWorldPosition(out);
    }
    return true;
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
   * Puts `dummy` at figure-frame point `at`, posed as part `name`: a limb swings about its joint, then all lean.
   */
  private posePoint(at: Vec3, name: FigurePartName, pose: PlayerFigurePose, bodyRoot = false): void {
    const { yaw, stepOffset, gaitPhase, moving } = pose;
    const hip = this.layout.hipHeight;
    const { hipDropMetres, torsoForwardDegrees, legsForwardDegrees, armsForwardDegrees } = this.shownPose;
    let pivot: Vec3 = [0, hip, 0];
    let stride = 0;
    if (name !== 'body') {
      pivot = this.layout.joints[FIGURE_LIMB_JOINTS[name]];
      stride = (moving ? this.gaitSwing(name, gaitPhase) : 0) + (isArm(name) ? armsForwardDegrees * RADIANS : 0);
    }
    const [, pivotY, pivotZ] = pivot;
    const localY = pivotY + (at[1] - pivotY) * Math.cos(stride) - (at[2] - pivotZ) * Math.sin(stride);
    const localZ = pivotZ + (at[1] - pivotY) * Math.sin(stride) + (at[2] - pivotZ) * Math.cos(stride);
    // The stance swings the legs and the upper body about the hip, then lowers the hip.
    if (!(isLeg(name) || bodyRoot || this.fixedPose)) {
      const point = playerPosePoint(this.lookPose!, [at[0], localY, localZ], 'torso');
      point[1] += stepOffset;
      setPlayerFigurePosition(this.dummy.position, this.placement, point);
      this.dummy.rotation.set(this.lookPose!.hipTurn, yaw, 0, 'YXZ');
      this.dummy.quaternion.multiply(this.jointTurn.fromArray(this.lookPose!.spineRotation));
      this.dummy.rotateX(stride);
      return;
    }
    const upperSwing = this.fixedPose ? -torsoForwardDegrees * RADIANS : this.lookPose!.hipTurn;
    const swing = isLeg(name) ? legsForwardDegrees * RADIANS : upperSwing;
    const aboveHip = localY - hip;
    this.localPosition[0] = at[0];
    this.localPosition[1] = stepOffset + hip - hipDropMetres + aboveHip * Math.cos(swing) - localZ * Math.sin(swing);
    this.localPosition[2] = aboveHip * Math.sin(swing) + localZ * Math.cos(swing);
    setPlayerFigurePosition(this.dummy.position, this.placement, this.localPosition);
    this.dummy.rotation.order = 'YXZ';
    this.dummy.rotation.set(stride + swing, yaw, 0);
  }
}
