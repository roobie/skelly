// A held grip is shared by the rendered model and gameplay rays in the same metres/axes.
// AimFrame moves both the firearm and its bore; camera bob and damage roll stay presentation-only.
import { type AimFrame, aimBasis, NEUTRAL_AIM } from './aim.ts';
import type { ModelDef } from './content.ts';
import type { Vec3 } from './coords.ts';
import type { HandSide, Inventory } from './inventory.ts';
import { type MeleeHand, type MeleePoseFrame, readyHandPair } from './meleePose.ts';
import type { HeldPosesDef } from './schema.ts';

/** A hold authored for the right hand, mirrored across the view's x for the left. */
const mirrorViewX = (side: HandSide, [x, y, z]: Vec3): Vec3 => [side === 'right' ? x : -x, y, z];
/** A hold authored on the model's right, mirrored across the model's z for the left hand. */
const mirrorModelZ = (side: HandSide, [x, y, z]: Vec3): Vec3 => [x, y, side === 'right' ? z : -z];

/** From a long gun's grip to its butt, in the view's frame; the lowered gun turns about the butt. */
export const heldButtOffset = (model: ModelDef): Vec3 => {
  if (!(model.hands?.butt && model.grip)) {
    throw new Error(`Model ${model.id} needs a butt and a grip`);
  }
  const { grip, hands } = model;
  return modelToView(model, hands.butt!.map((value, index) => value - grip.at[index]!) as Vec3);
};

/**
 * Where a held model's grip sits in the eye's frame: a long gun's grip hangs from its seated butt, pitched down by
 * `loweredPitch` about that butt so the stock stays in the shoulder; anything else takes the fixed hold points.
 */
export const heldGripOffset = ({
  side,
  twoHanded,
  model,
  loweredPitch = 0,
  holds,
}: {
  side: HandSide;
  twoHanded: boolean;
  model?: ModelDef | undefined;
  loweredPitch?: number;
  holds: HeldPosesDef;
}): Vec3 => {
  if (model?.hands) {
    const seat = mirrorViewX(side, model.hands.seat);
    if (!model.hands.butt) {
      return seat;
    }
    const toGrip = rotateYXZ(heldButtOffset(model).map((value) => -value) as Vec3, [loweredPitch, 0, 0]);
    return seat.map((value, index) => value + toGrip[index]!) as Vec3;
  }
  return mirrorViewX(side, twoHanded ? holds.twoHand : holds.oneHand);
};

/** One hand's authored hold on `model`, for a gun held on `side`, in the view's frame about the held grip. */
export interface HeldHoldFrame {
  /** From the held grip to where the palm's face meets the model. */
  readonly at: Vec3;
  /** Which way the palm presses: the hand frame's +z. */
  readonly palm: Vec3;
  /** Which way the straight fingers point: the hand frame's +y. */
  readonly fingers: Vec3;
  /** The hand frame's +x: on the right hand the thumb's side, on the left the little finger's. */
  readonly thumbSide: Vec3;
  readonly elbowBendSide?: Vec3;
}

/**
 * Both holds are authored for a right-handed hold, so `side` is the hand holding the gun, not the hand on this hold:
 * a left-held gun mirrors the firing and the support hold together across the model's z.
 */
export const heldHoldFrame = (model: ModelDef, side: HandSide, hold: 'firing' | 'support'): HeldHoldFrame => {
  if (!(model.hands && model.grip)) {
    throw new Error(`Model ${model.id} needs hands and a grip`);
  }
  const { grip, hands } = model;
  const authored = hands[hold];
  const at = modelToView(model, mirrorModelZ(side, authored.at).map((value, index) => value - grip.at[index]!) as Vec3);
  const palm = normalize(modelToView(model, mirrorModelZ(side, authored.palm)));
  const fingers = normalize(modelToView(model, mirrorModelZ(side, authored.fingers)));
  let palmSide = side;
  if (hold === 'support') {
    palmSide = side === 'right' ? 'left' : 'right';
  }
  return {
    at,
    palm,
    fingers,
    thumbSide: cross(fingers, palm),
    ...(hands.elbowBendSide ? { elbowBendSide: mirrorViewX(palmSide, hands.elbowBendSide) } : {}),
  };
};

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
  if (!model.gun?.sight) {
    return undefined;
  }
  const forward = normalize(modelToView(model, model.gun.sight.direction));
  const sightUp = modelToView(model, model.gun.sight.up);
  const up = normalize(sightUp.map((value, axis) => value - forward[axis]! * dot(sightUp, forward)) as Vec3);
  const right = normalize(cross(forward, up));
  return { right, up: normalize(cross(right, forward)), forward };
};

