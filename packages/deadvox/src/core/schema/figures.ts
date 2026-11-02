import {
  array,
  check,
  type InferOutput,
  maxValue,
  minValue,
  number,
  omit,
  optional,
  picklist,
  pipe,
  record,
  strictObject,
  tuple,
  boolean as vBoolean,
} from 'valibot';
import { Degrees } from './layouts.ts';
import { Point, UnitVector } from './models.ts';
import { Color, Fraction, Id, NonNegative, Positive, PositiveRealSeconds } from './primitives.ts';

/** A lowered stance's drawn pose, pivoting about the hip; `DESIGN.md`, "Crouching and lying prone". */
const StancePoseSchema = strictObject({
  hipDropMetres: NonNegative,
  /** Torso, head and arms pitch forward about the hip. */
  torsoForwardDegrees: Degrees,
  /** Legs and feet swing forward about the hip; negative swings them back. */
  legsForwardDegrees: Degrees,
  /** Each shin and foot swing back about the knee. */
  kneeBendDegrees: Degrees,
  /** Each foot turns toe up about the ankle. */
  ankleDegrees: Degrees,
  /** Each arm swings forward about its shoulder, from hanging along the torso. */
  armsForwardDegrees: Degrees,
  /** Each forearm and hand swing forward and up about the elbow, from hanging along the upper arm. */
  elbowBendDegrees: Degrees,
  /** The head tips back about the neck, from standing on the torso. */
  headUpDegrees: Degrees,
});

/** The limbs a figure hangs from its body, each at the body joint of the same name in `FIGURE_LIMB_JOINTS`. */
export const FIGURE_LIMBS = ['leftArm', 'rightArm', 'leftLeg', 'rightLeg'] as const;

export type FigureLimb = (typeof FIGURE_LIMBS)[number];

/** The pivots the limbs hang from and are posed about. */
const FIGURE_JOINTS = ['leftHip', 'rightHip', 'leftShoulder', 'rightShoulder'] as const;

export type FigureJoint = (typeof FIGURE_JOINTS)[number];

export const FIGURE_LIMB_JOINTS: Readonly<Record<FigureLimb, FigureJoint>> = {
  leftArm: 'leftShoulder',
  rightArm: 'rightShoulder',
  leftLeg: 'leftHip',
  rightLeg: 'rightHip',
};

/** An authored limb: its model and the model anchor that sits at, and turns about, its body joint. */
const FigureLimbSchema = strictObject({ model: Id, joint: Id });

/** The arm model's segments, each a part the first-person view turns about its own joint; `DESIGN.md`, "Models". */
export const ARM_SEGMENTS = ['upper', 'fore', 'hand', 'fingers', 'thumb'] as const;

export type ArmSegment = (typeof ARM_SEGMENTS)[number];

/** One segment: the limb model's part, and the model anchor it turns about. */
const ArmSegmentSchema = strictObject({ part: Id, pivot: Id });

/** How a hand closes: the fingers curl at the knuckles; the thumb folds across the palm and in toward it. */
const HandPoseSchema = strictObject({ fingersDegrees: Degrees, thumbAcrossDegrees: Degrees, thumbInDegrees: Degrees });

/** The first-person view's rig over the arm model (src/render/armRig.ts). */
const ArmRigSchema = strictObject({
  upper: ArmSegmentSchema,
  fore: ArmSegmentSchema,
  hand: ArmSegmentSchema,
  fingers: ArmSegmentSchema,
  thumb: ArmSegmentSchema,
  /** The anchor on the palm's midline a held item's grip sits against, moved out to the palm's face. */
  grip: Id,
  /** A body-relative pole keeps the elbow bend independent of where the eye looks. */
  elbowPole: strictObject({ up: UnitVector, down: UnitVector }),
  /** The same pole while prone and aiming down sights: elbows point at the ground and carry the raised chest. */
  proneAdsElbowPole: strictObject({ up: UnitVector, down: UnitVector }),
  minimumBendDegrees: strictObject({
    up: pipe(number(), minValue(0), maxValue(90)),
    down: pipe(number(), minValue(0), maxValue(90)),
  }),
  /** One closing per `HAND_POSES` name; a held model's hold names the one its hand takes. */
  handPoses: strictObject({
    fist: HandPoseSchema,
    holding: HandPoseSchema,
    open: HandPoseSchema,
    pistolGrip: HandPoseSchema,
    pistolWrap: HandPoseSchema,
    pistolCup: HandPoseSchema,
    stockWrist: HandPoseSchema,
    forend: HandPoseSchema,
  }),
  /**
   * Where the view hangs the right arm, in the eye's frame (x right, y up, z back); the left mirrors x. Presentation,
   * not the body's own shoulder: wider and lower, so the arms show in view. Validation wants it right of and below
   * the eye.
   */
  shoulderFromEye: Point,
});

export type ArmRigDef = InferOutput<typeof ArmRigSchema>;

/** The leg model's segments below the thigh, each turned about its own joint as a stance bends the leg. */
export const LEG_SEGMENTS = ['shin', 'foot'] as const;

export type LegSegment = (typeof LEG_SEGMENTS)[number];

/** Both leg models' rig, from the hip down; the thigh is the rest of the model. */
const LegRigSchema = strictObject({ shin: ArmSegmentSchema, foot: ArmSegmentSchema });

export type HandPoseDef = InferOutput<typeof HandPoseSchema>;

