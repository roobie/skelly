import type { Bone } from './body.ts';
import { clamp, type Mat3, mulMM, rotX, rotY, rotZ, transpose } from './math.ts';
import type { EulerDeg } from './pose.ts';

const jointFrame = (bone: Bone): Mat3 => {
  if (!bone.frame) {
    throw new Error(`missing joint frame ${bone.id}`);
  }
  const { x, y, z } = bone.frame;
  return [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
};

export const jointRotation = (bone: Bone, angles: EulerDeg): Mat3 => {
  const frame = jointFrame(bone);
  return mulMM(frame, mulMM(mulMM(rotZ(angles[2]), mulMM(rotY(angles[1]), rotX(angles[0]))), transpose(frame)));
};

export const jointAngles = (bone: Bone, rotation: Mat3): EulerDeg => {
  const frame = jointFrame(bone);
  const local = mulMM(transpose(frame), mulMM(rotation, frame));
  const deg = 180 / Math.PI;
  return [
    Math.atan2(local[7], local[8]) * deg,
    Math.asin(clamp(-local[6], -1, 1)) * deg,
    Math.atan2(local[3], local[0]) * deg,
  ];
};

export const clampJointAngles = (bone: Bone, angles: EulerDeg): EulerDeg => {
  if (!bone.limits) {
    throw new Error(`missing joint limits ${bone.id}`);
  }
  const { flex, twist, abduct } = bone.limits;
  return [clamp(angles[0], ...flex), clamp(angles[1], ...twist), clamp(angles[2], ...abduct)];
};