const alignToSight = (vector: Vec3, sight: ReturnType<typeof sightFrame>): Vec3 =>
  sight ? [dot(vector, sight.right), dot(vector, sight.up), -dot(vector, sight.forward)] : vector;

export const throwStanceHandOffset = (side: HandSide, active: boolean, chargeProgress = 0): Vec3 => {
  if (!(Number.isFinite(chargeProgress) && chargeProgress >= 0 && chargeProgress <= 1)) {
    throw new Error('Invalid throw stance pose progress');
  }
  if (!active) {
    return [0, 0, 0];
  }
  return [side === 'right' ? 0.025 : -0.025, 0.09 + chargeProgress * 0.035, 0.1 + chargeProgress * 0.09];
};

export const throwStanceWorldOffset = (side: HandSide, yaw: number, pitch: number, chargeProgress: number): Vec3 => {
  const basis = aimBasis(yaw, pitch, NEUTRAL_AIM);
  const [right, up, back] = throwStanceHandOffset(side, true, chargeProgress);
  return [
    basis.right[0] * right + basis.up[0] * up - basis.forward[0] * back,
    basis.right[1] * right + basis.up[1] * up - basis.forward[1] * back,
    basis.right[2] * right + basis.up[2] * up - basis.forward[2] * back,
  ];
};

export const readyFirearmPose = (leading: MeleeHand, holds: HeldPosesDef): MeleePoseFrame => {
  const hands = readyHandPair(holds.readyPrimary, holds.readySupport, leading);
  return {
    right: { ...hands.right, rotation: [0, 0, 0] },
    left: { ...hands.left, rotation: [0, 0, 0] },
  };
};

export interface HeldSeatFrame {
  readonly origin: Vec3;
  readonly right: Vec3;
  readonly up: Vec3;
  readonly back: Vec3;
}

const heldSeatInView = (model: ModelDef, seat: Vec3, pitch: number, frame?: HeldSeatFrame): Vec3 => {
  if (!model.hands || model.hands.butt) {
    return seat;
  }
  if (!frame) {
    return rx(seat, -pitch);
  }
  return frame.origin.map(
    (value, axis) => value + frame.right[axis]! * seat[0] + frame.up[axis]! * seat[1] + frame.back[axis]! * seat[2],
  ) as Vec3;
};

export const heldAdsStandoffMetres = (model: ModelDef | undefined, pitch: number): number => {
  const points = model?.hands?.adsStandoffByPitch;
  if (!points) {
    return 0;
  }
  const degrees = (pitch * 180) / Math.PI;
  const index = points.findIndex((point) => point.pitchDegrees >= degrees);
  if (index <= 0) {
    return points[index === 0 ? 0 : points.length - 1]!.metres;
  }
  const before = points[index - 1]!;
  const after = points[index]!;
  const blend = (degrees - before.pitchDegrees) / (after.pitchDegrees - before.pitchDegrees);
  return before.metres + (after.metres - before.metres) * blend;
};

/**
 * The eye a sight seats on, from the view's eye: a free-held gun comes up to its firing hand's eye. A long gun keeps
 * the view's eye, where its stock seat and the ADS rolls already bring the cheek.
 */
export const heldAdsEye = (
  model: ModelDef,
  side: HandSide,
  eyes: Readonly<Record<HandSide, Vec3>> | undefined,
): Vec3 => (model.hands && !model.hands.butt && eyes ? eyes[side] : [0, 0, 0]);

const subGrip = (model: ModelDef, point: Vec3): Vec3 => point.map((v, i) => v - model.grip!.at[i]!) as Vec3;

const sightEyeBehind = (model: ModelDef, distance?: number): Vec3 | undefined => {
  const sight = model.gun?.sight;
  if (!sight) {
    return undefined;
  }
  const relief = distance ?? sight.eyeReliefMetres;
  return [
    sight.eye[0] - sight.direction[0] * relief,
    sight.eye[1] - sight.direction[1] * relief,
    sight.eye[2] - sight.direction[2] * relief,
  ];
};

