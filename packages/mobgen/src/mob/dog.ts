// The dog body plan: a quadruped infected animal, built deterministically from a genome's sampled
// params. It is its own body plan rather than a humanoid variant because its support, pose and gait all
// come from four paws on the ground, not two feet. dogPose/dogGaitPose/dogHitPose layer a limping,
// lurching walk over the rest pose the way crawler.ts does for the prone crawler.

import type { Body, Feature, Material } from '../core/body.ts';
import { RIGHT, UP } from '../core/conventions.ts';
import type { Realized } from '../core/generate.ts';
import { type BodyPlanDef, registerBodyPlan, sampleParams } from '../core/generate.ts';
import {
  add,
  applyPoint,
  cross,
  dot,
  IDENTITY_M,
  length,
  lerp3,
  type Mat3,
  mulMM,
  normalize,
  rotX,
  rotZ,
  scale,
  sub,
  type Vec3,
} from '../core/math.ts';
import { boneTransforms, type Pose } from '../core/pose.ts';
import { pick, type Rng, range } from '../core/random.ts';
import { type Genome, type Template, templateByName, type Wound } from '../core/template.ts';
import { posedVoxelSurfaceBoundsForBones } from '../core/voxelBounds.ts';
import { heightHeadBudgets } from './budgets.ts';
import { resolveMaterials } from './materials.ts';
import { HIT_FLINCH } from './reactions.ts';

const SIDES = ['L', 'R'] as const;
type Side = (typeof SIDES)[number];
const sideSign = (s: Side): number => (s === 'L' ? -1 : 1);

/** Params sampled in this fixed order (see core/generate.ts's sampleParams). */
const DOG_PARAM_ORDER = [
  'height',
  'girth',
  'headScale',
  'neckLength',
  'tailLength',
  'headTilt',
  'jawOpen',
  'skinHue',
  'skinSat',
  'skinLight',
  'woundCount',
  'limp',
] as const;

type DogParams = Readonly<Record<(typeof DOG_PARAM_ORDER)[number], number>>;

/** Bones a wound may sit on; paws are excluded so a carve can never detach a ground contact. */
const DOG_WOUNDABLE_BONES = [
  'pelvis',
  'spine',
  'neck',
  'head',
  'jaw',
  'tail',
  'foreUpper.L',
  'foreUpper.R',
  'foreLower.L',
  'foreLower.R',
  'hindUpper.L',
  'hindUpper.R',
  'hindLower.L',
  'hindLower.R',
] as const;

/** A cut may take any limb subtree or the head/tail; severedBoneSet hides everything below the cut. */
export const DOG_SEVERABLE_PARTS = [
  'head',
  'tail',
  'foreUpper.L',
  'foreUpper.R',
  'foreLower.L',
  'foreLower.R',
  'forePaw.L',
  'forePaw.R',
  'hindUpper.L',
  'hindUpper.R',
  'hindLower.L',
  'hindLower.R',
  'hindPaw.L',
  'hindPaw.R',
] as const;

// A dog's withers height is the `height` param; the head rises above it. All joints are fractions of
// that height, measured from the ground (y = 0), and the body faces -Z (conventions.ts).
interface LegJoints {
  readonly upper: Vec3;
  readonly knee: Vec3;
  readonly ankle: Vec3;
  readonly toe: Vec3;
}

interface DogLayout {
  readonly height: number;
  readonly girth: number;
  readonly hips: Vec3;
  readonly midTorso: Vec3;
  readonly chest: Vec3;
  readonly neckTop: Vec3;
  readonly headTip: Vec3;
  readonly jawHinge: Vec3;
  readonly jawTip: Vec3;
  readonly tailBase: Vec3;
  readonly tailTip: Vec3;
  readonly legs: Readonly<Record<string, LegJoints>>;
}

/** The four legs, in a stable order; `key` is the bone-id prefix, `front` selects the fore/hind pair. */
const LEGS = [
  { key: 'foreUpper.L', lower: 'foreLower.L', paw: 'forePaw.L', front: true, side: 'L' as Side },
  { key: 'foreUpper.R', lower: 'foreLower.R', paw: 'forePaw.R', front: true, side: 'R' as Side },
  { key: 'hindUpper.L', lower: 'hindLower.L', paw: 'hindPaw.L', front: false, side: 'L' as Side },
  { key: 'hindUpper.R', lower: 'hindLower.R', paw: 'hindPaw.R', front: false, side: 'R' as Side },
] as const;

