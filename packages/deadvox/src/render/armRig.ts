// The first-person arm is the figure's authored arm model bent at its joints (`DESIGN.md`, "Models"): each
// segment is a part of that model turned about the anchor the figure row's rig names, so both views draw one arm.

import { Box3, Group, Matrix4, Object3D, Quaternion, Vector3 } from 'three';
import type { ModelDef } from '../core/content.ts';
import type { HandSide } from '../core/inventory.ts';
import { ARM_SEGMENTS, type ArmRigDef, type ArmSegment, type HandPoseDef } from '../core/schema.ts';

/** The pivots a view arm is posed through, by name, so tests and poses find them without knowing the tree. */
export const ARM_NODE = {
  shoulder: 'arm-shoulder',
  elbow: 'arm-elbow',
  /** At the grip point on the palm's face: +z out of the palm, +y along the fingers, thumb on +x right, -x left. */
  hand: 'hand-frame',
  knuckles: 'arm-knuckles',
  thumb: 'arm-thumb',
} as const;

const RADIANS = Math.PI / 180;
const basis = (x: Vector3, y: Vector3, z: Vector3): Quaternion =>
  new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, z));
/**
 * The model's hand hangs with its fingers down (-y), its thumb forward (+z) and its palm toward the body: +x on the
 * right hand, -x on the left. These turn it into the hand frame, where the palm faces +z and the fingers run +y.
 */
const MODEL_TO_HAND: Readonly<Record<HandSide, Quaternion>> = {
  right: basis(new Vector3(0, 0, 1), new Vector3(0, -1, 0), new Vector3(1, 0, 0)),
  left: basis(new Vector3(0, 0, -1), new Vector3(0, -1, 0), new Vector3(-1, 0, 0)),
};
/** Which way the fingers curl in the model frame: toward the palm. */
const PALM_SIGN: Readonly<Record<HandSide, number>> = { right: 1, left: -1 };

export interface ArmRig {
  readonly side: HandSide;
  /** Upper arm pivot; the arm group's child, placed by `solveArmRig`. */
  readonly shoulder: Object3D;
  readonly elbow: Object3D;
  /** The hand frame at the grip point, carrying the palm, fingers and thumb. */
  readonly hand: Object3D;
  readonly upperLength: number;
  readonly foreLength: number;
  /** From the wrist to the grip point, in the hand frame. */
  readonly gripFromWrist: Vector3;
}

export interface ArmSolution {
  readonly shoulder: Vector3;
  readonly elbow: Vector3;
  readonly upper: Quaternion;
  readonly fore: Quaternion;
  readonly hand: Quaternion;
  readonly upperScale: number;
  readonly foreScale: number;
}

const partNode = (scene: Object3D, part: string): Object3D => {
  let found: Object3D | undefined;
  scene.traverse((object) => {
    found ??= object.userData.part === part ? object : undefined;
  });
  if (!found) {
    throw new Error(`Arm model has no part "${part}"`);
  }
  return found;
};

const anchorOf = (model: ModelDef, anchor: string): Vector3 => {
  const at = model.anchors?.[anchor];
  if (!at) {
    throw new Error(`Arm model "${model.id}" has no anchor "${anchor}"`);
  }
  return new Vector3(...at);
};

/**
 * Hangs the arm model's parts from pivots at their joints, the hand closed as `pose` says. The parts keep their
 * exported placement, so with every pivot at rest the rig draws exactly the model.
 */
export const buildArmRig = (
  { definition: model, scene }: { definition: ModelDef; scene: Object3D },
  rig: ArmRigDef,
  side: HandSide,
  pose: HandPoseDef,
) => {
  scene.updateMatrixWorld(true);
  const nodes = Object.fromEntries(
    ARM_SEGMENTS.map((segment) => {
      const node = partNode(scene, rig[segment].part);
      return [segment, { node, placed: node.matrixWorld.clone() }];
    }),
  ) as Record<ArmSegment, { node: Object3D; placed: Matrix4 }>;
  const pivots = Object.fromEntries(
    ARM_SEGMENTS.map((segment) => [segment, anchorOf(model, rig[segment].pivot)]),
  ) as Record<ArmSegment, Vector3>;
  const palmBounds = new Box3().setFromObject(nodes.hand.node);
  const halfThickness = (palmBounds.max.x - palmBounds.min.x) / 2;
  const hang = (segment: ArmSegment, pivot: Object3D, origin: Vector3): void => {
    const { node, placed } = nodes[segment];
    pivot.add(node);
    placed.decompose(node.position, node.quaternion, node.scale);
    node.position.sub(origin);
  };
  const shoulder = new Object3D();
  shoulder.name = ARM_NODE.shoulder;
  hang('upper', shoulder, pivots.upper);
  const elbow = new Object3D();
  elbow.name = ARM_NODE.elbow;
  hang('fore', elbow, pivots.fore);
  const hand = new Object3D();
  hand.name = ARM_NODE.hand;
  const handModel = new Group();
  handModel.name = 'hand-model';
  handModel.quaternion.copy(MODEL_TO_HAND[side]);
  hand.add(handModel);
  hang('hand', handModel, pivots.hand);
  const knuckles = new Object3D();
  knuckles.name = ARM_NODE.knuckles;
  knuckles.position.copy(pivots.fingers).sub(pivots.hand);
  knuckles.rotation.z = PALM_SIGN[side] * pose.fingersDegrees * RADIANS;
  handModel.add(knuckles);
  hang('fingers', knuckles, pivots.fingers);
  const thumb = new Object3D();
  thumb.name = ARM_NODE.thumb;
  thumb.position.copy(pivots.thumb).sub(pivots.hand);
  thumb.quaternion
    .setFromAxisAngle(new Vector3(1, 0, 0), pose.thumbAcrossDegrees * RADIANS)
    .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), PALM_SIGN[side] * pose.thumbInDegrees * RADIANS));
  handModel.add(thumb);
  hang('thumb', thumb, pivots.thumb);
  const gripFromWrist = anchorOf(model, rig.grip).sub(pivots.hand).applyQuaternion(MODEL_TO_HAND[side]);
  gripFromWrist.z += halfThickness;
  handModel.position.copy(gripFromWrist).negate();
  const modelOrigin = new Object3D();
  modelOrigin.position.copy(pivots.upper).negate();
  shoulder.add(modelOrigin);
  const built = {
    attachmentParents: new Map<string | undefined, Object3D>([
      [undefined, modelOrigin],
      [rig.upper.pivot, shoulder],
      [rig.fore.pivot, elbow],
      [rig.hand.pivot, handModel],
      [rig.fingers.pivot, knuckles],
      [rig.thumb.pivot, thumb],
    ]),
    side,
    shoulder,
    elbow,
    hand,
    upperLength: pivots.fore.distanceTo(pivots.upper),
    foreLength: pivots.hand.distanceTo(pivots.fore),
    gripFromWrist,
  };
  return built;
};