const heldSightEyes = (model: ModelDef, pitch: number) => {
  const sightEye = sightEyeBehind(
    model,
    model.hands?.adsStandoffByPitch ? heldAdsStandoffMetres(model, pitch) : undefined,
  );
  const viewEye =
    model.hands?.adsViewEyeReliefMetres === undefined
      ? sightEye
      : sightEyeBehind(model, model.hands.adsViewEyeReliefMetres);
  return { sightEye, viewEye };
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
  readonly holds: HeldPosesDef;
  readonly model: ModelDef;
  readonly side: HandSide;
  readonly leadingSide: HandSide;
  readonly twoHanded: boolean;
  readonly progress: number;
  readonly aimingDownSights: boolean;
  readonly aimFrame: AimFrame;
  readonly lookPitchRadians?: number;
  readonly handlingTurn?: Vec3;
  readonly stockSeat?: Vec3 | undefined;
  readonly seatFrame?: HeldSeatFrame | undefined;
  /** Each eye from the view's eye; see `heldAdsEye`. */
  readonly adsEyes?: Readonly<Record<HandSide, Vec3>> | undefined;
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
  readonly sightEyeRangeOffsets?: readonly [Vec3, Vec3];
  readonly sightDirection?: Vec3;
  readonly sightUp?: Vec3;
  /** Root rotation columns in camera axes: right, up, back. */
  readonly rootRotation: readonly [Vec3, Vec3, Vec3];
}

export const heldTorsoForwardDegrees = ({ registry, hands }: Pick<Inventory, 'registry' | 'hands'>): number =>
  Math.max(
    0,
    ...Object.values(hands).map((item) => {
      const model = item && registry.items.get(item.type)?.model;
      return model ? (registry.models.get(model)?.hands?.torsoForwardDegrees ?? 0) : 0;
    }),
  );

export const heldLoweredPitch = (model: ModelDef | undefined, progress: number, loweredPitchRadians: number): number =>
  -(model?.hands?.loweredPitchRadians ?? loweredPitchRadians) * (1 - progress);

const restingFirearmRoot = (
  input: Pick<HeldFirearmTransformInput, 'model' | 'side' | 'twoHanded' | 'holds'>,
  loweredPitch: number,
  rise: Vec3,
): Vec3 => {
  const grip = heldGripOffset({ ...input, loweredPitch });
  return input.model.hands?.butt ? grip : (grip.map((value, axis) => value + rise[axis]!) as Vec3);
};

const seatedFirearmRoot = (model: ModelDef, seat: Vec3 | undefined, turn: (point: Vec3) => Vec3): Vec3 | undefined => {
  if (!(seat && model.hands?.butt)) {
    return undefined;
  }
  const butt = turn(heldButtOffset(model));
  return seat.map((value, axis) => value - butt[axis]!) as Vec3;
};

/** Shared simulation/render firearm pose. Anchors and directions use the model's grip frame. */
const sightRangeFrame = (model: ModelDef, rotate: (point: Vec3) => Vec3) => {
  const range = model.gun?.sight?.eyeDistanceRangeMetres;
  if (!range) {
    return {};
  }
  const sightEyeRangeOffsets = range.map((distance) =>
    rotate(modelToView(model, subGrip(model, sightEyeBehind(model, distance)!))),
  ) as [Vec3, Vec3];
  return { sightEyeRangeOffsets };
};