const dogLayout = (p: DogParams): DogLayout => {
  const { height: h, girth, neckLength: neckLen, tailLength: tailLen } = p;
  const hips: Vec3 = [0, 0.96 * h, 0.28 * h];
  const midTorso: Vec3 = [0, 0.99 * h, 0];
  const chest: Vec3 = [0, h, -0.28 * h];
  const neckTop: Vec3 = [0, h + 0.16 * h * neckLen, -0.28 * h - 0.16 * h * neckLen];
  const headTip: Vec3 = [0, h + 0.2 * h * neckLen, -0.28 * h - 0.4 * h * neckLen];
  const jawHinge: Vec3 = [0, h + 0.12 * h * neckLen, -0.34 * h - 0.16 * h * neckLen];
  const jawTip: Vec3 = [0, h + 0.06 * h * neckLen, -0.28 * h - 0.4 * h * neckLen];
  const tailBase: Vec3 = [0, 0.92 * h, 0.32 * h];
  const tailTip: Vec3 = [0, 0.98 * h + 0.06 * h * tailLen, (0.32 + 0.3 * tailLen) * h];
  const legs: Record<string, LegJoints> = {};
  for (const leg of LEGS) {
    const lateral = (leg.front ? 0.11 : 0.12) * h * girth;
    const sign = sideSign(leg.side);
    if (leg.front) {
      legs[leg.key] = {
        upper: [sign * lateral, h, -0.22 * h],
        knee: [sign * lateral, 0.55 * h, -0.26 * h],
        ankle: [sign * lateral, 0.14 * h, -0.3 * h],
        toe: [sign * lateral, 0.06 * h, -0.44 * h],
      };
    } else {
      legs[leg.key] = {
        upper: [sign * lateral, 0.94 * h, 0.24 * h],
        knee: [sign * lateral, 0.55 * h, 0.34 * h],
        ankle: [sign * lateral, 0.14 * h, 0.26 * h],
        toe: [sign * lateral, 0.06 * h, 0.14 * h],
      };
    }
  }
  return { height: h, girth, hips, midTorso, chest, neckTop, headTip, jawHinge, jawTip, tailBase, tailTip, legs };
};

const buildBones = (layout: DogLayout): Body['bones'] => {
  const bones: Body['bones'][number][] = [
    { id: 'pelvis', parent: null, head: layout.hips, tail: layout.midTorso },
    { id: 'spine', parent: 'pelvis', head: layout.midTorso, tail: layout.chest },
    { id: 'neck', parent: 'spine', head: layout.chest, tail: layout.neckTop },
    { id: 'head', parent: 'neck', head: layout.neckTop, tail: layout.headTip },
    { id: 'jaw', parent: 'head', head: layout.jawHinge, tail: layout.jawTip },
    { id: 'tail', parent: 'pelvis', head: layout.tailBase, tail: layout.tailTip },
  ];
  for (const leg of LEGS) {
    const joints = layout.legs[leg.key]!;
    bones.push(
      { id: leg.key, parent: leg.front ? 'spine' : 'pelvis', head: joints.upper, tail: joints.knee },
      { id: leg.lower, parent: leg.key, head: joints.knee, tail: joints.ankle },
      { id: leg.paw, parent: leg.lower, head: joints.ankle, tail: joints.toe },
    );
  }
  return bones;
};

// ---- Flesh ----

const mid = (a: Vec3, b: Vec3): Vec3 => scale(add(a, b), 0.5);

/** Linear radii were authored generously; this trims total flesh volume to a dog-sized actor. */
const FLESH_SCALE = 0.62;

