// A held grip is a shared spatial contract: gameplay ejection and the rendered model
// use the same metres/axes. Camera bob/recoil/roll remain cosmetic, not ballistic input.
import type { ModelDef } from './content.ts';
import type { Vec3 } from './coords.ts';
import type { HandSide } from './inventory.ts';

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
