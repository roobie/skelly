import type { Vec3 } from './coords.ts';
import {
  axisRotation,
  cross,
  dot,
  multiplyRotation,
  normalize,
  type Quaternion,
  rotateVector,
  rotationBetween,
  scale,
} from './spatial.ts';

export interface AttachmentFrame {
  readonly at: Vec3;
  readonly turn?: Vec3;
  readonly direction?: Vec3;
  readonly up?: Vec3;
  readonly mountFrame?: { readonly normal: Vec3; readonly up: Vec3 };
}

export const attachmentFrame = (slot: AttachmentFrame): { at: Vec3; rotation: Quaternion } => {
  let rotation: Quaternion = [0, 0, 0, 1];
  if (slot.direction && slot.up) {
    if (!slot.mountFrame) {
      throw new Error('Fitted attachment needs an exported mount frame');
    }
    const normal = normalize(scale(slot.direction, -1));
    const normalTurn = rotationBetween(slot.mountFrame.normal, normal);
    const sourceUp = normalize(rotateVector(normalTurn, slot.mountFrame.up));
    const targetUp = normalize(slot.up);
    const twist = Math.atan2(dot(normal, cross(sourceUp, targetUp)), dot(sourceUp, targetUp));
    rotation = multiplyRotation(axisRotation(normal, twist), normalTurn);
  } else if (slot.turn) {
    const [x, y, z] = slot.turn.map((value) => (value * Math.PI) / 180) as Vec3;
    rotation = multiplyRotation(
      multiplyRotation(axisRotation([1, 0, 0], x), axisRotation([0, 1, 0], y)),
      axisRotation([0, 0, 1], z),
    );
  }
  return { at: slot.at, rotation };
};