const roundJoint = (bone: string, center: Vec3, radius: number): Feature => ({
  bone,
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

/** A flat-bottomed sole from heel to toe, so the paw, not the ankle joint, bears the ground contact. */
const pawFeature = (bone: string, joints: LegJoints, dims: { readonly h: number; readonly g: number }): Feature => {
  const { ankle, toe } = joints;
  const { h, g } = dims;
  const heelZ = ankle[2] + 0.05 * h;
  const height = ankle[1] + 0.05 * h;
  const center: Vec3 = [ankle[0], height / 2, (heelZ + toe[2]) / 2];
  const half: Vec3 = [0.045 * h * g, height / 2, Math.abs(heelZ - toe[2]) / 2];
  return { bone, op: 'add', shape: { kind: 'box', center, half, round: 0.012 * h * g }, material: 'skin' };
};

const buildFlesh = (layout: DogLayout, p: DogParams): Feature[] => {
  const h = layout.height;
  const g = p.girth * FLESH_SCALE;
  const hs = p.headScale;
  const features: Feature[] = [
    ellipsoidFeature('pelvis', layout.midTorso, [0.13 * h * g, 0.16 * h * g, 0.24 * h * g]),
    capsuleFeature('pelvis', layout.hips, layout.midTorso, [0.12 * h * g, 0.13 * h * g]),
    ellipsoidFeature('spine', mid(layout.midTorso, layout.chest), [0.13 * h * g, 0.16 * h * g, 0.24 * h * g]),
    capsuleFeature('spine', layout.midTorso, layout.chest, [0.12 * h * g, 0.13 * h * g]),
    capsuleFeature('neck', layout.chest, layout.neckTop, [0.08 * h * g, 0.06 * h * g]),
    ellipsoidFeature('head', lerp3(layout.neckTop, layout.headTip, 0.28), [
      0.09 * h * hs,
      0.09 * h * hs,
      0.12 * h * hs,
    ]),
    boxFeature(
      'head',
      lerp3(layout.neckTop, layout.headTip, 0.78),
      [0.05 * h * hs, 0.042 * h * hs, 0.11 * h * hs],
      0.02 * h * hs,
    ),
    ellipsoidFeature('jaw', lerp3(layout.jawHinge, layout.jawTip, 0.55), [
      0.055 * h * hs,
      0.038 * h * hs,
      0.095 * h * hs,
    ]),
    capsuleFeature('tail', layout.tailBase, layout.tailTip, [0.05 * h * g, 0.022 * h * g]),
  ];

  // Ears: two small flaps on the skull, so the head reads as a dog even at game distance.
  const skull = lerp3(layout.neckTop, layout.headTip, 0.28);
  for (const side of SIDES) {
    features.push({
      bone: 'head',
      op: 'add',
      shape: {
        kind: 'ellipsoid',
        center: [sideSign(side) * 0.06 * h * hs, skull[1] + 0.07 * h * hs, skull[2] + 0.02 * h * hs],
        radii: [0.022 * h * hs, 0.06 * h * hs, 0.04 * h * hs],
      },
      material: 'skin',
      blend: 0.03 * h,
    });
  }

  // Shoulder/hip bridges: the upper-leg head sits laterally outside the torso ellipsoid by design, so a
  // torso-owned sphere at the midpoint keeps the join solid rather than relying on the marrow cell alone.
  for (const leg of LEGS) {
    const joints = layout.legs[leg.key]!;
    const anchor = leg.front ? layout.chest : layout.hips;
    const bridge = mid(anchor, joints.upper);
    const radius = Math.max(0.03 * h * g, length(sub(joints.upper, bridge)) - 0.04 * h + 0.03 * h * g);
    features.push(ellipsoidFeature(leg.front ? 'spine' : 'pelvis', bridge, [radius, radius, radius]));
  }

  for (const leg of LEGS) {
    const joints = layout.legs[leg.key]!;
    const raUpper = (leg.front ? 0.06 : 0.065) * h * g;
    const rbUpper = 0.048 * h * g;
    features.push(
      capsuleFeature(leg.key, joints.upper, joints.knee, [raUpper, rbUpper]),
      roundJoint(leg.key, joints.upper, raUpper * 0.7),
      capsuleFeature(leg.lower, joints.knee, joints.ankle, [0.042 * h * g, 0.032 * h * g]),
      roundJoint(leg.lower, joints.knee, 0.042 * h * g),
      pawFeature(leg.paw, joints, { h, g }),
      roundJoint(leg.paw, joints.ankle, 0.036 * h * g),
    );
  }

  // Belly sag: a soft mass under the torso, kept clear of the ground.
  features.push(ellipsoidFeature('pelvis', [0, 0.85 * h, 0.05 * h], [0.09 * h * g, 0.07 * h * g, 0.28 * h * g]));
  return features;
};

const buildFace = (layout: DogLayout, p: DogParams): Feature[] => {
  const h = layout.height;
  const hs = p.headScale;
  const features: Feature[] = [];
  const skull = lerp3(layout.neckTop, layout.headTip, 0.34);
  for (const side of SIDES) {
    features.push({
      bone: 'head',
      op: 'paint',
      shape: {
        kind: 'ellipsoid',
        center: [sideSign(side) * 0.045 * h * hs, skull[1] + 0.02 * h * hs, skull[2] - 0.05 * h * hs],
        radii: [0.018 * h * hs, 0.018 * h * hs, 0.018 * h * hs],
      },
      material: 'eye',
    });
  }
  const muzzle = lerp3(layout.neckTop, layout.headTip, 0.95);
  features.push({
    bone: 'head',
    op: 'paint',
    shape: {
      kind: 'ellipsoid',
      center: [0, muzzle[1] + 0.015 * h * hs, muzzle[2] - 0.01 * h * hs],
      radii: [0.028 * h * hs, 0.022 * h * hs, 0.025 * h * hs],
    },
    material: 'eye',
  });
  const mouthCenter = lerp3(layout.jawHinge, layout.jawTip, 0.6);
  features.push({
    bone: 'jaw',
    op: 'paint',
    shape: {
      kind: 'box',
      center: [0, mouthCenter[1], mouthCenter[2]],
      half: [0.05 * h * hs, 0.02 * h * hs, 0.09 * h * hs],
      round: 0.01 * h * hs,
    },
    material: 'mouth',
  });
  if (p.jawOpen > 0.02) {
    features.push({
      bone: 'jaw',
      op: 'carve',
      shape: {
        kind: 'box',
        center: [0, mouthCenter[1] - 0.03 * h * hs, mouthCenter[2]],
        half: [0.045 * h * hs, 0.04 * h * hs, 0.08 * h * hs],
        round: 0.01 * h * hs,
      },
      material: 'skin',
    });
  }
  // Sickly mottling over the whole body.
  features.push({
    bone: 'spine',
    op: 'paint',
    shape: { kind: 'box', center: [0, 0.7 * h, 0], half: [0.3 * h, 0.5 * h, 0.6 * h], round: 0 },
    material: 'bruise',
    onto: ['skin'],
    noise: { scale: 0.08, threshold: 0.1 },
  });
  return features;
};

const DOG_FLESH_RADIUS: Readonly<Record<string, number>> = {
  pelvis: 0.15,
  spine: 0.14,
  neck: 0.08,
  head: 0.09,
  jaw: 0.05,
  tail: 0.05,
  foreUpper: 0.06,
  foreLower: 0.042,
  forePaw: 0.045,
  hindUpper: 0.065,
  hindLower: 0.045,
  hindPaw: 0.045,
};

const boneById = (bones: Body['bones'], id: string): Body['bones'][number] => {
  const bone = bones.find((candidate) => candidate.id === id);
  if (!bone) {
    throw new Error(`dog: unknown wound bone "${id}"`);
  }
  return bone;
};

const buildWounds = (bones: Body['bones'], layout: DogLayout, wounds: readonly Wound[]): Feature[] => {
  const h = layout.height;
  const features: Feature[] = [];
  for (const w of wounds) {
    const bone = boneById(bones, w.bone);
    const axis = length(sub(bone.tail, bone.head)) > 1e-9 ? normalize(sub(bone.tail, bone.head)) : UP;
    const reference = Math.abs(dot(axis, UP)) > 0.9 ? RIGHT : UP;
    const perp0 = normalize(cross(axis, reference));
    const perp1 = cross(axis, perp0);
    const angle = (w.angle * Math.PI) / 180;
    const outward = add(scale(perp0, Math.cos(angle)), scale(perp1, Math.sin(angle)));
    const center = add(bone.head, scale(sub(bone.tail, bone.head), w.t));
    const base = w.bone.split('.')[0]!;
    const radius = (DOG_FLESH_RADIUS[base] ?? 0.05) * h * layout.girth;
    const surface = add(center, scale(outward, radius));
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
      onto: ['skin', 'bruise'],
    });
  }
  return features;
};

