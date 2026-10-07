// The humanoid body plan: 18 bones (PROJECT.md), built deterministically from
// a genome's sampled params. Joint proportions come from mobgen/reference/
// README.md's fgc_skeleton table (converted: Blender Z-up/-Y-forward ->
// ours, Y-up/-Z-forward, i.e. (x, y, z)_blender -> (x, z, y)_ours), as
// fractions of the `height` param.
//
// Hunch and kneeBend are baked into the rest pose (this file); the walk
// itself is gait.ts.

import type { Body, Bone, Feature, Material } from '../core/body.ts';
import { RIGHT, UP } from '../core/conventions.ts';
import { type BodyPlanDef, registerBodyPlan, sampleParams } from '../core/generate.ts';
import {
  add,
  applyDir,
  cross,
  dot,
  length,
  lerp3,
  normalize,
  rotation,
  rotX,
  scale,
  sub,
  type Vec3,
} from '../core/math.ts';
import { pick, type Rng, range } from '../core/random.ts';
import type { Genome, Template, Wound } from '../core/template.ts';

const SIDES = ['L', 'R'] as const;
type Side = (typeof SIDES)[number];
const sideSign = (s: Side): number => (s === 'L' ? -1 : 1);

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Params sampled in this fixed order (see core/generate.ts's sampleParams). */
export const HUMANOID_PARAM_ORDER = [
  'height',
  'girth',
  'shoulderWidth',
  'hipWidth',
  'headScale',
  'armLength',
  'legLength',
  'hunch',
  'kneeBend',
  'headTilt',
  'jawOpen',
  'noseLength',
  'earSize',
  'skinHue',
  'skinSat',
  'skinLight',
  'shirtHue',
  'shirtLight',
  'pantsHue',
  'pantsLight',
  'sleeveLength',
  'pantsLength',
  'shirtTear',
  'pantsTear',
  'hairCover',
  'woundCount',
  'armSwing',
  'armRaise',
  'limp',
  'strideFactor',
  'pelvisSway',
  'spineTwist',
  'headLoll',
  'jawChatter',
  'footLift',
] as const;

export type HumanoidParams = Readonly<Record<(typeof HUMANOID_PARAM_ORDER)[number], number>>;

export const WOUNDABLE_BONES = [
  'spine',
  'chest',
  'upperArm.L',
  'upperArm.R',
  'forearm.L',
  'forearm.R',
  'thigh.L',
  'thigh.R',
  'shin.L',
  'shin.R',
  'neck',
] as const;

// ---- Reference proportions (fractions of `height`) ----
// mobgen/reference/README.md, fgc_skeleton joint heights, converted to our axes.
const REF = {
  topOfHead: 1.0,
  baseOfSkull: 0.897,
  jawHinge: 0.909,
  chin: 0.874,
  shoulderY: 0.806,
  shoulderLat: 0.097,
  elbowY: 0.651,
  elbowLat: 0.114,
  wristY: 0.514,
  wristLat: 0.171,
  hipY: 0.509,
  hipLat: 0.083,
  kneeY: 0.297,
  ankleY: 0.08,
} as const;
const THIGH_FRAC = REF.hipY - REF.kneeY; // 0.212
const SHIN_FRAC = REF.kneeY - REF.ankleY; // 0.217

/** A vector of length `len`, pointing up but tilted forward by `tiltDeg` (positive = toward -Z). */
const leanUp = (len: number, tiltDeg: number): Vec3 => scale(applyDir(rotation(rotX(-tiltDeg)), UP), len);

interface JointLayout {
  readonly height: number;
  readonly pelvis: { readonly bottom: Vec3; readonly top: Vec3 };
  readonly spine: { readonly head: Vec3; readonly tail: Vec3 };
  readonly chest: { readonly head: Vec3; readonly tail: Vec3 };
  readonly neck: { readonly head: Vec3; readonly tail: Vec3 };
  readonly head: { readonly head: Vec3; readonly tail: Vec3 };
  readonly jaw: { readonly head: Vec3; readonly tail: Vec3 };
  readonly arm: Readonly<
    Record<Side, { readonly shoulder: Vec3; readonly elbow: Vec3; readonly wrist: Vec3; readonly handTip: Vec3 }>
  >;
  readonly leg: Readonly<
    Record<Side, { readonly hip: Vec3; readonly knee: Vec3; readonly ankle: Vec3; readonly toe: Vec3 }>
  >;
  /** Lengths used by both the builder and the gait's leg IK. */
  readonly thighLen: number;
  readonly shinLen: number;
  readonly footLen: number;
}

/** Pure geometry: every joint position in the rest pose, from height and proportion params.
 * Shared by the builder (flesh placement) and the gait (leg IK targets, bone lengths). */
const jointLayout = (p: HumanoidParams): JointLayout => {
  const h = p.height;
  const hunchSpine = p.hunch * 0.3;
  const hunchChest = p.hunch * 0.65;
  const hunchNeck = p.hunch * 1.0;
  const hunchHead = hunchNeck + p.headTilt;

  const pelvisBottom: Vec3 = [0, REF.hipY * h - 0.05 * h, 0];
  const pelvisTop: Vec3 = [0, REF.hipY * h + 0.08 * h, 0];
  const spineHead = pelvisTop;
  const spineTail = add(spineHead, leanUp(0.16 * h, hunchSpine));
  const chestHead = spineTail;
  const chestTail = add(chestHead, leanUp(REF.shoulderY * h - spineTail[1], hunchChest));
  const neckHead = chestTail;
  const neckTail = add(neckHead, leanUp((REF.baseOfSkull - REF.shoulderY) * h, hunchNeck));
  const headHead = neckTail;
  const headTail = add(headHead, leanUp((REF.topOfHead - REF.baseOfSkull) * h, hunchHead));

  // The jaw hinge sits inside the head bone's span (0.909H vs 0.897-1.0H), offset forward for the face.
  const faceZ = -0.06 * h;
  const jawHead: Vec3 = [0, REF.jawHinge * h, faceZ + hunchOffsetZ(headHead, headTail, REF.jawHinge * h)];
  const jawTail: Vec3 = [0, REF.chin * h, faceZ * 1.4 + hunchOffsetZ(headHead, headTail, REF.chin * h)];

  const totalLegLen = (REF.hipY - REF.ankleY) * h * p.legLength;
  const thighLen = totalLegLen * (THIGH_FRAC / (THIGH_FRAC + SHIN_FRAC));
  const shinLen = totalLegLen * (SHIN_FRAC / (THIGH_FRAC + SHIN_FRAC));
  const ankleY = REF.ankleY * h;
  const bendHalf = toRad(p.kneeBend / 2);
  const hipY = ankleY + (thighLen + shinLen) * Math.cos(bendHalf);
  const kneeY = ankleY + shinLen * Math.cos(bendHalf);
  const kneeForward = -thighLen * Math.sin(bendHalf);
  const footLen = 0.15 * h;

  const arm: Record<Side, JointLayout['arm'][Side]> = { L: makeArm(h, p, 'L'), R: makeArm(h, p, 'R') };
  const leg: Record<Side, JointLayout['leg'][Side]> = {
    L: makeLeg(h, p, 'L', { hipY, kneeY, kneeForward, ankleY, footLen }),
    R: makeLeg(h, p, 'R', { hipY, kneeY, kneeForward, ankleY, footLen }),
  };

  return {
    height: h,
    pelvis: { bottom: pelvisBottom, top: pelvisTop },
    spine: { head: spineHead, tail: spineTail },
    chest: { head: chestHead, tail: chestTail },
    neck: { head: neckHead, tail: neckTail },
    head: { head: headHead, tail: headTail },
    jaw: { head: jawHead, tail: jawTail },
    arm,
    leg,
    thighLen,
    shinLen,
    footLen,
  };
};

/** Interpolates the hunch-tilted spine chain's z at a given absolute height, for the jaw's attachment. */
const hunchOffsetZ = (from: Vec3, to: Vec3, atY: number): number => {
  const span = to[1] - from[1];
  if (Math.abs(span) < 1e-9) {
    return from[2];
  }
  const t = (atY - from[1]) / span;
  return from[2] + (to[2] - from[2]) * t;
};

const makeArm = (h: number, p: HumanoidParams, side: Side): JointLayout['arm'][Side] => {
  const sign = sideSign(side);
  const shoulder: Vec3 = [sign * REF.shoulderLat * h * p.shoulderWidth, REF.shoulderY * h, 0];
  const toElbow = scale(
    [(REF.elbowLat - REF.shoulderLat) * h * sign, (REF.elbowY - REF.shoulderY) * h, 0],
    p.armLength,
  );
  const elbow = add(shoulder, toElbow);
  const toWrist = scale([(REF.wristLat - REF.elbowLat) * h * sign, (REF.wristY - REF.elbowY) * h, 0], p.armLength);
  const wrist = add(elbow, toWrist);
  const handDir = length(toWrist) > 1e-9 ? normalize(toWrist) : [0, -1, 0];
  const handTip = add(wrist, scale(handDir as Vec3, 0.09 * h));
  return { shoulder, elbow, wrist, handTip };
};

interface LegGeometry {
  readonly hipY: number;
  readonly kneeY: number;
  readonly kneeForward: number;
  readonly ankleY: number;
  readonly footLen: number;
}

const makeLeg = (h: number, p: HumanoidParams, side: Side, geo: LegGeometry): JointLayout['leg'][Side] => {
  const sign = sideSign(side);
  const hip: Vec3 = [sign * REF.hipLat * h * p.hipWidth, geo.hipY, 0];
  const knee: Vec3 = [sign * 0.04 * h, geo.kneeY, geo.kneeForward];
  const ankle: Vec3 = [sign * 0.02 * h, geo.ankleY, 0];
  const toe: Vec3 = [sign * 0.02 * h, 0, -geo.footLen];
  return { hip, knee, ankle, toe };
};

// ---- Bones ----

const buildBones = (layout: JointLayout): Body['bones'] => {
  const bones: Body['bones'][number][] = [
    { id: 'pelvis', parent: null, head: layout.pelvis.bottom, tail: layout.pelvis.top },
    { id: 'spine', parent: 'pelvis', head: layout.spine.head, tail: layout.spine.tail },
    { id: 'chest', parent: 'spine', head: layout.chest.head, tail: layout.chest.tail },
    { id: 'neck', parent: 'chest', head: layout.neck.head, tail: layout.neck.tail },
    { id: 'head', parent: 'neck', head: layout.head.head, tail: layout.head.tail },
    { id: 'jaw', parent: 'head', head: layout.jaw.head, tail: layout.jaw.tail },
  ];
  for (const side of SIDES) {
    const arm = layout.arm[side];
    const leg = layout.leg[side];
    bones.push(
      { id: `upperArm.${side}`, parent: 'chest', head: arm.shoulder, tail: arm.elbow },
      { id: `forearm.${side}`, parent: `upperArm.${side}`, head: arm.elbow, tail: arm.wrist },
      { id: `hand.${side}`, parent: `forearm.${side}`, head: arm.wrist, tail: arm.handTip },
      { id: `thigh.${side}`, parent: 'pelvis', head: leg.hip, tail: leg.knee },
      { id: `shin.${side}`, parent: `thigh.${side}`, head: leg.knee, tail: leg.ankle },
      { id: `foot.${side}`, parent: `shin.${side}`, head: leg.ankle, tail: leg.toe },
    );
  }
  return bones;
};

export const FEET_BONES = SIDES.map((s) => `foot.${s}`);

// ---- Flesh, clothes, face, wounds ----

const mid = (a: Vec3, b: Vec3): Vec3 => scale(add(a, b), 0.5);

/** Linear radii below were authored generously; this scales total flesh volume down to match
 * mobgen/reference/README.md's voxel counts (volume, and so voxel count, scales roughly as the square
 * of a limb radius since bone lengths don't change). */
const FLESH_SCALE = 0.65;

const roundJoint = (childBone: string, center: Vec3, radius: number): Feature => ({
  bone: childBone,
  op: 'add',
  shape: { kind: 'ellipsoid', center, radii: [radius, radius, radius] },
  material: 'skin',
  blend: 0.035,
});

const capsuleFeature = (bone: string, a: Vec3, b: Vec3, radii: readonly [number, number]): Feature => ({
  bone,
  op: 'add',
  shape: { kind: 'capsule', a, b, ra: radii[0], rb: radii[1] },
  material: 'skin',
});

const ellipsoidFeature = (bone: string, center: Vec3, radii: Vec3, material: Material = 'skin'): Feature => ({
  bone,
  op: 'add',
  shape: { kind: 'ellipsoid', center, radii },
  material,
});

const boxFeature = (bone: string, center: Vec3, half: Vec3, round: number): Feature => ({
  bone,
  op: 'add',
  shape: { kind: 'box', center, half, round },
  material: 'skin',
});

// A voxel's world Y sits at an (n + 0.5) multiple of the voxel size (see voxelize.ts's worldPosition;
// X and Z sit at plain multiples, so x = 0 and x = ±n*v need no snapping to fall exactly on a column).
// Snapping a feature's Y this way means a carve/paint reliably lands on one intended voxel row instead
// of splitting across two.
const snapRow = (y: number, voxel: number): number => (Math.round(y / voxel - 0.5) + 0.5) * voxel;
const snapCol = (x: number, voxel: number): number => Math.round(x / voxel) * voxel;

// Median default-voxel-size / median-template-height ratio: shambler 1/41.4,
// runner 1/45 and brute 1/43. This calibrates the new metric face constants to
// a typical actor's previous default-voxel head size without using LOD voxel size.
const FACE_HEIGHT_RATIO = 1 / 43;

/** Metric face dimensions with grid-snapped landmarks, shared between buildFlesh (which shapes the
 * head/jaw around them) and buildClothes (which paints/carves eyes and mouth onto them). */
interface FaceLayout {
  readonly voxel: number;
  /** Metric face scale: height × headScale × calibrated dimensionless ratio. */
  readonly scale: number;
  readonly headCenter: Vec3;
  readonly skull: Vec3;
  readonly faceCenter: Vec3;
  readonly faceHalf: Vec3;
  readonly browY: number;
  readonly browCenter: Vec3;
  readonly browHalf: Vec3;
  readonly eyeY: number;
  /** The face plate's own front surface — where sockets/nose/mouth sit or carve into. */
  readonly frontZ: number;
  readonly noseBase: Vec3;
  readonly noseTip: Vec3;
  readonly jawCenter: Vec3;
  readonly jawRadii: Vec3;
  readonly mouthY: number;
  readonly mouthZ: number;
}

const buildFaceLayout = (layout: JointLayout, p: HumanoidParams, voxelSize: number): FaceLayout => {
  const v = voxelSize;
  const faceScale = layout.height * FACE_HEIGHT_RATIO * p.headScale;
  const headCenter = mid(layout.head.head, layout.head.tail);
  const skull: Vec3 = [2.3 * faceScale, 2.5 * faceScale, 1.9 * faceScale];
  const faceHalf: Vec3 = [2.1 * faceScale, 1.6 * faceScale, 0.85 * faceScale];
  const eyeY = snapRow(layout.head.head[1] + 1.1 * faceScale, v);
  const faceCenter: Vec3 = [0, eyeY, headCenter[2] - skull[2]];
  // Snapped: this is the base Z the eye sockets carve at, and a carve that lands ~half a voxel off a
  // column can eat two voxels deep instead of one, pushing the exposed back wall past the eye paint's
  // reach (see mobgen bugfix — sockets carved fine but never got their 'eye' paint).
  const frontZ = snapCol(faceCenter[2] - faceHalf[2], v);
  const browY = snapRow(eyeY + faceScale, v);
  const browHalf: Vec3 = [1.7 * faceScale, 0.35 * faceScale, 0.55 * faceScale];
  const browCenter: Vec3 = [0, browY, frontZ - 0.5 * faceScale];
  const noseBase: Vec3 = [0, snapRow(eyeY - 1.1 * faceScale, v), frontZ];
  const noseTip: Vec3 = add(noseBase, [
    0,
    0.3 * faceScale,
    -(0.55 * faceScale + p.noseLength * layout.height * p.headScale),
  ]);
  const jawCenter = lerp3(layout.jaw.head, layout.jaw.tail, 0.65);
  const jawRadii: Vec3 = [1.7 * faceScale, 1.3 * faceScale, 1.6 * faceScale];
  const mouthY = snapRow(noseBase[1] - 1.1 * faceScale, v);
  const mouthZ = snapCol(jawCenter[2] - jawRadii[2] + 0.3 * faceScale, v);
  return {
    voxel: v,
    scale: faceScale,
    headCenter,
    skull,
    faceCenter,
    faceHalf,
    browY,
    browCenter,
    browHalf,
    eyeY,
    frontZ,
    noseBase,
    noseTip,
    jawCenter,
    jawRadii,
    mouthY,
    mouthZ,
  };
};

/** A flat-bottomed sole from heel to toe (an ellipsoid centred between ankle and toe only touches the
 * ground at a single point near the middle — real feet, and the `grounded`/`balance` rules, need a sole). */
const footFeature = (bone: string, foot: readonly [Vec3, Vec3], hg: readonly [number, number]): Feature => {
  const [ankle, toe] = foot;
  const [h, g] = hg;
  const [, , toeZ] = toe;
  const heelZ = ankle[2] + 0.045 * h;
  // The box's top must reach the ankle joint itself (with a little overlap for the round-joint
  // sphere to blend into), or the sole is left dangling below the shin with nothing bridging the gap.
  const height = ankle[1] + 0.02 * h;
  const center: Vec3 = [ankle[0], height / 2, (heelZ + toeZ) / 2];
  const half: Vec3 = [0.045 * h * g, height / 2, Math.abs(heelZ - toeZ) / 2];
  return { bone, op: 'add', shape: { kind: 'box', center, half, round: 0.014 * h * g }, material: 'skin' };
};

const buildFlesh = (layout: JointLayout, p: HumanoidParams, face: FaceLayout): Feature[] => {
  const h = layout.height;
  // Radii below were authored generously and then measured against the reference voxel counts
  // (mobgen/reference/README.md); FLESH_SCALE brings total body volume in line without re-deriving
  // every constant.
  const g = p.girth * FLESH_SCALE;
  const chestCenter = mid(layout.chest.head, layout.chest.tail);
  const features: Feature[] = [
    ellipsoidFeature('pelvis', mid(layout.pelvis.bottom, layout.pelvis.top), [
      (REF.hipLat * h * p.hipWidth + 0.05 * h) * g,
      0.11 * h * g,
      0.09 * h * g,
    ]),
    capsuleFeature('spine', layout.spine.head, layout.spine.tail, [0.065 * h * g, 0.075 * h * g]),
    ellipsoidFeature('chest', chestCenter, [
      REF.shoulderLat * h * p.shoulderWidth * 0.85 * g,
      0.15 * h * g,
      0.11 * h * g,
    ]),
    capsuleFeature('neck', layout.neck.head, layout.neck.tail, [0.045 * h * g, 0.045 * h * g]),
  ];

  // ---- Head: every feature dimension is metric (height × headScale), so re-voxelizing a genome
  // changes sampling resolution, not proportions. Eye columns remain snapped at x = ±v; fine details
  // may disappear at coarse LOD.
  features.push(ellipsoidFeature('head', face.headCenter, face.skull));
  features.push(boxFeature('head', face.faceCenter, face.faceHalf, 0.45 * face.faceHalf[2]));

  // Brow ridge: a metric half-face-scale overhang, right above the eyes.
  features.push(boxFeature('head', face.browCenter, face.browHalf, 0.15 * face.browHalf[2]));

  // Jaw/chin: weighted toward the chin (jaw.tail) rather than the hinge, so the mass — and so the
  // silhouette in a side view — reads as a chin, not a uniform hinge-to-chin sausage. Jaw and head are
  // separate bones with no cross-bone smin (voxelize.ts), so the narrower neck below always leaves a
  // visible step, no special-casing needed.
  features.push(ellipsoidFeature('jaw', face.jawCenter, face.jawRadii));

  // Nose: a height-scaled bump on the midline, between the eyes and the mouth. noseLength is a
  // dimensionless height fraction that adds to a base bump; a little extra Y makes it taller. A
  // larger-than-default blend, like the ear below: at extreme hunch + headTilt the tip (thin, ~half a
  // voxel) can sit just far enough from the skull/face-plate surface that the default smin leaves it
  // its own disconnected island (see mobgen bugfix — a `floaters` failure traced to exactly this).
  features.push({
    bone: 'head',
    op: 'add',
    shape: { kind: 'capsule', a: face.noseBase, b: face.noseTip, ra: 0.6 * face.scale, rb: 0.45 * face.scale },
    material: 'skin',
    blend: 0.5 * face.scale,
  });

  // Ears: earSize 0 means none (see sampleHumanoid: it's zero-biased).
  if (p.earSize > 0.01) {
    const earY = (layout.head.head[1] + layout.head.tail[1]) / 2;
    for (const side of SIDES) {
      const center: Vec3 = [sideSign(side) * 0.026 * h * p.headScale, earY, face.headCenter[2]];
      // A larger-than-default blend: the ear is smaller than a voxel at these template sizes, so it
      // needs generous smin help to stay merged with the head rather than round to its own island.
      features.push({
        bone: 'head',
        op: 'add',
        shape: {
          kind: 'ellipsoid',
          center,
          radii: [0.012 * h * p.earSize, 0.02 * h * p.earSize, 0.016 * h * p.earSize],
        },
        material: 'skin',
        blend: 0.05,
      });
    }
  }

  // At coarse LOD the forearm and hand flesh is thinner than one cell and can rasterize as floating
  // islands. Their marrow remains, preserving the skeleton/attachment contract while the detail vanishes.
  const keepDistalFlesh = face.voxel <= 0.06;
  for (const side of SIDES) {
    const arm = layout.arm[side];
    const leg = layout.leg[side];
    const raUpper = 0.048 * h * g;
    const rbUpper = 0.038 * h * g;
    const raFore = 0.036 * h * g;
    const rbFore = 0.028 * h * g;
    // Trimmed from 0.082/0.06: a full raThigh sphere centred on the (lateral) hip joint made the
    // hip/thigh silhouette flare out past the pelvis ("jodhpurs" — see mobgen user feedback). The
    // thigh capsule's top end is also pulled in off the joint below, so raThigh no longer sets the
    // outer hip contour directly.
    const raThigh = 0.062 * h * g;
    const rbThigh = 0.058 * h * g;
    const raShin = 0.055 * h * g;
    const rbShin = 0.038 * h * g;
    // Real thigh mass sits medial/forward of the hip joint (a lateral pivot deep in the pelvis), not
    // centred on it. Offsetting the capsule's top end this way (rather than shrinking raThigh further)
    // keeps the thigh visibly thick while pulling its outer edge in under the pelvis. Both offsets are
    // along axes gait.ts's walk cycle never rotates the leg out of (X: rotX is the only leg/pelvis
    // rotation; Z: fixed in the rest-pose local frame), so this stays put through the whole stride.
    const thighTop = add(leg.hip, [sideSign(side) * -0.4 * raThigh, 0, -0.3 * raThigh]);
    // The shoulder joint sits laterally outside the chest's own ellipsoid by design (the arm attaches
    // beyond the torso, more so at low girth since chest's X radius scales with g but the shoulder's
    // skeletal offset doesn't) — voxelize.ts's repairJointAdjacency bridges that gap with a single
    // forced marrow voxel, which isn't reliably 6-adjacent to the rest of chest's own flesh (seen as an
    // occasional `floaters` failure on lean, broad-shouldered builds). A chest-owned sphere at the
    // midpoint, sized to reach both the chest's flesh and the shoulder's own roundJoint below, makes
    // the join robust without depending on that single voxel.
    const shoulderMid = mid(chestCenter, arm.shoulder);
    const bridgeR = Math.max(0.02 * h * g, length(sub(arm.shoulder, shoulderMid)) - raUpper + 0.03 * h * g);
    features.push(ellipsoidFeature('chest', shoulderMid, [bridgeR, bridgeR, bridgeR]));
    features.push(
      capsuleFeature(`upperArm.${side}`, arm.shoulder, arm.elbow, [raUpper, rbUpper]),
      ...(keepDistalFlesh ? [capsuleFeature(`forearm.${side}`, arm.elbow, arm.wrist, [raFore, rbFore])] : []),
      // The Y radius must clear half of handLen (0.045h, see makeArm) regardless of girth, or the
      // fingertip's forced marrow point sits outside the flesh and floats disconnected.
      ...(keepDistalFlesh
        ? [
            ellipsoidFeature(`hand.${side}`, mid(arm.wrist, arm.handTip), [
              0.028 * h * g,
              0.05 * h + 0.03 * h * g,
              0.022 * h * g,
            ]),
          ]
        : []),
      capsuleFeature(`thigh.${side}`, thighTop, leg.knee, [raThigh, rbThigh]),
      capsuleFeature(`shin.${side}`, leg.knee, leg.ankle, [raShin, rbShin]),
      footFeature(`foot.${side}`, [leg.ankle, leg.toe], [h, g]),
      roundJoint(`upperArm.${side}`, arm.shoulder, raUpper),
      ...(keepDistalFlesh
        ? [roundJoint(`forearm.${side}`, arm.elbow, raFore), roundJoint(`hand.${side}`, arm.wrist, 0.032 * h * g)]
        : []),
      // Smaller than raThigh: it only needs to bridge the (small, fixed) gap between the true hip
      // pivot and the inset thighTop above so the joint hides through the walk cycle — sized to the
      // pivot itself, it would undo the trim above by flaring back out to the old width.
      roundJoint(`thigh.${side}`, leg.hip, raThigh * 0.55),
      roundJoint(`shin.${side}`, leg.knee, raShin),
      roundJoint(`foot.${side}`, leg.ankle, 0.04 * h * g),
    );
  }
  features.push(roundJoint('neck', layout.neck.head, 0.045 * h * g));

  return features;
};

// ---- Clothes, hair, mottling and wounds (paint + carve) ----

const NOISE_SCALE = 0.1;

const buildClothes = (layout: JointLayout, p: HumanoidParams, face: FaceLayout): Feature[] => {
  const h = layout.height;
  const features: Feature[] = [];

  // Shirt: torso, plus sleeves down the upper arm (and into the forearm past sleeveLength).
  const shirtTop = add(layout.chest.tail, [0, 0.02 * h, 0]);
  features.push({
    bone: 'chest',
    op: 'paint',
    shape: { kind: 'capsule', a: layout.pelvis.top, b: shirtTop, ra: 0.085 * h, rb: 0.095 * h },
    material: 'shirt',
  });
  for (const side of SIDES) {
    const arm = layout.arm[side];
    const sleeveEnd = add(arm.shoulder, scale(sub(arm.wrist, arm.shoulder), Math.min(1, p.sleeveLength)));
    features.push({
      bone: `upperArm.${side}`,
      op: 'paint',
      shape: { kind: 'capsule', a: arm.shoulder, b: sleeveEnd, ra: 0.06 * h, rb: 0.05 * h },
      material: 'shirt',
    });
  }
  // Tears: paint skin back over the shirt in noise-gated patches.
  features.push({
    bone: 'chest',
    op: 'paint',
    shape: { kind: 'capsule', a: layout.pelvis.top, b: shirtTop, ra: 0.09 * h, rb: 0.1 * h },
    material: 'skin',
    onto: ['shirt'],
    noise: { scale: NOISE_SCALE, threshold: p.shirtTear },
  });

  // Pants: from the waist down each leg by pantsLength.
  for (const side of SIDES) {
    const leg = layout.leg[side];
    const pantsEnd = add(leg.hip, scale(sub(leg.ankle, leg.hip), Math.min(1, p.pantsLength)));
    features.push({
      bone: `thigh.${side}`,
      op: 'paint',
      shape: { kind: 'capsule', a: layout.pelvis.bottom, b: pantsEnd, ra: 0.075 * h, rb: 0.045 * h },
      material: 'pants',
    });
    features.push({
      bone: `thigh.${side}`,
      op: 'paint',
      shape: { kind: 'capsule', a: layout.pelvis.bottom, b: pantsEnd, ra: 0.08 * h, rb: 0.05 * h },
      material: 'skin',
      onto: ['pants'],
      noise: { scale: NOISE_SCALE, threshold: p.pantsTear },
    });
    // Shoes.
    features.push({
      bone: `foot.${side}`,
      op: 'paint',
      shape: { kind: 'ellipsoid', center: mid(leg.ankle, leg.toe), radii: [0.05 * h, 0.04 * h, layout.footLen * 0.6] },
      material: 'shoe',
    });
  }

  // Hair: the top and back of the skull, by coverage.
  if (p.hairCover > 0.02) {
    const hairCenter = add(face.headCenter, [0, 0.02 * h, 0.01 * h]);
    features.push({
      bone: 'head',
      op: 'paint',
      shape: {
        kind: 'ellipsoid',
        center: hairCenter,
        radii: [0.05 * h * p.headScale, 0.063 * h * p.headScale, 0.054 * h * p.headScale],
      },
      material: 'hair',
      noise: { scale: 0.05, threshold: p.hairCover },
    });
  }

  // Eye socket dimensions are metric; their centers use grid-snapped rows/columns, and the paint is
  // placed one voxel forward from the carve center. Fine sockets may vanish at coarse LOD. x = ±v is an
  // exact voxel column (worldPosition uses plain multiples of v for X), so the eyes stay symmetric.
  const v = face.voxel;
  for (const side of SIDES) {
    const eyeCenter: Vec3 = [sideSign(side) * v, face.eyeY, face.frontZ];
    const carveR = 0.55 * face.scale;
    features.push({
      bone: 'head',
      op: 'carve',
      shape: { kind: 'ellipsoid', center: eyeCenter, radii: [carveR, carveR, carveR] },
      material: 'skin', // carve ignores material; Feature just always requires one
    });
    const socketBottom: Vec3 = [eyeCenter[0], eyeCenter[1], eyeCenter[2] + v];
    const paintR = 0.65 * face.scale;
    features.push({
      bone: 'head',
      op: 'paint',
      shape: { kind: 'ellipsoid', center: socketBottom, radii: [paintR, paintR, paintR] },
      material: 'eye',
    });
  }

  // Mouth: a metric dark line at the jaw/head boundary; jawOpen carves it into an open mouth. Like other
  // sub-voxel face details, it may vanish at coarse LOD.
  const mouthHalf: Vec3 = [1.3 * face.scale, 0.32 * face.scale, 0.45 * face.scale];
  features.push({
    bone: 'jaw',
    op: 'paint',
    shape: { kind: 'box', center: [0, face.mouthY, face.mouthZ], half: mouthHalf, round: 0.15 * face.scale },
    material: 'mouth',
  });
  if (p.jawOpen > 0.02) {
    // Grows downward only, off a fixed top edge (the mouth line's own top, always a safe margin below
    // the face plate) — an open mouth is the lower jaw dropping, not the upper lip rising. Growing both
    // ways from a shifting centre let a wide-open (jawOpen near 1) carve reach up into the face plate's
    // own territory and cut off a piece of it (see mobgen bugfix — a `floaters` failure at max jawOpen
    // combined with extreme hunch/headTilt traced to exactly this).
    const top = face.mouthY + mouthHalf[1];
    const bottom = face.mouthY - mouthHalf[1] - 1.8 * face.scale * p.jawOpen;
    const openHalf: Vec3 = [mouthHalf[0] * 0.85, (top - bottom) / 2, mouthHalf[2] + 0.4 * face.scale * p.jawOpen];
    const openCenter: Vec3 = [0, (top + bottom) / 2, face.mouthZ];
    features.push({
      bone: 'jaw',
      op: 'carve',
      shape: { kind: 'box', center: openCenter, half: openHalf, round: 0.1 * face.scale },
      material: 'skin', // carve ignores material; Feature just always requires one
    });
    // Metric padding follows the face scale too; padding upward is smaller so paint does not tint
    // face-plate voxels the jaw carve never reached.
    const paintHalf: Vec3 = [
      openHalf[0] + 0.5 * face.scale,
      openHalf[1] + 0.25 * face.scale,
      openHalf[2] + 0.5 * face.scale,
    ];
    features.push({
      bone: 'jaw',
      op: 'paint',
      shape: {
        kind: 'box',
        center: [openCenter[0], openCenter[1] - 0.25 * face.scale, openCenter[2]],
        half: paintHalf,
        round: 0.1 * face.scale,
      },
      material: 'mouth',
    });
  }

  // Bruises: low-probability mottling over skin anywhere on the body.
  features.push({
    bone: 'chest',
    op: 'paint',
    shape: { kind: 'box', center: [0, h * 0.5, 0], half: [h * 0.4, h * 0.55, h * 0.35], round: 0 },
    material: 'bruise',
    onto: ['skin'],
    noise: { scale: 0.09, threshold: 0.09 },
  });

  return features;
};

const boneFleshRadius = (boneId: string, layout: JointLayout, p: HumanoidParams): number => {
  const h = layout.height;
  const g = p.girth * FLESH_SCALE;
  const base = boneId.split('.')[0]!;
  const table: Record<string, number> = {
    spine: 0.07 * h * g,
    chest: 0.14 * h * g,
    neck: 0.045 * h * g,
    head: 0.055 * h * p.headScale,
    jaw: 0.03 * h * p.headScale,
    upperArm: 0.043 * h * g,
    forearm: 0.032 * h * g,
    hand: 0.035 * h * g,
    thigh: 0.07 * h * g,
    shin: 0.046 * h * g,
    foot: 0.04 * h * g,
  };
  return table[base] ?? 0.05 * h * g;
};

const boneById = (bones: Body['bones'], id: string): Body['bones'][number] => {
  const bone = bones.find((b) => b.id === id);
  if (!bone) {
    throw new Error(`humanoid: unknown wound bone "${id}"`);
  }
  return bone;
};

const buildWounds = (
  bones: Body['bones'],
  layout: JointLayout,
  p: HumanoidParams,
  wounds: readonly Wound[],
): Feature[] => {
  const features: Feature[] = [];
  for (const w of wounds) {
    const bone = boneById(bones, w.bone);
    const axis = length(sub(bone.tail, bone.head)) > 1e-9 ? normalize(sub(bone.tail, bone.head)) : UP;
    const reference = Math.abs(dot(axis, UP)) > 0.9 ? RIGHT : UP;
    const perp0 = normalize(cross(axis, reference));
    const perp1 = cross(axis, perp0);
    const angle = toRad(w.angle);
    const outward = add(scale(perp0, Math.cos(angle)), scale(perp1, Math.sin(angle)));
    const center = add(bone.head, scale(sub(bone.tail, bone.head), w.t));
    const surface = add(center, scale(outward, boneFleshRadius(w.bone, layout, p)));
    features.push({
      bone: w.bone,
      op: 'carve',
      shape: { kind: 'ellipsoid', center: surface, radii: [w.radius, w.radius, w.radius] },
      material: 'gore',
    });
    features.push({
      bone: w.bone,
      op: 'paint',
      shape: { kind: 'ellipsoid', center: surface, radii: [w.radius * 1.4, w.radius * 1.4, w.radius * 1.4] },
      material: 'gore',
      onto: ['skin', 'bruise', 'shirt', 'pants'],
    });
  }
  return features;
};

// ---- Colour ----

/** The 6 60-degree wedges of the HSL hue wheel, each giving [r, g, b] before adding the lightness offset m. */
const HUE_WEDGES: readonly (readonly [number, (c: number, x: number) => Vec3])[] = [
  [60, (c, x) => [c, x, 0]],
  [120, (c, x) => [x, c, 0]],
  [180, (c, x) => [0, c, x]],
  [240, (c, x) => [0, x, c]],
  [300, (c, x) => [x, 0, c]],
  [360, (c, x) => [c, 0, x]],
];

const hslToRgb = (hDeg: number, s: number, l: number): Vec3 => {
  const h = ((hDeg % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const wedge = HUE_WEDGES.find(([max]) => h < max) ?? HUE_WEDGES.at(-1)!;
  const [r1, g1, b1] = wedge[1](c, x);
  return [r1 + m, g1 + m, b1 + m];
};

const buildPalette = (p: HumanoidParams): Record<Material, Vec3> => ({
  skin: hslToRgb(p.skinHue, p.skinSat, p.skinLight),
  bruise: [0.34, 0.27, 0.33],
  shirt: hslToRgb(p.shirtHue, 0.32, p.shirtLight),
  pants: hslToRgb(p.pantsHue, 0.28, p.pantsLight),
  shoe: [0.12, 0.1, 0.09],
  hair: [0.11, 0.09, 0.08],
  eye: [0.06, 0.06, 0.06],
  mouth: [0.24, 0.05, 0.06],
  gore: [0.32, 0.09, 0.06],
  bone: [0.85, 0.82, 0.72],
});

// ---- Build & sample ----

export const buildHumanoid = (genome: Genome): Body => {
  const p = genome.params as HumanoidParams;
  const layout = jointLayout(p);
  const bones = buildBones(layout);
  const face = buildFaceLayout(layout, p, genome.voxelSize);
  const features = [
    ...buildFlesh(layout, p, face),
    ...buildClothes(layout, p, face),
    ...buildWounds(bones, layout, p, genome.wounds),
  ];
  return { bones, features, palette: buildPalette(p) };
};

const LOWER_CRAWLER_BONE = /^(shin|foot)\./;
const CRAWLER_STUMP_FRACTION = 0.55;

const cutCrawlerBones = (bones: readonly Bone[]): { bones: Bone[]; cuts: Map<string, Vec3> } => {
  const cuts = new Map<string, Vec3>();
  const retained = bones.flatMap((bone) => {
    if (LOWER_CRAWLER_BONE.test(bone.id)) {
      return [];
    }
    if (!bone.id.startsWith('thigh.')) {
      return [bone];
    }
    const cut: Vec3 = [
      bone.head[0] + (bone.tail[0] - bone.head[0]) * CRAWLER_STUMP_FRACTION,
      bone.head[1] + (bone.tail[1] - bone.head[1]) * CRAWLER_STUMP_FRACTION,
      bone.head[2] + (bone.tail[2] - bone.head[2]) * CRAWLER_STUMP_FRACTION,
    ];
    cuts.set(bone.id, cut);
    return [{ ...bone, tail: cut }];
  });
  return { bones: retained, cuts };
};

const trimCrawlerFeature = (
  feature: Feature,
  cut: Vec3 | undefined,
  boneHeads: ReadonlyMap<string, Vec3>,
): Feature[] => {
  if (LOWER_CRAWLER_BONE.test(feature.bone)) {
    return [];
  }
  if (!cut || feature.op === 'paint') {
    return cut ? [] : [feature];
  }
  if (feature.shape.kind === 'ellipsoid') {
    const head = boneHeads.get(feature.bone)!;
    return length(sub(feature.shape.center, head)) <= 0.08 ? [feature] : [];
  }
  if (feature.shape.kind === 'capsule') {
    const direction = sub(feature.shape.b, feature.shape.a);
    const lengthSquared = dot(direction, direction);
    const t = lengthSquared > 0 ? dot(sub(cut, feature.shape.a), direction) / lengthSquared : 1;
    if (t > 0 && t < 1) {
      const radius = feature.shape.ra + (feature.shape.rb - feature.shape.ra) * t;
      return [{ ...feature, shape: { ...feature.shape, b: cut, rb: radius } }];
    }
  }
  return [feature];
};

/** Keeps a short upper-thigh stump on each side; the lower-leg subtree is absent. */
const amputateCrawlerLegs = (body: Body): Body => {
  const { bones, cuts } = cutCrawlerBones(body.bones);
  const boneHeads = new Map(body.bones.map((bone) => [bone.id, bone.head]));
  const features = body.features.flatMap((feature) => trimCrawlerFeature(feature, cuts.get(feature.bone), boneHeads));
  for (const [bone, center] of cuts) {
    features.push({
      bone,
      op: 'paint',
      shape: { kind: 'ellipsoid', center, radii: [0.045, 0.035, 0.045] },
      material: 'gore',
      onto: ['skin'],
    });
  }
  return { ...body, bones, features };
};

export const sampleWounds = (rng: Rng, count: number): Wound[] => {
  const n = Math.max(0, Math.round(count));
  const wounds: Wound[] = [];
  for (let i = 0; i < n; i++) {
    wounds.push({
      bone: pick(rng, WOUNDABLE_BONES),
      t: range(rng, 0.15, 0.85),
      angle: range(rng, 0, 360),
      radius: range(rng, 0.018, 0.045),
    });
  }
  return wounds;
};

const sampleHumanoid: BodyPlanDef['sample'] = (rng: Rng, template: Template) => {
  const params = sampleParams(rng, template.params, HUMANOID_PARAM_ORDER);
  const wounds = sampleWounds(rng, params.woundCount!);
  return { params, wounds };
};

registerBodyPlan('humanoid', {
  sample: sampleHumanoid,
  build: (genome) => buildHumanoid(genome),
  paramOrder: HUMANOID_PARAM_ORDER,
  woundBones: WOUNDABLE_BONES,
});

registerBodyPlan('crawler', {
  sample: sampleHumanoid,
  build: (genome) => amputateCrawlerLegs(buildHumanoid(genome)),
  paramOrder: HUMANOID_PARAM_ORDER,
  woundBones: WOUNDABLE_BONES,
});