const ReadyHandSchema = strictObject({ offset: Point, rotation: Point });

const HeldPosesSchema = strictObject({
  reachLeadMetres: NonNegative,
  oneHand: Point,
  twoHand: Point,
  display: Point,
  supportUpright: Point,
  supportForward: Point,
  /** Firearm-ready hand transforms; guard transforms stay separate so they cannot move a weapon bore. */
  readyPrimary: ReadyHandSchema,
  readySupport: ReadyHandSchema,
  guardPrimary: ReadyHandSchema,
  guardSupport: ReadyHandSchema,
  /** Raised free-hand transform while an active off-hand item accompanies an aimed firearm. */
  aimActiveOffHand: ReadyHandSchema,
});

export type HeldPosesDef = InferOutput<typeof HeldPosesSchema>;

/** Actor models and poses are content so appearance doesn't live in renderer code; `DESIGN.md`, "Models". */
/** How the view animates between hip and sights across an aim's acquisition and release. */
const AdsViewBlendSchema = strictObject({
  easing: picklist(['linear', 'smoothstep']),
  /** How long the view takes to settle back to the hip pose after the aim is released. */
  blendBackRealSeconds: PositiveRealSeconds,
});

import { capabilityField } from './capability.ts';

export const FigureSchema = strictObject({
  id: Id,
  capability: capabilityField('figures'),
  /** Where the hips stand above the ground; stances pivot about them. */
  hipHeightMetres: Positive,
  /**
   * The head and torso model; each joint names its anchor. It stands with its hips at the hip height. A stance turns
   * the head part about its pivot.
   */
  body: strictObject({
    model: Id,
    joints: strictObject({ leftHip: Id, rightHip: Id, leftShoulder: Id, rightShoulder: Id }),
    spine: ArmSegmentSchema,
    neck: ArmSegmentSchema,
    head: ArmSegmentSchema,
    eyes: tuple([Id, Id]),
  }),
  limbs: strictObject({
    leftArm: FigureLimbSchema,
    rightArm: FigureLimbSchema,
    leftLeg: FigureLimbSchema,
    rightLeg: FigureLimbSchema,
  }),
  /** Both arm models' rig; the two arms share it because each is the mirror of the other. */
  armRig: ArmRigSchema,
  holds: HeldPosesSchema,
  attachmentFrames: record(
    Id,
    strictObject({
      part: picklist(['body', ...FIGURE_LIMBS]),
      pivot: optional(Id),
      at: tuple([number(), number(), number()]),
      turn: tuple([number(), number(), number()]),
      insideView: vBoolean(),
    }),
  ),
  /** Both leg models' rig; the two legs share it because each is the mirror of the other. */
  legRig: LegRigSchema,
  /** Walking swings each leg about its hip and each arm, against its leg, about its shoulder; peak angles. */
  gait: strictObject({ legSwingDegrees: Degrees, armSwingDegrees: Degrees }),
  aimPose: strictObject({
    torsoShare: strictObject({ down: Fraction, up: Fraction }),
    neckShare: Fraction,
    torsoLimitDegrees: tuple([Positive, Positive]),
    neckLimitDegrees: tuple([Positive, Positive]),
    headLimitDegrees: tuple([Positive, Positive]),
    stockShoulderOffset: strictObject({ up: Point, down: Point }),
    ads: strictObject({
      cameraOffsetLimitMetres: NonNegative,
      cameraWallMarginMetres: NonNegative,
      ownBodyClipMetres: NonNegative,
      ownBodyHide: array(picklist(['spine', 'neck', 'head'])),
      stockShoulderLimitMetres: NonNegative,
      torsoRollDegrees: pipe(number(), minValue(0), maxValue(90)),
      /** The same roll lying prone, where it swings the shoulders along the ground; negative turns the other way. */
      proneTorsoRollDegrees: pipe(number(), minValue(-90), maxValue(90)),
      headRollDegrees: pipe(number(), minValue(0), maxValue(90)),
      neckLengthToleranceFraction: pipe(
        Fraction,
        check((value) => value < 1, 'neck length must remain positive'),
      ),
      stockShoulderOffset: Point,
      viewBlend: AdsViewBlendSchema,
    }),
  }),
  lookDownLean: strictObject({
    startPitchDegrees: pipe(
      NonNegative,
      check((value) => value < 90, 'look-down lean must start before straight down'),
    ),
    torsoForwardDegrees: pipe(NonNegative, maxValue(90)),
  }),
  /** Where the debug mannequin stands from the player, along and across the player's facing. */
  mannequinPlacement: strictObject({ aheadMetres: Positive, asideMetres: Positive }),
  stancePoses: strictObject({
    crouching: StancePoseSchema,
    prone: StancePoseSchema,
    /** How long the drawn body takes to settle into a new stance. */
    blendRealSeconds: PositiveRealSeconds,
  }),
  /** The prone body while aiming down sights: chest raised and propped on the elbows (`DESIGN.md`, "Character"). */
  proneAdsPose: StancePoseSchema,
  /**
   * Temporary corpse role tint by outfit id, with a colour per model part's material slot. Omitted slots keep the
   * model colour. This is not clothing; delete with #1366 (`DESIGN.md`, "Dead humans").
   */
  outfits: record(Id, record(Id, record(Id, Color))),
  /** How a dead body lies. It rests on its lowest point, so it has no hip drop. */
  corpsePose: omit(StancePoseSchema, ['hipDropMetres']),
});