const buildDog = (genome: Genome): Body => {
  const p = genome.params as DogParams;
  const layout = dogLayout(p);
  const bones = buildBones(layout);
  const features = [...buildFlesh(layout, p), ...buildFace(layout, p), ...buildWounds(bones, layout, genome.wounds)];
  return { bones, features, materials: resolveMaterials(templateByName(genome.template), p) };
};

const sampleDog: BodyPlanDef['sample'] = (rng: Rng, template: Template) => {
  const params = sampleParams(rng, template.params, DOG_PARAM_ORDER);
  const wounds: Wound[] = [];
  for (let i = 0; i < Math.max(0, Math.round(params.woundCount!)); i++) {
    wounds.push({
      bone: pick(rng, DOG_WOUNDABLE_BONES),
      t: range(rng, 0.2, 0.8),
      angle: range(rng, 0, 360),
      radius: range(rng, 0.014, 0.03),
    });
  }
  return { params, wounds };
};

registerBodyPlan('dog', {
  sample: sampleDog,
  build: (genome) => buildDog(genome),
  paramOrder: DOG_PARAM_ORDER,
  woundBones: DOG_WOUNDABLE_BONES,
  budgets: heightHeadBudgets,
  limbBones: SIDES.flatMap((side) =>
    ['foreUpper', 'foreLower', 'hindUpper', 'hindLower'].map((segment) => `${segment}.${side}`),
  ),
});

