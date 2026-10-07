// A held grip is shared by the rendered model and gameplay rays in the same metres/axes.
// AimFrame moves both the firearm and its bore; camera bob and damage roll stay presentation-only.
import { type AimFrame, aimBasis } from './aim.ts';
import type { ModelDef } from './content.ts';
import type { Vec3 } from './coords.ts';
import type { HandSide } from './inventory.ts';
import { type MeleeHand, type MeleePoseFrame, readyMeleePose } from './meleePose.ts';
import { opticWindowDistance, PLAYER_VIEW_FOV_DEGREES } from './opticWindow.ts';

export const HOLD: Readonly<Record<HandSide, Vec3>> = {
  right: [0.2, -0.2, -0.38],
  left: [-0.2, -0.2, -0.38],
};

const TWO_HAND_GRIP: Vec3 = [0.08, -0.22, -0.42];

export const heldGripOffset = (side: HandSide, twoHanded: boolean): Vec3 =>
  twoHanded
    ? [side === 'right' ? TWO_HAND_GRIP[0] : -TWO_HAND_GRIP[0], TWO_HAND_GRIP[1], TWO_HAND_GRIP[2]]
    : [...HOLD[side]];

const rx = ([x, y, z]: Vec3, angle: number): Vec3 => [
  x,
  y * Math.cos(angle) - z * Math.sin(angle),
  y * Math.sin(angle) + z * Math.cos(angle),
];
const ry = ([x, y, z]: Vec3, angle: number): Vec3 => [
  x * Math.cos(angle) + z * Math.sin(angle),
  y,
  z * Math.cos(angle) - x * Math.sin(angle),
];
const rz = ([x, y, z]: Vec3, angle: number): Vec3 => [
  x * Math.cos(angle) - y * Math.sin(angle),
  x * Math.sin(angle) + y * Math.cos(angle),
  z,
];
const radians = (degrees: number): number => (degrees * Math.PI) / 180;

export const modelToView = (model: ModelDef, vector: Vec3): Vec3 => {
  const [x, y, z] = model.grip?.turn ?? [0, 0, 0];
  // Three's Euler XYZ, followed by rotateX(roll), then the outer hold-pose wrapper.
  const turned = rx(ry(rz(rx(vector, radians(model.roll ?? 0)), radians(z)), radians(y)), radians(x));
  return model.hold === 'upright' ? rz(turned, Math.PI / 2) : ry(turned, Math.PI / 2);
};

export const heldAnchorOffset = (model: ModelDef, name: string): Vec3 => {
  const anchor = model.anchors?.[name];
  if (!(anchor && model.grip)) {
    throw new Error(`Model ${model.id} needs ${name}/grip`);
  }
  return modelToView(model, anchor.map((value, index) => value - model.grip!.at[index]!) as Vec3);
};

const rotateYXZ = ([x, y, z]: Vec3, [pitch, yaw, roll]: Vec3): Vec3 => ry(rx(rz([x, y, z], roll), pitch), yaw);

const dot = (left: Vec3, right: Vec3): number => left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
const cross = (left: Vec3, right: Vec3): Vec3 => [
  left[1] * right[2] - left[2] * right[1],
  left[2] * right[0] - left[0] * right[2],
  left[0] * right[1] - left[1] * right[0],
];

// The full sight frame maps direction and up/cant onto the camera axes, not direction alone.
const sightFrame = (model: ModelDef): { right: Vec3; up: Vec3; forward: Vec3 } | undefined => {
  if (!model.sight) {
    return undefined;
  }
  const forward = normalize(modelToView(model, model.sight.direction));
  const sightUp = modelToView(model, model.sight.up);
  const up = normalize(sightUp.map((value, axis) => value - forward[axis]! * dot(sightUp, forward)) as Vec3);
  const right = normalize(cross(forward, up));
  return { right, up: normalize(cross(right, forward)), forward };
};

