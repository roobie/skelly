// A held grip is a shared spatial contract: gameplay ejection and the rendered model
// use the same metres/axes. Camera bob/recoil/roll remain cosmetic, not ballistic input.
import { type AimFrame, aimBasis, NEUTRAL_AIM } from './aim.ts';
import type { ModelDef } from './content.ts';
import type { Vec3 } from './coords.ts';
import type { HandSide } from './inventory.ts';
import { readyMeleePose } from './meleePose.ts';

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

export const heldAnchorWorldPosition = ({
  model,
  anchor,
  side,
  twoHanded,
  eye,
  yaw,
  pitch,
  aimFrame,
}: {
  model: ModelDef;
  anchor: string;
  side: HandSide;
  twoHanded: boolean;
  eye: Vec3;
  yaw: number;
  pitch: number;
  aimFrame: AimFrame;
}): Vec3 => {
  const local = heldAnchorOffset(model, anchor);
  const grip = heldGripOffset(side, twoHanded);
  const offset = local.map((value, index) => value + grip[index]!) as Vec3;
  const { right, up, forward } = aimBasis(yaw, pitch, aimFrame);
  return [
    eye[0] + right[0] * offset[0] + up[0] * offset[1] - forward[0] * offset[2],
    eye[1] + right[1] * offset[0] + up[1] * offset[1] - forward[1] * offset[2],
    eye[2] + right[2] * offset[0] + up[2] * offset[1] - forward[2] * offset[2],
  ];
};

const rotateYXZ = ([x, y, z]: Vec3, [pitch, yaw, roll]: Vec3): Vec3 =>
  ry(rx(rz([x, y, z], roll), pitch), yaw);

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
  readonly loweredPitchRadians: number;
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
  loweredPitchRadians,
}: HeldFirearmTransformInput): HeldFirearmTransform => {
  if (
    !(model.grip && model.anchors?.muzzle) ||
    ![progress, loweredPitchRadians].every(Number.isFinite) ||
    progress < 0 ||
    progress > 1 ||
    loweredPitchRadians < 0
  ) {
    throw new Error(`Invalid held firearm pose for ${model.id}`);
  }
  const pose = readyMeleePose(true, leadingSide)[side];
  const eased = progress * progress * (3 - 2 * progress);
  const handRotation = aimingDownSights
    ? ([0, 0, 0] as Vec3)
    : pose.rotation.map((value) => value * eased) as Vec3;
  const loweredPitch = -loweredPitchRadians * (1 - progress);
  const applyRootRotation = (vector: Vec3): Vec3 =>
    inCameraFrame(rotateYXZ(rx(vector, loweredPitch), handRotation), progress >= 1 ? aimFrame : NEUTRAL_AIM);
  const normalRoot = heldGripOffset(side, twoHanded).map(
    (value, index) => value + pose.offset[index]! * eased,
  ) as Vec3;
  const rootOffset =
    aimingDownSights && model.sight
      ? applyRootRotation(modelToView(model, model.sight.eye.map((value, index) => value - model.grip!.at[index]!) as Vec3)).map(
          (value) => -value,
        ) as Vec3
      : normalRoot;
  const muzzleOffset = applyRootRotation(heldAnchorOffset(model, 'muzzle'));
  const muzzleDirection = applyRootRotation(modelToView(model, model.muzzleDirection ?? [1, 0, 0]));
  const muzzleUp = applyRootRotation(modelToView(model, [0, 1, 0]));
  const sightEyeOffset = model.sight
    ? applyRootRotation(modelToView(model, model.sight.eye.map((value, index) => value - model.grip!.at[index]!) as Vec3))
    : undefined;
  const sightDirection = model.sight ? applyRootRotation(modelToView(model, model.sight.direction)) : undefined;
  const sightUp = model.sight ? applyRootRotation(modelToView(model, model.sight.up)) : undefined;
  return {
    rootOffset,
    muzzleOffset,
    muzzleDirection: normalize(muzzleDirection),
    muzzleUp: normalize(muzzleUp),
    ...(sightEyeOffset ? { sightEyeOffset } : {}),
    ...(sightDirection ? { sightDirection: normalize(sightDirection) } : {}),
    ...(sightUp ? { sightUp: normalize(sightUp) } : {}),
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
