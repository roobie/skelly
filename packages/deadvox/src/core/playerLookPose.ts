import { adsRollDegrees, nearestSightEyeOffset } from './adsView.ts';
import { type AimFrame, NEUTRAL_AIM } from './aim.ts';
import type { FigureDef, ModelDef } from './content.ts';
import type { Vec3 } from './coords.ts';
import { type HeldSeatFrame, heldAdsEye, heldFirearmTransform } from './heldPose.ts';
import type { HandSide } from './inventory.ts';
import type { LeanFrame } from './lean.ts';
import type { PlayerStance } from './playerStance.ts';
import {
  add,
  axisRotation,
  inverseRotation,
  multiplyRotation,
  type Quaternion,
  rotateVector,
  rotationBetween,
  sub,
} from './spatial.ts';

const RADIANS = Math.PI / 180;
type Models = ReadonlyMap<string, Pick<ModelDef, 'anchors'>>;
export type FigureStancePose = FigureDef['stancePoses']['prone'];

export const figureStancePose = (figure: FigureDef, stance: PlayerStance, ads = false): FigureStancePose => {
  if (stance === 'standing') {
    return {
      hipDropMetres: 0,
      torsoForwardDegrees: 0,
      legsForwardDegrees: 0,
      kneeBendDegrees: 0,
      ankleDegrees: 0,
      armsForwardDegrees: 0,
      elbowBendDegrees: 0,
      headUpDegrees: 0,
    };
  }
  return stance === 'prone' && ads ? figure.proneAdsPose : figure.stancePoses[stance];
};

export const playerLookLean = (figure: FigureDef, pitch: number, stance: PlayerStance, ads = false): number => {
  const { startPitchDegrees, torsoForwardDegrees } = figure.lookDownLean;
  const progress = Math.max(0, Math.min(1, (-pitch / RADIANS - startPitchDegrees) / (90 - startPitchDegrees)));
  const stanceLean = figureStancePose(figure, stance, ads).torsoForwardDegrees;
  return Math.min(torsoForwardDegrees * progress, Math.max(0, 90 - stanceLean)) * RADIANS;
};

const rotate = ([x, y, z]: Vec3, angle: number): Vec3 => [
  x,
  y * Math.cos(angle) - z * Math.sin(angle),
  y * Math.sin(angle) + z * Math.cos(angle),
];
const turnX = (angle: number): Quaternion => axisRotation([1, 0, 0], angle);
const turnZ = (angle: number): Quaternion => axisRotation([0, 0, 1], angle);
const about = (point: Vec3, pivot: Vec3, rotation: Quaternion): Vec3 =>
  add(rotateVector(rotation, sub(point, pivot)), pivot);

export interface PlayerAdsPose {
  readonly model: ModelDef;
  readonly side: HandSide;
  readonly aimFrame?: AimFrame | undefined;
  /** How far the view has carried the aim from hip to sights; 1 is fully sighted, 0 still hip. */
  readonly aim?: number;
}

export interface PlayerLookPose {
  /** Seats stay in the undeviated look frame; the held transform applies the same outer cant once. */
  readonly unleaned?: PlayerLookPose;
  readonly lateralLean?: { readonly frame: LeanFrame; readonly rotation: Quaternion; readonly pivot: Vec3 };
  readonly hip: Vec3;
  readonly spine: Vec3;
  readonly neck: Vec3;
  readonly head: Vec3;
  readonly hipTurn: number;
  readonly spineTurn: number;
  readonly neckTurn: number;
  readonly headTurn: number;
  readonly hipDrop: number;
  readonly spineRotation: Quaternion;
  readonly neckRotation: Quaternion;
  readonly headRotation: Quaternion;
  readonly neckScale: number;
  readonly eyeFromHead: Vec3;
  readonly eye: Vec3;
  /** Each eye from `eye`, in the look's frame with the ADS head roll applied. */
  readonly eyes: Readonly<Record<HandSide, Vec3>>;
  readonly shoulders: Readonly<Record<HandSide, Vec3>>;
  readonly stockSeats: Readonly<Record<HandSide, Vec3>>;
  /** Lying prone and aiming down sights: elbows take the ground and the support hand holds closer. */
  readonly proneAds: boolean;
}

