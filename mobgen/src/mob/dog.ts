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
import type { Pose } from '../core/pose.ts';
import { pick, type Rng, range } from '../core/random.ts';
import type { Genome, Template, Wound } from '../core/template.ts';
import { posedVoxelSurfaceBoundsForBones } from '../core/voxelBounds.ts';
import { hslToRgb } from './humanoid.ts';
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

const buildPalette = (p: DogParams): Record<Material, Vec3> => {
  const skin = hslToRgb(p.skinHue, p.skinSat, p.skinLight);
  return {
    skin,
    bruise: [0.3, 0.24, 0.29],
    shirt: skin,
    pants: skin,
    shoe: [0.12, 0.1, 0.09],
    hair: [0.1, 0.08, 0.07],
    eye: [0.05, 0.04, 0.04],
    mouth: [0.22, 0.05, 0.06],
    gore: [0.32, 0.09, 0.06],
    bone: [0.85, 0.82, 0.72],
  };
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
  return { bones, features, palette: buildPalette(p) };
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
});

// ---- Pose, gait and hit pose ----

const PAW_BONES = LEGS.map((leg) => leg.paw);

export interface DogStance {
  readonly limp?: number;
  readonly headTilt?: number;
}

/** The rest stance: a low, uneven four-paw stand, head hanging. Regrounded against every bone so the
 * paws define the contact and nothing else dips below them. */
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
  return groundDogPose(realized, { root: [0, 0, 0], rotations });
};

const smoothstep = (value: number): number => value * value * (3 - 2 * value);

/** Sets root.y so the lowest voxel surface of the posed body sits on the ground (y = 0). Any pose whose
 * planted paws are the lowest points keeps them exactly on the ground; a swing paw that lifts does not. */
const groundDogPose = (realized: Realized, pose: Pose): Pose => {
  const probe: Pose = { root: [pose.root[0], 0, pose.root[2]], rotations: pose.rotations };
  const surfaces = posedVoxelSurfaceBoundsForBones(
    realized,
    probe,
    realized.body.bones.map((bone) => bone.id),
  );
  const lowest = Math.min(...surfaces.values());
  return { ...pose, root: [pose.root[0], -lowest, pose.root[2]] };
};

/** How far a paw lifts at the swing peak, in degrees of upper-leg swing and lower-leg fold. */
const FORWARD_SWING_DEG = 16;
const BACK_SWING_DEG = 12;
const FOLD_DEG = 22;

/** A staggering diagonal gait: the fore-left/hind-right pair reaches while fore-right/hind-left plants,
 * then they swap. `limp` shortens and droops the left side, so the walk lurches rather than trots. */
export const dogGaitPose = (realized: Realized, phase: number, speed: number, stance: DogStance = {}): Pose => {
  const limp = stance.limp ?? 0;
  const base = dogPose(realized, stance);
  if (speed <= 0 || !Number.isFinite(phase)) {
    return base;
  }
  const cycle = ((phase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const half = cycle < Math.PI ? 0 : 1;
  const progress = (cycle % Math.PI) / Math.PI;
  const reach = Math.sin(progress * Math.PI);
  const limpScale = Math.max(0, Math.min(1, limp));
  const rotations: Record<string, Mat3> = { ...base.rotations };
  const addRotation = (bone: string, delta: Mat3): void => {
    rotations[bone] = mulMM(rotations[bone] ?? IDENTITY_M, delta);
  };
  for (const leg of LEGS) {
    const swinging = (leg.side === 'L') === (half === 0);
    // Limp only on the left side: that diagonal lags and folds less.
    const sideScale = leg.side === 'L' ? 1 - 0.5 * limpScale : 1;
    if (swinging) {
      addRotation(leg.key, rotX(FORWARD_SWING_DEG * reach * sideScale));
      addRotation(leg.lower, rotX(-FOLD_DEG * reach * sideScale));
    } else {
      addRotation(leg.key, rotX(-BACK_SWING_DEG * reach * sideScale));
    }
  }
  // A side-to-side lurch and a head bob ride on top, so the body reads as drunk, not mechanical.
  const sway = Math.sin(cycle) * (0.02 + 0.03 * limpScale);
  addRotation('spine', rotZ(3 * Math.sin(cycle) * (1 + limpScale)));
  addRotation('neck', rotX(4 * reach));
  addRotation('head', rotX(5 * reach));
  return groundDogPose(realized, { root: [sway, base.root[1], 0], rotations });
};

/** A short brace/recoil layered over the current pose and re-grounded against the paw supports. */
export const dogHitPose = (realized: Realized, base: Pose, time: number, side = 0): Pose => {
  if (!(time > 0) || time >= HIT_FLINCH.duration) {
    return base;
  }
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
  return groundDogPose(realized, { ...base, rotations });
};

/** Exported for tests: the paw bones that bear the ground contact. */
export const dogPawBones: readonly string[] = PAW_BONES;