// ---- Pose, gait and hit pose ----

const PAW_BONES = LEGS.map((leg) => leg.paw);

export interface DogStance {
  readonly limp?: number;
  readonly headTilt?: number;
  /** Bones hidden by accumulated cuts; grounding ignores them so a severed limb is not an invisible support. */
  readonly severed?: ReadonlySet<string> | undefined;
}

/** The rest stance: a low, uneven four-paw stand, head hanging. Regrounded against the surviving bones so
 * the paws define the contact and nothing else dips below them. */
export const dogPose = (realized: Realized, stance: DogStance = {}): Pose => {
  const limp = stance.limp ?? 0;
  const headTilt = stance.headTilt ?? 0;
  const limpScale = Math.max(0, Math.min(1, limp));
  const rotations: Record<string, Mat3> = {
    pelvis: rotX(1.5),
    spine: rotX(-2),
    neck: rotX(4),
    head: rotX(6 + headTilt * 0.5),
    jaw: rotX(4 + limpScale * 4),
    'foreUpper.L': rotX(3 + 4 * limpScale),
    'foreUpper.R': rotX(-2),
    'hindUpper.L': rotX(-4 - 5 * limpScale),
    'hindUpper.R': rotX(2),
    'foreLower.L': rotX(-6 * limpScale),
    'hindLower.L': rotX(8 * limpScale),
  };
  return groundDogPose(realized, { root: [0, 0, 0], rotations }, stance.severed);
};

const smoothstep = (value: number): number => value * value * (3 - 2 * value);

/** Sets root.y so the lowest voxel surface of the posed body sits on the ground (y = 0). Any pose whose
 * planted paws are the lowest points keeps them exactly on the ground; a swing paw that lifts does not.
 * Severed bones are excluded, so the body rests or falls on its surviving geometry rather than hovering on
 * a hidden leg. */
const groundDogPose = (realized: Realized, pose: Pose, severed?: ReadonlySet<string>): Pose => {
  const probe: Pose = { root: [pose.root[0], 0, pose.root[2]], rotations: pose.rotations };
  const surviving = realized.body.bones.map((bone) => bone.id).filter((id) => !(severed?.has(id) ?? false));
  const surfaces = posedVoxelSurfaceBoundsForBones(realized, probe, surviving);
  const lowest = Math.min(...surfaces.values());
  return { ...pose, root: [pose.root[0], -lowest, pose.root[2]] };
};