export const playerPosePoint = (pose: PlayerLookPose, point: Vec3, part: 'torso' | 'neck' | 'head'): Vec3 => {
  if (pose.unleaned) {
    return playerLeanPoint(pose, playerPosePoint(pose.unleaned, point, part));
  }
  let at = point;
  if (part === 'head') {
    at = about(at, pose.head, pose.headRotation);
    at = at.map((value, axis) => value + (pose.head[axis]! - pose.neck[axis]!) * (pose.neckScale - 1)) as Vec3;
  } else if (part === 'neck') {
    at = [at[0], pose.neck[1] + (at[1] - pose.neck[1]) * pose.neckScale, at[2]];
  }
  if (part !== 'torso') {
    at = about(at, pose.neck, pose.neckRotation);
  }
  at = about(at, pose.spine, pose.spineRotation);
  at = about(at, pose.hip, turnX(pose.hipTurn));
  return [at[0], at[1] - pose.hipDrop, at[2]];
};

export const playerLeanPoint = (pose: PlayerLookPose, point: Vec3): Vec3 => {
  const lean = pose.lateralLean;
  if (!lean) {
    return point;
  }
  return add(about(point, lean.pivot, lean.rotation), [lean.frame.offsetMetres, 0, 0]);
};

export const playerHeldSeatFrame = (pose: PlayerLookPose, pitch: number): HeldSeatFrame => {
  if (pose.unleaned) {
    return playerHeldSeatFrame(pose.unleaned, pitch);
  }
  const torso = multiplyRotation(turnX(-pitch), multiplyRotation(turnX(pose.hipTurn), pose.spineRotation));
  const restEye = add(pose.head, pose.eyeFromHead);
  return {
    origin: rotate(sub(playerPosePoint(pose, restEye, 'torso'), pose.eye), -pitch),
    right: rotateVector(torso, [1, 0, 0]),
    up: rotateVector(torso, [0, 1, 0]),
    back: rotateVector(torso, [0, 0, 1]),
  };
};

const boundedJointRotation = (rotation: Quaternion, limits: readonly [number, number]): Quaternion => {
  const q: Quaternion = rotation[3] < 0 ? [-rotation[0], -rotation[1], -rotation[2], -rotation[3]] : rotation;
  const angle = 2 * Math.atan2(Math.hypot(q[0], q[1], q[2]), q[3]);
  const limit = limits[q[0] < 0 ? 0 : 1] * RADIANS;
  return angle <= limit ? q : axisRotation([q[0], q[1], q[2]], limit);
};

const adsSign = (ads: PlayerAdsPose): number => (ads.side === 'right' ? 1 : -1);
const adsHeadRoll = (figure: FigureDef, ads: PlayerAdsPose | undefined): Quaternion =>
  turnZ(ads ? -adsRollDegrees(figure, ads.model).head * RADIANS * adsSign(ads) : 0);

const adsLookPose = (pose: PlayerLookPose, ads: PlayerAdsPose, figure: FigureDef, pitch: number): PlayerLookPose => {
  const gun = heldFirearmTransform({
    holds: figure.holds,
    model: ads.model,
    side: ads.side,
    leadingSide: ads.side,
    twoHanded: true,
    progress: 1,
    aimingDownSights: true,
    aimFrame: ads.aimFrame ?? NEUTRAL_AIM,
    lookPitchRadians: pitch,
    loweredPitchRadians: 0,
    stockSeat: pose.stockSeats[ads.side],
    adsEyes: pose.eyes,
  });
  const sightEye = nearestSightEyeOffset(gun);
  if (!sightEye) {
    return pose;
  }
  // The head carries its aiming eye, not the midpoint between its eyes, to the sight.
  const delta = rotate(sub(sightEye, heldAdsEye(ads.model, ads.side, pose.eyes)), pitch);
  const targetEye = add(pose.eye, delta);
  const headWorld = multiplyRotation(turnX(pitch), adsHeadRoll(figure, ads));
  const headEye = rotateVector(headWorld, pose.eyeFromHead);
  const neckWorld = playerPosePoint(pose, pose.neck, 'torso');
  const torso = multiplyRotation(turnX(pose.hipTurn), pose.spineRotation);
  const neckToHead = rotateVector(inverseRotation(torso), sub(sub(targetEye, headEye), neckWorld));
  const rest = sub(pose.head, pose.neck);
  const tolerance = figure.aimPose.ads.neckLengthToleranceFraction;
  const neckScale = Math.max(1 - tolerance, Math.min(1 + tolerance, Math.hypot(...neckToHead) / Math.hypot(...rest)));
  const neckRotation = boundedJointRotation(rotationBetween(rest, neckToHead), figure.aimPose.neckLimitDegrees);
  const headRotation = boundedJointRotation(
    multiplyRotation(inverseRotation(multiplyRotation(torso, neckRotation)), headWorld),
    figure.aimPose.headLimitDegrees,
  );
  return { ...pose, neckScale, neckRotation, headRotation };
};