const perpendicular = (vector: Vector3, axis: Vector3, fallback: Vector3): Vector3 => {
  const out = vector.clone().addScaledVector(axis, -vector.dot(axis));
  if (out.lengthSq() < 1e-8) {
    out.copy(fallback).addScaledVector(axis, -fallback.dot(axis));
  }
  return out.normalize();
};

/** `vector` normalized, or `fallback` when it has no direction. */
const direction = (vector: Vector3, fallback: Vector3): Vector3 =>
  vector.lengthSq() < 1e-12 ? fallback.clone() : vector.clone().normalize();

/** The hand frame for a hand that continues its forearm: fingers along `forearm`, thumb up. */
const handAlongForearm = (side: HandSide, forearm: Vector3, up: Vector3, bendSide: Vector3): Quaternion => {
  const fingers = direction(forearm, up.clone().negate());
  const thumb = perpendicular(up, fingers, bendSide).multiplyScalar(PALM_SIGN[side]);
  return basis(thumb, fingers, thumb.clone().cross(fingers));
};

/** Where an arm reaches from and to, all in one frame. */
export interface ArmTarget {
  readonly shoulder: Vector3;
  /** The grip point the hand frame's origin meets. */
  readonly grip: Vector3;
  /** The hand's frame when something sets it (a screen's back, a revolver being loaded). */
  readonly handFrame?: Quaternion | undefined;
  /** The side the elbow bends toward. */
  readonly bendSide: Vector3;
  readonly up: Vector3;
}

/** Shoulder and grip contacts win over length constraints: sliding the root leaves a floating sleeve. */
export const solveArmRig = (rig: ArmRig, { shoulder, grip, handFrame, bendSide, up }: ArmTarget): ArmSolution => {
  const reach = rig.upperLength + rig.foreLength;
  const solve = (hand: Quaternion) => {
    const wrist = grip.clone().sub(rig.gripFromWrist.clone().applyQuaternion(hand));
    const toWrist = wrist.clone().sub(shoulder);
    const axis = direction(toWrist, up.clone().negate());
    const distance = toWrist.length();
    const stretch = Math.max(1, distance / reach);
    let upperLength = rig.upperLength * stretch;
    let foreLength = rig.foreLength * stretch;
    const foldedExcess = Math.max(0, Math.abs(upperLength - foreLength) - distance) / 2;
    const longer = Math.sign(upperLength - foreLength);
    upperLength -= longer * foldedExcess;
    foreLength += longer * foldedExcess;
    const along = distance > 1e-12 ? (upperLength ** 2 - foreLength ** 2 + distance ** 2) / (2 * distance) : 0;
    const height = Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2));
    const bend = perpendicular(bendSide, axis, up);
    const elbow = shoulder.clone().addScaledVector(axis, along).addScaledVector(bend, height);
    const hinge = axis.clone().cross(bend).normalize();
    const upperDown = elbow.clone().sub(shoulder).normalize().negate();
    const foreDown = wrist.clone().sub(elbow).normalize().negate();
    return {
      shoulder: shoulder.clone(),
      upperScale: upperLength / rig.upperLength,
      foreScale: foreLength / rig.foreLength,
      elbow,
      upper: basis(hinge, upperDown, hinge.clone().cross(upperDown)),
      fore: basis(hinge, foreDown, hinge.clone().cross(foreDown)),
      hand,
      forearm: foreDown.clone().negate(),
    };
  };
  if (handFrame) {
    return solve(handFrame);
  }
  const first = solve(handAlongForearm(rig.side, grip.clone().sub(shoulder).normalize(), up, bendSide));
  return solve(handAlongForearm(rig.side, first.forearm, up, bendSide));
};