const DOG_TROT = {
  stridePerWithersHeight: 1.77,
  liftPerWithersHeight: 0.14,
  supportPerWithersHeight: 0.31,
  compressionPerWithersHeight: 0.025,
  pitchDeg: 2,
} as const;
/** At full limp the fore-left/hind-right diagonal takes this much shorter steps than the other, so the
 * shamble's timing is uneven. Its planted paws still track the ground exactly: both legs of a stance
 * half solve to the same offset, only the distance covered differs. */
const LIMP_STEP_SHORTEN = 0.5;

/** The leg's rest segment vectors in the sagittal (Y, Z) plane: upper head → knee, knee → ankle. */
const legSegmentsOf = (
  realized: Realized,
  leg: (typeof LEGS)[number],
): { readonly u: readonly [number, number]; readonly v: readonly [number, number] } => {
  const upper = boneById(realized.body.bones, leg.key);
  const lower = boneById(realized.body.bones, leg.lower);
  return {
    u: [lower.head[1] - upper.head[1], lower.head[2] - upper.head[2]],
    v: [lower.tail[1] - lower.head[1], lower.tail[2] - lower.head[2]],
  };
};

/** Fold `angle` (radians) into (-π, π], so joint differences never jump a full turn. */
const wrapPi = (angle: number): number => {
  let a = angle;
  while (a > Math.PI) {
    a -= 2 * Math.PI;
  }
  while (a <= -Math.PI) {
    a += 2 * Math.PI;
  }
  return a;
};

/** Two-link solve of the upper-leg swing and lower-leg fold that put the ankle at `target` in the
 * upper bone's parent frame. Pinning the height bends the knee instead of letting the ankle ride its
 * arc, so a planted paw's sole stays on the ground across the whole stance half rather than rising to
 * the midpoint of a single-link sweep. The knee takes the branch matching the rest bend, and the
 * ankle's horizontal position is still exact, so a planted paw cannot creep forward or back. */
const stanceLegAngles = (
  u: readonly [number, number],
  v: readonly [number, number],
  targetY: number,
  targetZ: number,
): { readonly swingDeg: number; readonly foldDeg: number } => {
  const l1 = Math.hypot(u[0], u[1]);
  const l2 = Math.hypot(v[0], v[1]);
  const restY = u[0] + v[0];
  const restZ = u[1] + v[1];
  const d = Math.hypot(targetY, targetZ);
  const cosAlpha = Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)));
  const alpha = Math.acos(cosAlpha);
  const thetaU = Math.atan2(u[1], u[0]);
  const thetaD = Math.atan2(targetZ, targetY);
  const restCross = u[0] * restZ - u[1] * restY;
  const side = restCross >= 0 ? 1 : -1;
  let phi = thetaD + alpha;
  for (const candidate of [thetaD + alpha, thetaD - alpha]) {
    const uy = Math.cos(candidate) * l1;
    const uz = Math.sin(candidate) * l1;
    if ((uy * targetZ - uz * targetY >= 0 ? 1 : -1) === side) {
      phi = candidate;
      break;
    }
  }
  const swing = wrapPi(phi - thetaU);
  const vx = targetY - Math.cos(phi) * l1;
  const vz = targetZ - Math.sin(phi) * l1;
  const fold = wrapPi(Math.atan2(vz, vx) - Math.atan2(v[1], v[0]) - swing);
  return { swingDeg: (swing * 180) / Math.PI, foldDeg: (fold * 180) / Math.PI };
};

/** Opposite-corner diagonals: fore-left with hind-right, fore-right with hind-left. The first carries
 * the limp so the shamble's step timing is uneven. */
const DOG_PAIRS = [
  { legs: ['foreUpper.L', 'hindUpper.R'] as const, limp: true },
  { legs: ['foreUpper.R', 'hindUpper.L'] as const, limp: false },
] as const;
const DOG_PAIR_OF_LEG: Readonly<Record<string, number>> = {
  'foreUpper.L': 0,
  'hindUpper.R': 0,
  'foreUpper.R': 1,
  'hindUpper.L': 1,
};

/** Every leg's rest sagitta plus the shared stance offsets and the per-diagonal step lengths they imply.
 * Both legs of a stance half are planted at the same Z offsets, so neither can drift against the other;
 * each diagonal's step length is exactly the ground its stance sweeps. */