export const heldFirearmTransform = ({
  holds,
  model,
  side,
  leadingSide,
  twoHanded,
  progress,
  aimingDownSights,
  aimFrame,
  lookPitchRadians = 0,
  handlingTurn = [0, 0, 0],
  stockSeat,
  seatFrame,
  adsEyes,
  loweredPitchRadians,
}: HeldFirearmTransformInput): HeldFirearmTransform => {
  if (
    !(
      model.grip &&
      model.anchors?.muzzle &&
      [progress, loweredPitchRadians, lookPitchRadians, ...handlingTurn].every(Number.isFinite)
    ) ||
    progress < 0 ||
    progress > 1 ||
    loweredPitchRadians < 0
  ) {
    throw new Error(`Invalid held firearm pose for ${model.id}`);
  }
  const pose = readyFirearmPose(leadingSide, holds)[side];
  const eased = progress * progress * (3 - 2 * progress);
  const handRotation = aimingDownSights ? ([0, 0, 0] as Vec3) : (pose.rotation.map((value) => value * eased) as Vec3);
  const loweredPitch = heldLoweredPitch(model, progress, loweredPitchRadians);
  const sight = aimingDownSights ? sightFrame(model) : undefined;
  const applyAlignedRoot = (vector: Vec3, turn: Vec3): Vec3 =>
    alignToSight(rotateYXZ(rotateYXZ(vector, [loweredPitch + turn[0], turn[1], turn[2]]), handRotation), sight);
  const applyRootRotation = (vector: Vec3): Vec3 => {
    const aligned = applyAlignedRoot(vector, handlingTurn);
    return progress >= 1 ? inCameraFrame(aligned, aimFrame) : aligned;
  };
  const { sightEye, viewEye } = heldSightEyes(model, lookPitchRadians);
  const normalRoot = heldSeatInView(
    model,
    restingFirearmRoot(
      { model, side, twoHanded, holds },
      loweredPitch,
      pose.offset.map((value) => value * eased) as Vec3,
    ),
    lookPitchRadians,
    seatFrame,
  );
  // Seat the undeviated sight eye at the view; aim and handling turns then pivot the firearm off that baseline.
  const adsEye = heldAdsEye(model, side, adsEyes);
  const opticalRoot =
    aimingDownSights && sightEye
      ? (applyAlignedRoot(
          modelToView(model, sightEye.map((value, index) => value - model.grip!.at[index]!) as Vec3),
          [0, 0, 0],
        ).map((value, axis) => adsEye[axis]! - value) as Vec3)
      : normalRoot;
  const rootOffset = seatedFirearmRoot(model, stockSeat, applyRootRotation) ?? opticalRoot;
  const muzzleOffset = applyRootRotation(heldAnchorOffset(model, 'muzzle'));
  const muzzleDirection = applyRootRotation(modelToView(model, model.gun?.muzzleDirection ?? [1, 0, 0]));
  const muzzleUp = applyRootRotation(modelToView(model, [0, 1, 0]));
  const sightEyeOffset = viewEye
    ? applyRootRotation(modelToView(model, viewEye.map((value, index) => value - model.grip!.at[index]!) as Vec3))
    : undefined;
  const sightDirection = model.gun?.sight
    ? applyRootRotation(modelToView(model, model.gun.sight.direction))
    : undefined;
  const sightUp = model.gun?.sight ? applyRootRotation(modelToView(model, model.gun.sight.up)) : undefined;
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
    ...sightRangeFrame(model, applyRootRotation),
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
  holds,
  model,
  side,
  twoHanded,
  eye,
  stockSeat,
  seatFrame,
  yaw,
  pitch,
}: {
  model: ModelDef;
  side: HandSide;
  twoHanded: boolean;
  eye: Vec3;
  stockSeat?: Vec3 | undefined;
  seatFrame?: HeldSeatFrame | undefined;
  yaw: number;
  pitch: number;
  holds: HeldPosesDef;
}): { origin: Vec3; direction: Vec3 } => {
  if (!(model.grip && model.anchors?.ejection && model.gun?.action)) {
    throw new Error(`Firearm model ${model.id} needs grip, ejection and action data`);
  }
  const local: Vec3 = model.anchors.ejection.map((value, index) => value - model.grip!.at[index]!) as Vec3;
  const at = modelToView(model, local);
  const grip =
    seatedFirearmRoot(model, stockSeat, (point) => point) ??
    heldSeatInView(model, heldGripOffset({ side, twoHanded, model, holds }), pitch, seatFrame);
  const offset: Vec3 = at.map((value, index) => value + grip[index]!) as Vec3;
  const worldOffset = ry(rx(offset, pitch), yaw);
  const vector = ry(rx(modelToView(model, model.gun.action.ejectDirection), pitch), yaw);
  const length = Math.hypot(...vector);
  return {
    origin: worldOffset.map((value, index) => value + eye[index]!) as Vec3,
    direction: vector.map((value) => value / length) as Vec3,
  };
};