const alignToSight = (vector: Vec3, sight: ReturnType<typeof sightFrame>): Vec3 =>
  sight ? [dot(vector, sight.right), dot(vector, sight.up), -dot(vector, sight.forward)] : vector;

export const readyFirearmPose = (leading: MeleeHand): MeleePoseFrame => {
  const hands = readyMeleePose(true, leading);
  return {
    right: { ...hands.right, rotation: [0, 0, 0] },
    left: { ...hands.left, rotation: [0, 0, 0] },
  };
};

const sightEyeBehind = (model: ModelDef, fill: number | undefined, fovDegrees: number): Vec3 | undefined => {
  const { sight } = model;
  if (!sight) {
    return undefined;
  }
  const relief =
    sight.kind === 'optic' && sight.ocularDiameterMetres !== undefined && fill !== undefined
      ? opticWindowDistance(sight.ocularDiameterMetres, fill, fovDegrees)
      : sight.eyeReliefMetres;
  return [
    sight.eye[0] - sight.direction[0] * relief,
    sight.eye[1] - sight.direction[1] * relief,
    sight.eye[2] - sight.direction[2] * relief,
  ];
};

const inCameraFrame = (vector: Vec3, frame: AimFrame): Vec3 => {
  const { right, up, forward } = aimBasis(0, 0, frame);
  return [
    right[0] * vector[0] + up[0] * vector[1] - forward[0] * vector[2],
    right[1] * vector[0] + up[1] * vector[1] - forward[1] * vector[2],
    right[2] * vector[0] + up[2] * vector[1] - forward[2] * vector[2],
  ];
};

export interface HeldFirearmTransformInput {
  readonly model: ModelDef;
  readonly side: HandSide;
  readonly leadingSide: HandSide;
  readonly twoHanded: boolean;
  readonly progress: number;
  readonly aimingDownSights: boolean;
  readonly aimFrame: AimFrame;
  readonly handlingTurn?: Vec3;
  readonly loweredPitchRadians: number;
  readonly adsApertureFill?: number | undefined;
  readonly verticalFovDegrees?: number;
}

export interface HeldFirearmTransform {
  /** Held-root position in camera-local metres. */
  readonly rootOffset: Vec3;
  /** The muzzle anchor after the exact root rotation used by the held model. */
  readonly muzzleOffset: Vec3;
  readonly muzzleDirection: Vec3;
  readonly muzzleUp: Vec3;
  readonly sightEyeOffset?: Vec3;
  readonly sightDirection?: Vec3;
  readonly sightUp?: Vec3;
  /** Root rotation columns in camera axes: right, up, back. */
  readonly rootRotation: readonly [Vec3, Vec3, Vec3];
}