const dogStepGeometry = (realized: Realized, limpScale: number) => {
  const legs = LEGS.map((leg) => ({ leg, ...legSegmentsOf(realized, leg) }));
  const frontOffset = (-boneById(realized.body.bones, 'foreUpper.L').head[1] * DOG_TROT.stridePerWithersHeight) / 4;
  const backOffset = -frontOffset;
  const fullStep = backOffset - frontOffset;
  const stepLengths = DOG_PAIRS.map((pair) => (pair.limp ? fullStep * (1 - LIMP_STEP_SHORTEN * limpScale) : fullStep));
  return { legs, frontOffset, stepLengths };
};

interface LegAnchors {
  /** World Y of the upper-leg head in the base pose with a zero root, before grounding shifts it. */
  readonly headWorldY: number;
  readonly headShiftZ: number;
  /** World X rotation (degrees) of the upper leg's parent, so a world-frame swing can be written local. */
  readonly parentAngleDeg: number;
}

/** Per-leg parent frame at a stance's base pose. Rotations are applied in rest-pose world axes, so a
 * world-frame leg swing has to be written back through the parent's own rotation (`parentAngleDeg`), and
 * a pair's shared height must compare the heads' posed world positions, not their rest ones. */
const legAnchors = (realized: Realized, base: Pose): Readonly<Record<string, LegAnchors>> => {
  const transforms = boneTransforms(realized.body.bones, { root: [0, 0, 0], rotations: base.rotations });
  const anchors: Record<string, LegAnchors> = {};
  for (const leg of LEGS) {
    const upper = boneById(realized.body.bones, leg.key);
    const parent = upper.parent === null ? null : transforms.get(upper.parent);
    const parentAngleDeg = parent ? (Math.atan2(parent.r[7], parent.r[4]) * 180) / Math.PI : 0;
    anchors[leg.key] = {
      headWorldY: applyPoint(transforms.get(leg.key)!, upper.head)[1],
      headShiftZ: applyPoint(transforms.get(leg.key)!, upper.head)[2] - upper.head[2],
      parentAngleDeg,
    };
  }
  return anchors;
};

/** Ground distance per full cycle (both diagonals), shared with the pose's stance sweep. */
export const dogStrideLength = (realized: Realized, stance: DogStance = {}): number => {
  const limpScale = Math.max(0, Math.min(1, stance.limp ?? 0));
  return dogStepGeometry(realized, limpScale).stepLengths.reduce((sum, step) => sum + step, 0);
};

/** A staggering diagonal gait driven by ground distance, not wall time: `distance` is how far the body
 * has advanced, so a planted paw rides the moving ground and any speed just changes how fast distance
 * grows. The fore-left/hind-right pair reaches while fore-right/hind-left plants, then they swap; `limp`
 * shortens and droops the injured diagonal, so the walk lurches rather than trots. */
