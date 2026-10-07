import type { Bone } from '../core/body.ts';
import {
  applyPoint,
  IDENTITY_M,
  type Mat3,
  mat3ToQuat,
  mulMM,
  mulMV,
  type Quat,
  quatToMat3,
  rotX,
  rotY,
  slerpQuat,
  type Transform,
  transpose,
  type Vec3,
} from '../core/math.ts';
import { boneTransforms, type Pose } from '../core/pose.ts';
import type { LookAtProfile } from './lookAtProfiles.ts';

export type LookAtState = Quat;
export const LOOK_AT_REST: LookAtState = [0, 0, 0, 1];

export interface LookAtResult {
  readonly pose: Pose;
  readonly transforms: ReadonlyMap<string, Transform>;
  readonly state: LookAtState;
}

export interface LookAtInput {
  readonly bones: readonly Bone[];
  readonly pose: Pose;
  readonly target: Vec3;
  readonly profile: LookAtProfile;
  readonly state: LookAtState;
  readonly gazeFrameDelta: number;
  readonly baseTransforms?: ReadonlyMap<string, Transform>;
}

const radians = (degreesValue: number): number => (degreesValue * Math.PI) / 180;
const degrees = (radiansValue: number): number => (radiansValue * 180) / Math.PI;
const within = (value: number, maximum: number): boolean => Math.abs(value) <= radians(maximum) + 1e-9;

/** Yaw and pitch of a correction, measured by where it points the rig's forward axis. */
const correctionAngles = (rotation: Mat3): readonly [number, number] => {
  const [x, y, z] = mulMV(rotation, [0, 0, -1]);
  return [Math.atan2(-x, -z), Math.atan2(y, Math.hypot(x, z))];
};

const splitCorrection = (total: Mat3): { readonly neck: Mat3; readonly head: Mat3 } => {
  const neck = quatToMat3(slerpQuat(LOOK_AT_REST, mat3ToQuat(total), 0.5));
  return { neck, head: mulMM(total, transpose(neck)) };
};

/** Clamp the combined gaze turn so both contributing joints stay within their own rig limits. */
const clampCorrection = (total: Mat3, profile: LookAtProfile): Mat3 => {
  const fits = (fraction: number): boolean => {
    const candidate = quatToMat3(slerpQuat(LOOK_AT_REST, mat3ToQuat(total), fraction));
    const split = splitCorrection(candidate);
    const [neckYaw, neckPitch] = correctionAngles(split.neck);
    const [headYaw, headPitch] = correctionAngles(split.head);
    return (
      within(neckYaw, profile.neck.yawDeg) &&
      within(neckPitch, profile.neck.pitchDeg) &&
      within(headYaw, profile.head.yawDeg) &&
      within(headPitch, profile.head.pitchDeg)
    );
  };
  if (fits(1)) {
    return total;
  }
  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 16; iteration++) {
    const middle = (low + high) / 2;
    if (fits(middle)) {
      low = middle;
    } else {
      high = middle;
    }
  }
  return quatToMat3(slerpQuat(LOOK_AT_REST, mat3ToQuat(total), low));
};

const correctionStep = (current: LookAtState, target: Mat3, maxRadians: number): LookAtState => {
  const targetQuat = mat3ToQuat(target);
  const dot = Math.abs(
    current[0] * targetQuat[0] + current[1] * targetQuat[1] + current[2] * targetQuat[2] + current[3] * targetQuat[3],
  );
  const angle = 2 * Math.acos(Math.max(-1, Math.min(1, dot)));
  if (angle <= 1e-9 || maxRadians <= 0) {
    return angle <= 1e-9 ? targetQuat : current;
  }
  return slerpQuat(current, targetQuat, Math.min(1, maxRadians / angle));
};

/** Add a bounded, smoothed, presentation-only gaze correction to a humanoid pose. `target` is in the
 * actor's root-local frame; the caller owns the transient turn state and decides when tracking is disabled. */
export const lookAtPose = ({
  bones,
  pose,
  target,
  profile,
  state,
  gazeFrameDelta,
  baseTransforms = boneTransforms(bones, pose),
}: LookAtInput): LookAtResult => {
  const neck = bones.find((bone) => bone.id === 'neck');
  const head = bones.find((bone) => bone.id === 'head');
  const headTransform = baseTransforms.get('head');
  if (!(neck && head && headTransform) || Math.hypot(...target) === 0) {
    return { pose, transforms: baseTransforms, state: LOOK_AT_REST };
  }

  const headCenter = [
    (head.head[0] + head.tail[0]) / 2,
    (head.head[1] + head.tail[1]) / 2,
    (head.head[2] + head.tail[2]) / 2,
  ] as const;
  const fromHead = applyPoint(headTransform, headCenter);
  const direction = [target[0] - fromHead[0], target[1] - fromHead[1], target[2] - fromHead[2]] as const;
  if (Math.hypot(...direction) < 1e-9) {
    return { pose, transforms: baseTransforms, state: LOOK_AT_REST };
  }

  const targetYaw = Math.atan2(-direction[0], -direction[2]);
  const targetPitch = Math.atan2(direction[1], Math.hypot(direction[0], direction[2]));
  const targetOrientation = mulMM(rotY(degrees(targetYaw)), rotX(degrees(targetPitch)));
  const required = mulMM(targetOrientation, transpose(headTransform.r));
  const bounded = clampCorrection(required, profile);
  const nextState = correctionStep(state, bounded, radians(profile.turnRateDegPerSecond) * Math.max(0, gazeFrameDelta));
  const applied = quatToMat3(nextState);
  const { neck: neckCorrection, head: headCorrection } = splitCorrection(applied);

  const parentTransform = neck.parent ? baseTransforms.get(neck.parent) : undefined;
  const neckParentRotation = parentTransform?.r ?? IDENTITY_M;
  const neckLocal = pose.rotations.neck ?? IDENTITY_M;
  const neckLocalCorrection = mulMM(transpose(neckParentRotation), mulMM(neckCorrection, neckParentRotation));
  const nextNeck = mulMM(neckLocalCorrection, neckLocal);

  // The neck correction changes the head's parent frame. Conjugate the head's remaining world-space
  // turn through that updated parent so the two joints together apply exactly `applied`.
  const updatedHeadParent = mulMM(neckCorrection, baseTransforms.get('neck')!.r);
  const headLocalCorrection = mulMM(transpose(updatedHeadParent), mulMM(headCorrection, updatedHeadParent));
  const rotations = {
    ...pose.rotations,
    neck: nextNeck,
    head: mulMM(headLocalCorrection, pose.rotations.head ?? IDENTITY_M),
  };
  const lookPose: Pose = { root: pose.root, rotations };
  return { pose: lookPose, transforms: boneTransforms(bones, lookPose), state: nextState };
};