/** Shared simulation/render firearm pose. Anchors and directions use the model's grip frame. */
export const heldFirearmTransform = ({
  model,
  side,
  leadingSide,
  twoHanded,
  progress,
  aimingDownSights,
  aimFrame,
  handlingTurn = [0, 0, 0],
  loweredPitchRadians,
  adsApertureFill,
  verticalFovDegrees = PLAYER_VIEW_FOV_DEGREES,
}: HeldFirearmTransformInput): HeldFirearmTransform => {
  if (
    !(model.grip && model.anchors?.muzzle && [progress, loweredPitchRadians, ...handlingTurn].every(Number.isFinite)) ||
    progress < 0 ||
    progress > 1 ||
    loweredPitchRadians < 0
  ) {
    throw new Error(`Invalid held firearm pose for ${model.id}`);
  }
  const pose = readyFirearmPose(leadingSide)[side];
  const eased = progress * progress * (3 - 2 * progress);
  const handRotation = aimingDownSights ? ([0, 0, 0] as Vec3) : (pose.rotation.map((value) => value * eased) as Vec3);
  const loweredPitch = -loweredPitchRadians * (1 - progress);
  const sight = aimingDownSights ? sightFrame(model) : undefined;
  const applyAlignedRoot = (vector: Vec3, turn: Vec3): Vec3 =>
    alignToSight(rotateYXZ(rotateYXZ(vector, [loweredPitch + turn[0], turn[1], turn[2]]), handRotation), sight);
  const applyRootRotation = (vector: Vec3): Vec3 => {
    const aligned = applyAlignedRoot(vector, handlingTurn);
    return progress >= 1 ? inCameraFrame(aligned, aimFrame) : aligned;
  };
  const sightEye = sightEyeBehind(model, adsApertureFill, verticalFovDegrees);
  const normalRoot = heldGripOffset(side, twoHanded).map((value, index) => value + pose.offset[index]! * eased) as Vec3;
  // Seat the undeviated sight eye at the view; aim and handling turns then pivot the firearm off that baseline.
  const rootOffset =
    aimingDownSights && model.sight && sightEye
      ? (applyAlignedRoot(
          modelToView(model, sightEye.map((value, index) => value - model.grip!.at[index]!) as Vec3),
          [0, 0, 0],
        ).map((value) => -value) as Vec3)
      : normalRoot;
  const muzzleOffset = applyRootRotation(heldAnchorOffset(model, 'muzzle'));
  const muzzleDirection = applyRootRotation(modelToView(model, model.muzzleDirection ?? [1, 0, 0]));
  const muzzleUp = applyRootRotation(modelToView(model, [0, 1, 0]));
  const sightEyeOffset = sightEye
    ? applyRootRotation(modelToView(model, sightEye.map((value, index) => value - model.grip!.at[index]!) as Vec3))
    : undefined;
  const sightDirection = model.sight ? applyRootRotation(modelToView(model, model.sight.direction)) : undefined;
  const sightUp = model.sight ? applyRootRotation(modelToView(model, model.sight.up)) : undefined;
  const rootRotation = [
    applyRootRotation([1, 0, 0]),
    applyRootRotation([0, 1, 0]),
    applyRootRotation([0, 0, 1]),
  ] as const;
  return {
    rootOffset,
    muzzleOffset,
    muzzleDirection: normalize(muzzleDirection),
    muzzleUp: normalize(muzzleUp),
    ...(sightEyeOffset ? { sightEyeOffset } : {}),
    ...(sightDirection ? { sightDirection: normalize(sightDirection) } : {}),
    ...(sightUp ? { sightUp: normalize(sightUp) } : {}),
    rootRotation,
  };
};

const normalize = (vector: Vec3): Vec3 => {
  const length = Math.hypot(...vector);
  if (!(length > 0 && Number.isFinite(length))) {
    throw new Error('Cannot normalize a zero held-pose vector');
  }
  return vector.map((value) => value / length) as Vec3;
};

export const heldEjectionPose = ({
  model,
  side,
  twoHanded,
  eye,
  yaw,
  pitch,
}: {
  model: ModelDef;
  side: HandSide;
  twoHanded: boolean;
  eye: Vec3;
  yaw: number;
  pitch: number;
}): { origin: Vec3; direction: Vec3 } => {
  if (!(model.grip && model.anchors?.ejection && model.action)) {
    throw new Error(`Firearm model ${model.id} needs grip, ejection and action data`);
  }
  const local: Vec3 = model.anchors.ejection.map((value, index) => value - model.grip!.at[index]!) as Vec3;
  const at = modelToView(model, local);
  const grip = heldGripOffset(side, twoHanded);
  const offset: Vec3 = at.map((value, index) => value + grip[index]!) as Vec3;
  const worldOffset = ry(rx(offset, pitch), yaw);
  const vector = ry(rx(modelToView(model, model.action.ejectDirection), pitch), yaw);
  const length = Math.hypot(...vector);
  return {
    origin: worldOffset.map((value, index) => value + eye[index]!) as Vec3,
    direction: vector.map((value) => value / length) as Vec3,
  };
};