const lerpScalar = (from: number, to: number, aim: number): number => from + (to - from) * aim;
const lerpVec3 = (from: Vec3, to: Vec3, aim: number): Vec3 =>
  from.map((value, axis) => value + (to[axis]! - value) * aim) as Vec3;
const lerpRotation = (from: Quaternion, to: Quaternion, aim: number): Quaternion => {
  const sign = to[3] < 0 ? -1 : 1;
  const lerped = [
    from[0] + (to[0]! * sign - from[0]) * aim,
    from[1] + (to[1]! * sign - from[1]) * aim,
    from[2] + (to[2]! * sign - from[2]) * aim,
    from[3] + (to[3]! * sign - from[3]) * aim,
  ];
  const length = Math.hypot(...lerped);
  return length > 0
    ? ([lerped[0]! / length, lerped[1]! / length, lerped[2]! / length, lerped[3]! / length] as Quaternion)
    : from;
};

/** Between hip and sighted: the aim's share of every seated point and joint turn of the two poses. */
export const blendLookPoses = (hip: PlayerLookPose, sighted: PlayerLookPose, aim: number): PlayerLookPose => {
  if (!(Number.isFinite(aim) && aim >= 0 && aim <= 1)) {
    throw new Error('Invalid aim-down-sights pose blend');
  }
  if (aim <= 0) {
    return hip;
  }
  if (aim >= 1) {
    return sighted;
  }
  const lean =
    hip.lateralLean && sighted.lateralLean
      ? {
          frame: {
            offsetMetres: lerpScalar(hip.lateralLean.frame.offsetMetres, sighted.lateralLean.frame.offsetMetres, aim),
            rollRadians: lerpScalar(hip.lateralLean.frame.rollRadians, sighted.lateralLean.frame.rollRadians, aim),
          },
          rotation: lerpRotation(hip.lateralLean.rotation, sighted.lateralLean.rotation, aim),
          pivot: lerpVec3(hip.lateralLean.pivot, sighted.lateralLean.pivot, aim),
        }
      : (sighted.lateralLean ?? hip.lateralLean);
  return {
    ...(hip.unleaned && sighted.unleaned ? { unleaned: blendLookPoses(hip.unleaned, sighted.unleaned, aim) } : {}),
    ...(lean ? { lateralLean: lean } : {}),
    hip: lerpVec3(hip.hip, sighted.hip, aim),
    spine: lerpVec3(hip.spine, sighted.spine, aim),
    neck: lerpVec3(hip.neck, sighted.neck, aim),
    head: lerpVec3(hip.head, sighted.head, aim),
    hipTurn: lerpScalar(hip.hipTurn, sighted.hipTurn, aim),
    spineTurn: lerpScalar(hip.spineTurn, sighted.spineTurn, aim),
    neckTurn: lerpScalar(hip.neckTurn, sighted.neckTurn, aim),
    headTurn: lerpScalar(hip.headTurn, sighted.headTurn, aim),
    hipDrop: lerpScalar(hip.hipDrop, sighted.hipDrop, aim),
    spineRotation: lerpRotation(hip.spineRotation, sighted.spineRotation, aim),
    neckRotation: lerpRotation(hip.neckRotation, sighted.neckRotation, aim),
    headRotation: lerpRotation(hip.headRotation, sighted.headRotation, aim),
    neckScale: lerpScalar(hip.neckScale, sighted.neckScale, aim),
    eyeFromHead: lerpVec3(hip.eyeFromHead, sighted.eyeFromHead, aim),
    eye: lerpVec3(hip.eye, sighted.eye, aim),
    eyes: {
      left: lerpVec3(hip.eyes.left, sighted.eyes.left, aim),
      right: lerpVec3(hip.eyes.right, sighted.eyes.right, aim),
    },
    shoulders: {
      left: lerpVec3(hip.shoulders.left, sighted.shoulders.left, aim),
      right: lerpVec3(hip.shoulders.right, sighted.shoulders.right, aim),
    },
    stockSeats: {
      left: lerpVec3(hip.stockSeats.left, sighted.stockSeats.left, aim),
      right: lerpVec3(hip.stockSeats.right, sighted.stockSeats.right, aim),
    },
    proneAds: hip.proneAds || sighted.proneAds,
  };
};