export const dogGaitPose = (realized: Realized, distance: number, speed: number, stance: DogStance = {}): Pose => {
  const limp = stance.limp ?? 0;
  const limpScale = Math.max(0, Math.min(1, limp));
  const base = dogPose(realized, stance);
  if (speed <= 0 || !Number.isFinite(distance)) {
    return base;
  }
  const [, height] = boneById(realized.body.bones, 'foreUpper.L').head;
  const { legs, frontOffset, stepLengths } = dogStepGeometry(realized, limpScale);
  const cycleLength = stepLengths[0]! + stepLengths[1]!;
  const cycle = ((distance % cycleLength) + cycleLength) % cycleLength;
  const pairIndex = cycle < stepLengths[0]! ? 0 : 1;
  const stepLength = stepLengths[pairIndex]!;
  const stepDistance = pairIndex === 0 ? cycle : cycle - stepLengths[0]!;
  const progress = stepDistance / stepLength;
  const reach = Math.sin(progress * Math.PI);
  const liftHeight = height * DOG_TROT.liftPerWithersHeight * reach;
  const bodyRotations = {
    ...base.rotations,
    pelvis: mulMM(base.rotations.pelvis!, rotX(DOG_TROT.pitchDeg * Math.sin(2 * Math.PI * progress))),
  };
  const anchors = legAnchors(realized, { ...base, rotations: bodyRotations });
  const blend = progress * progress * (3 - 2 * progress);
  const phase = legs.map((leg) => {
    const legPair = DOG_PAIR_OF_LEG[leg.leg.key]!;
    const isStance = legPair === pairIndex;
    const sideScale = leg.leg.side === 'L' ? 1 - 0.5 * limpScale : 1;
    const fromOffset = frontOffset + stepLengths[legPair]!;
    const offset = isStance ? frontOffset + stepLength * progress : fromOffset + (frontOffset - fromOffset) * blend;
    const anchor = anchors[leg.leg.key]!;
    return { leg, offset, lift: isStance ? 0 : liftHeight * sideScale, anchor };
  });
  // A shared ankle height keeps both diagonals on one ground plane. The trot reserves reach for
  // knee flex at its widest sweep; footfall compression changes torso height without moving the paws.
  const supportY =
    height *
    (DOG_TROT.supportPerWithersHeight + DOG_TROT.compressionPerWithersHeight * Math.cos(2 * Math.PI * progress));
  const rotations: Record<string, Mat3> = { ...bodyRotations };
  for (const { leg, offset, lift, anchor } of phase) {
    // Rotations act in rest-pose world axes while the solve lives in the parent's frame, so rotate the
    // world target back through the parent's own rotation before solving; the upper keeps its own angle.
    const phi = (anchor.parentAngleDeg * Math.PI) / 180;
    const wy = supportY + lift - anchor.headWorldY;
    const wz = leg.u[1] + leg.v[1] + offset - anchor.headShiftZ;
    const { swingDeg, foldDeg } = stanceLegAngles(
      leg.u,
      leg.v,
      Math.cos(phi) * wy + Math.sin(phi) * wz,
      -Math.sin(phi) * wy + Math.cos(phi) * wz,
    );
    rotations[leg.leg.key] = rotX(swingDeg);
    rotations[leg.leg.lower] = rotX(foldDeg);
    // Keep the foot level: cancel the leg's own swing at the paw, so the sole keeps one orientation and a
    // planted paw's horizontal position is exactly the ankle offset the solve placed.
    rotations[leg.leg.paw] = rotX(-(swingDeg + foldDeg + anchor.parentAngleDeg));
  }
  const addBodyRotation = (bone: string, delta: Mat3): void => {
    rotations[bone] = mulMM(rotations[bone] ?? IDENTITY_M, delta);
  };
  addBodyRotation('neck', rotX(4 * reach));
  addBodyRotation('head', rotX(5 * reach));
  return groundDogPose(realized, { root: [0, base.root[1], 0], rotations }, stance.severed);
};

/** How a flinch lands: which side it mirrors to, and the cuts whose bones must not bear its regrounding. */
export interface DogHitOptions {
  readonly side?: number;
  readonly severed?: ReadonlySet<string>;
}

/** A short brace/recoil layered over the current pose and re-grounded against the surviving supports. */
export const dogHitPose = (realized: Realized, base: Pose, time: number, options: DogHitOptions = {}): Pose => {
  if (!(time > 0) || time >= HIT_FLINCH.duration) {
    return base;
  }
  const side = options.side ?? 0;
  const progress = time / HIT_FLINCH.duration;
  const intensity = progress < 0.2 ? smoothstep(progress / 0.2) : 1 - smoothstep((progress - 0.2) / 0.8);
  const rotations: Record<string, Mat3> = { ...base.rotations };
  const addRotation = (bone: string, delta: Mat3): void => {
    rotations[bone] = mulMM(rotations[bone] ?? IDENTITY_M, delta);
  };
  addRotation('spine', rotX(-4 * intensity));
  addRotation('neck', rotX(-5 * intensity));
  addRotation('head', rotX(-8 * intensity));
  addRotation('jaw', rotX(10 * intensity));
  addRotation('foreUpper.L', rotZ(-3 * intensity * side));
  addRotation('foreUpper.R', rotZ(3 * intensity * side));
  return groundDogPose(realized, { ...base, rotations }, options.severed);
};

/** Exported for tests: the paw bones that bear the ground contact. */
export const dogPawBones: readonly string[] = PAW_BONES;