/** The aim's share of the hip pose and the sighted one; each endpoint is the pose that gate alone gives. */
const partSightedLookPose = ({
  figure,
  models,
  pitch,
  stance,
  lean,
  stancePose,
  ads,
}: {
  figure: FigureDef;
  models: Models;
  pitch: number;
  stance: PlayerStance;
  lean?: LeanFrame | undefined;
  stancePose?: FigureStancePose;
  ads: PlayerAdsPose;
}): PlayerLookPose => {
  const aim = ads.aim ?? 1;
  const shared = { figure, models, pitch, stance, lean };
  const hip = playerLookPose({
    ...shared,
    stancePose: stancePose ?? figureStancePose(figure, stance, false),
    ads: undefined,
  });
  const sighted = playerLookPose({
    ...shared,
    stancePose: stancePose ?? figureStancePose(figure, stance, true),
    ads: { ...ads, aim: 1 },
  });
  return blendLookPoses(hip, sighted, aim);
};

export const playerLookPose = ({
  figure,
  models,
  pitch,
  stance,
  ads,
  lean,
  stancePose,
}: {
  figure: FigureDef;
  models: Models;
  pitch: number;
  stance: PlayerStance;
  stancePose?: FigureStancePose;
  lean?: LeanFrame | undefined;
  ads?: PlayerAdsPose | undefined;
}): PlayerLookPose => {
  if (ads && ads.aim !== undefined && !(Number.isFinite(ads.aim) && ads.aim >= 0 && ads.aim <= 1)) {
    throw new Error('Invalid aim-down-sights pose aim');
  }
  if (ads && (ads.aim ?? 1) < 1) {
    return partSightedLookPose({ figure, models, pitch, stance, lean, ...(stancePose ? { stancePose } : {}), ads });
  }
  const settledStancePose = stancePose ?? figureStancePose(figure, stance, ads !== undefined);
  const anchors = models.get(figure.body.model)?.anchors;
  const anchor = (name: string): Vec3 => {
    const at = anchors?.[name];
    if (!at) {
      throw new Error(`Figure ${figure.id} needs body anchor ${name}`);
    }
    return at;
  };
  const leftHip = anchor(figure.body.joints.leftHip);
  const rightHip = anchor(figure.body.joints.rightHip);
  const origin: Vec3 = [
    (leftHip[0] + rightHip[0]) / 2,
    figure.hipHeightMetres - (leftHip[1] + rightHip[1]) / 2,
    (leftHip[2] + rightHip[2]) / 2,
  ];
  const point = (name: string): Vec3 => {
    const at = anchor(name);
    return [origin[0] - at[0], origin[1] + at[1], origin[2] - at[2]];
  };
  const hipAimTurn = -playerLookLean(figure, pitch, stance, ads !== undefined);
  const hipTurn = -settledStancePose.torsoForwardDegrees * RADIANS + hipAimTurn;
  const { torsoShare, neckShare, torsoLimitDegrees, neckLimitDegrees, headLimitDegrees, stockShoulderOffset } =
    figure.aimPose;
  const limit = (angle: number, bounds: readonly [number, number]): number =>
    Math.max(-bounds[0] * RADIANS, Math.min(bounds[1] * RADIANS, angle));
  const needed = pitch - hipTurn;
  // The torso share is the total aim bend, not a second fold added to the hip lean.
  const spineTurn = limit(pitch * (pitch < 0 ? torsoShare.down : torsoShare.up) - hipAimTurn, torsoLimitDegrees);
  const neckTurn = limit((needed - spineTurn) * neckShare, neckLimitDegrees);
  const headTurn = limit(needed - spineTurn - neckTurn, headLimitDegrees);
  const eyes = figure.body.eyes.map(point);
  const eyeAnchor = eyes[0]!.map((value, axis) => (value + eyes[1]![axis]!) / 2) as Vec3;
  const [leftEye, rightEye] = eyes[0]![0] < eyes[1]![0] ? eyes : [eyes[1]!, eyes[0]!];
  const headRoll = adsHeadRoll(figure, ads);
  const eyeOffsets: Record<HandSide, Vec3> = {
    left: rotateVector(headRoll, sub(leftEye!, eyeAnchor)),
    right: rotateVector(headRoll, sub(rightEye!, eyeAnchor)),
  };
  let pose: PlayerLookPose = {
    hip: [0, figure.hipHeightMetres, 0],
    spine: point(figure.body.spine.pivot),
    neck: point(figure.body.neck.pivot),
    head: point(figure.body.head.pivot),
    hipTurn,
    spineTurn,
    neckTurn,
    headTurn,
    hipDrop: settledStancePose.hipDropMetres,
    spineRotation: multiplyRotation(
      turnX(spineTurn),
      turnZ(ads ? adsRollDegrees(figure, ads.model, stance).torso * RADIANS * adsSign(ads) : 0),
    ),
    neckRotation: turnX(neckTurn),
    headRotation: turnX(headTurn),
    neckScale: 1,
    eyeFromHead: eyeAnchor.map((value, axis) => value - point(figure.body.head.pivot)[axis]!) as Vec3,
    eye: [0, 0, 0],
    eyes: eyeOffsets,
    shoulders: { right: [0, 0, 0], left: [0, 0, 0] },
    stockSeats: { right: [0, 0, 0], left: [0, 0, 0] },
    proneAds: stance === 'prone' && ads !== undefined,
  };
  const eye = playerPosePoint(pose, eyeAnchor, 'head');
  const shoulders = Object.fromEntries(
    (['right', 'left'] as const).map((side) => [
      side,
      playerPosePoint(pose, point(figure.body.joints[side === 'right' ? 'rightShoulder' : 'leftShoulder']), 'torso'),
    ]),
  ) as Record<HandSide, Vec3>;
  const stockSeats = (atEye: Vec3) =>
    Object.fromEntries(
      (['right', 'left'] as const).map((side) => {
        const down = Math.max(0, -Math.sin(pitch));
        const seat = ads
          ? figure.aimPose.ads.stockShoulderOffset
          : (stockShoulderOffset.up.map(
              (value, axis) => value + (stockShoulderOffset.down[axis]! - value) * down,
            ) as Vec3);
        const offset: Vec3 = [seat[0] * (side === 'right' ? 1 : -1), seat[1], seat[2]];
        const turned = rotateVector(multiplyRotation(turnX(hipTurn), pose.spineRotation), offset);
        return [side, rotate(shoulders[side].map((v, i) => v + turned[i]! - atEye[i]!) as Vec3, -pitch)];
      }),
    ) as Record<HandSide, Vec3>;
  pose = { ...pose, eye, shoulders, stockSeats: stockSeats(eye) };
  if (ads) {
    pose = adsLookPose(pose, ads, figure, pitch);
  }
  const posedEye = playerPosePoint(pose, eyeAnchor, 'head');
  const solved = { ...pose, eye: posedEye, stockSeats: stockSeats(posedEye) };
  if (!lean || stance === 'prone' || (lean.rollRadians === 0 && lean.offsetMetres === 0)) {
    return solved;
  }
  const leaned: PlayerLookPose = {
    ...solved,
    unleaned: solved,
    lateralLean: {
      frame: lean,
      rotation: multiplyRotation(turnX(pitch), multiplyRotation(turnZ(lean.rollRadians), turnX(-pitch))),
      pivot: [pose.hip[0], pose.hip[1] - pose.hipDrop, pose.hip[2]],
    },
  };
  return {
    ...leaned,
    eye: playerLeanPoint(leaned, solved.eye),
    shoulders: {
      left: playerLeanPoint(leaned, solved.shoulders.left),
      right: playerLeanPoint(leaned, solved.shoulders.right),
    },
  };
};

export const playerEyePosition = ({
  feet,
  blockSize,
  yaw,
  pitch,
  stance,
  figure,
  models,
  ads,
  lean,
}: {
  feet: Readonly<Vec3>;
  blockSize: number;
  yaw: number;
  pitch: number;
  stance: PlayerStance;
  figure: FigureDef;
  models: Models;
  ads?: PlayerAdsPose | undefined;
  lean?: LeanFrame | undefined;
}): Vec3 => {
  const { eye } = playerLookPose({ figure, models, pitch, stance, ads, lean });
  return [
    feet[0] + (eye[0] * Math.cos(yaw) + eye[2] * Math.sin(yaw)) / blockSize,
    feet[1] + eye[1] / blockSize,
    feet[2] + (-eye[0] * Math.sin(yaw) + eye[2] * Math.cos(yaw)) / blockSize,
  ];
};
