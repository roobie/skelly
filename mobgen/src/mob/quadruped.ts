// The quadruped body plan: a dog-sized infected animal built standing on its four paws.
// Its own plan (not a humanoid variant): horizontal torso chain, dog legs (straight
// forelegs, zig-zag hind legs), a muzzle and jaw, and a tail. The rest pose is already
// standing on the ground, so paw soles are authored flat on y = 0; quadrupedPose.ts
// grounds every later pose against those paw supports.
//
// Limb segment ids keep the rig vocabulary core/generate.ts's
// LOOKUP-independent limb-thickness recommendation already understands
// (upperArm/forearm/thigh/shin), with a FL/FR/BL/BR side suffix for the four legs.

import type { Body, Bone, Feature, Material } from '../core/body.ts';
import { RIGHT, UP } from '../core/conventions.ts';
import { type BodyPlanDef, registerBodyPlan, sampleParams } from '../core/generate.ts';
import { add, cross, dot, length, lerp3, normalize, scale, sub, type Vec3 } from '../core/math.ts';
import type { Rng } from '../core/random.ts';
import type { Genome, Template, Wound } from '../core/template.ts';
import { hslToRgb, sampleWounds } from './humanoid.ts';

const toRad = (deg: number): number => (deg * Math.PI) / 180;
const SIDES = ['L', 'R'] as const;

/** The four legs, front pair from the chest, hind pair from the pelvis. */
export const QUADRUPED_LEGS = ['FL', 'FR', 'BL', 'BR'] as const;
export type QuadrupedLeg = (typeof QUADRUPED_LEGS)[number];

/** The three bones of each leg, proximal to distal. */
export const legBoneIds = (leg: QuadrupedLeg): readonly [string, string, string] =>
  leg[0] === 'F' ? [`upperArm.${leg}`, `forearm.${leg}`, `paw.${leg}`] : [`thigh.${leg}`, `shin.${leg}`, `paw.${leg}`];

/** Declared ground supports: the four flat paw soles. Every other bone must stay off the ground row
 * for the template's `grounded` rule to pass (core/rules.ts, `grounded`). */
export const QUADRUPED_SUPPORT_BONES: readonly string[] = QUADRUPED_LEGS.map((leg) => `paw.${leg}`);

/** A cut at one of these hides the bone and everything below it (see mob/dismember.ts,
 * severedBoneSet): each leg's three cut points, the head (taking the jaw) and the tail. */
export const QUADRUPED_SEVERABLE_PARTS = [
  'paw.FL',
  'forearm.FL',
  'upperArm.FL',
  'paw.FR',
  'forearm.FR',
  'upperArm.FR',
  'paw.BL',
  'shin.BL',
  'thigh.BL',
  'paw.BR',
  'shin.BR',
  'thigh.BR',
  'head',
  'tail',
] as const;

/** Bones a wound may sit on (see core/generate.ts, BodyPlanDef.woundBones). */
const QUADRUPED_WOUND_BONES = [
  'spine',
  'chest',
  'neck',
  'tail',
  'upperArm.FL',
  'upperArm.FR',
  'forearm.FL',
  'forearm.FR',
  'thigh.BL',
  'thigh.BR',
  'shin.BL',
  'shin.BR',
] as const;

/** Params sampled in this fixed order (see core/generate.ts's sampleParams). */
const QUADRUPED_PARAM_ORDER = [
  'height',
  'girth',
  'bodyLength',
  'headScale',
  'snoutLength',
  'earSize',
  'jawOpen',
  'tailLift',
  'skinHue',
  'skinSat',
  'skinLight',
  'furCover',
  'woundCount',
  'limp',
  'strideFactor',
  'lurch',
  'headLoll',
] as const;

type QuadrupedParams = Readonly<Record<(typeof QUADRUPED_PARAM_ORDER)[number], number>>;

// ---- Layout (fractions of the `height` param) ----
// Joint heights/lengths for a compact dog at withers `height`: the torso chain runs
// back-to-front along Z at back height, legs drop from their joints to flat paw soles
// on y = 0, and the neck rises forward to a lowered head. Torso Z coordinates scale
// with `bodyLength`; head sizes scale with `headScale`; flesh radii scale with `girth`.

interface LegLayout {
  /** Hip / shoulder pivot — the leg's root bone rotates here. */
  readonly root: Vec3;
  /** Knee (hind) / elbow (front). */
  readonly mid: Vec3;
  /** Hock (hind) / wrist (front). */
  readonly ankle: Vec3;
  /** Toe tip; the paw sole box spans heel (behind `ankle`) to just past this. */
  readonly toe: Vec3;
}

interface DogLayout {
  readonly height: number;
  readonly pelvis: { readonly head: Vec3; readonly tail: Vec3 };
  readonly pelvisCenter: Vec3;
  readonly spine: { readonly head: Vec3; readonly tail: Vec3 };
  readonly chest: { readonly head: Vec3; readonly tail: Vec3 };
  readonly chestCenter: Vec3;
  readonly neck: { readonly head: Vec3; readonly tail: Vec3 };
  readonly head: { readonly head: Vec3; readonly tail: Vec3 };
  readonly headCenter: Vec3;
  readonly muzzleTip: Vec3;
  readonly jaw: { readonly head: Vec3; readonly tail: Vec3 };
  readonly muzzleBottomY: number;
  readonly tail: { readonly head: Vec3; readonly tail: Vec3 };
  readonly leg: Readonly<Record<QuadrupedLeg, LegLayout>>;
}

const sideSign = (leg: QuadrupedLeg): number => (leg.endsWith('L') ? -1 : 1);

const dogLayout = (p: QuadrupedParams): DogLayout => {
  const h = p.height;
  const L = p.bodyLength;
  const backY = 0.76 * h;
  const pelvisHead: Vec3 = [0, backY, 0.56 * h * L];
  const pelvisTail: Vec3 = [0, backY, 0.18 * h * L];
  const spineHead = pelvisTail;
  const spineTail: Vec3 = [0, backY, -0.1 * h * L];
  const chestHead = spineTail;
  const chestTail: Vec3 = [0, backY, -0.52 * h * L];
  const neckHead: Vec3 = [0, 0.82 * h, -0.54 * h * L];
  // The head carriage is deliberately low: a sick animal holds its head near the back line.
  const neckTail: Vec3 = [0, 0.99 * h, -0.86 * h];
  const headTail: Vec3 = [0, 1.05 * h, -1.12 * h];
  const headCenter: Vec3 = [0, 1.03 * h, -1.02 * h];
  const muzzleTip: Vec3 = [0, 0.92 * h, -1.14 * h - 0.32 * h * p.snoutLength];
  const jawHead: Vec3 = [0, 0.95 * h, -1.04 * h];
  const jawTail: Vec3 = [0, 0.865 * h, -1.02 * h - 0.3 * h * p.snoutLength];
  // tailLift carries the tail tip from a limp horizontal drag to a raised arc.
  const tailHead: Vec3 = [0, 0.8 * h, 0.55 * h * L];
  const tailTail: Vec3 = [0, (0.74 + 0.4 * p.tailLift) * h, 0.95 * h * L];
  const leg = (legId: QuadrupedLeg): LegLayout => {
    const s = sideSign(legId);
    if (legId[0] === 'F') {
      return {
        root: [s * 0.25 * h, 0.62 * h, -0.42 * h * L],
        mid: [s * 0.27 * h, 0.36 * h, -0.33 * h * L],
        ankle: [s * 0.28 * h, 0.13 * h, -0.4 * h * L],
        toe: [s * 0.28 * h, 0.02 * h, -0.58 * h * L],
      };
    }
    return {
      root: [s * 0.26 * h, 0.72 * h, 0.3 * h * L],
      mid: [s * 0.28 * h, 0.45 * h, 0.1 * h * L],
      ankle: [s * 0.28 * h, 0.19 * h, 0.38 * h * L],
      toe: [s * 0.28 * h, 0.02 * h, 0.2 * h * L],
    };
  };
  return {
    height: h,
    pelvis: { head: pelvisHead, tail: pelvisTail },
    pelvisCenter: lerp3(pelvisHead, pelvisTail, 0.5),
    spine: { head: spineHead, tail: spineTail },
    chest: { head: chestHead, tail: chestTail },
    chestCenter: lerp3(chestHead, chestTail, 0.5),
    neck: { head: neckHead, tail: neckTail },
    head: { head: neckTail, tail: headTail },
    headCenter,
    muzzleTip,
    jaw: { head: jawHead, tail: jawTail },
    muzzleBottomY: 0.895 * h,
    tail: { head: tailHead, tail: tailTail },
    leg: {
      FL: leg('FL'),
      FR: leg('FR'),
      BL: leg('BL'),
      BR: leg('BR'),
    },
  };
};

// ---- Bones ----

const buildBones = (layout: DogLayout): Body['bones'] => {
  const bones: Body['bones'][number][] = [
    { id: 'pelvis', parent: null, head: layout.pelvis.head, tail: layout.pelvis.tail },
    { id: 'spine', parent: 'pelvis', head: layout.spine.head, tail: layout.spine.tail },
    { id: 'chest', parent: 'spine', head: layout.chest.head, tail: layout.chest.tail },
    { id: 'neck', parent: 'chest', head: layout.neck.head, tail: layout.neck.tail },
    { id: 'head', parent: 'neck', head: layout.head.head, tail: layout.head.tail },
    { id: 'jaw', parent: 'head', head: layout.jaw.head, tail: layout.jaw.tail },
    { id: 'tail', parent: 'pelvis', head: layout.tail.head, tail: layout.tail.tail },
  ];
  for (const leg of QUADRUPED_LEGS) {
    const [upper, lower, paw] = legBoneIds(leg);
    const joints = layout.leg[leg];
    const upperParent = leg[0] === 'F' ? 'chest' : 'pelvis';
    bones.push(
      { id: upper, parent: upperParent, head: joints.root, tail: joints.mid },
      { id: lower, parent: upper, head: joints.mid, tail: joints.ankle },
      { id: paw, parent: lower, head: joints.ankle, tail: joints.toe },
    );
  }
  return bones;
};

// ---- Flesh ----

const mid = (a: Vec3, b: Vec3): Vec3 => scale(add(a, b), 0.5);

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

const roundJoint = (childBone: string, center: Vec3, radius: number): Feature => ({
  bone: childBone,
  op: 'add',
  shape: { kind: 'ellipsoid', center, radii: [radius, radius, radius] },
  material: 'skin',
  blend: 0.035,
});

/** The paw's sole box: bottom exactly on y = 0, top reaching the ankle joint (plus a little overlap
 * for the round-joint sphere to blend into), heel behind the ankle and the toe just past its tip. */
const pawFeature = (bone: string, joints: LegLayout, h: number, g: number): Feature => {
  const front = bone.endsWith('.FL') || bone.endsWith('.FR');
  // Heels sit behind the ankle; both front and hind toes point forward (-Z). Hind paws carry the
  // long hock-to-toe span as their own vertical reach, front paws only wrist-to-toe.
  const heelZ = joints.ankle[2] + (front ? 0.05 : 0.03) * h;
  const toeZ = joints.toe[2] - 0.02 * h;
  const height = joints.ankle[1] + 0.02 * h;
  const center: Vec3 = [joints.ankle[0], height / 2, (heelZ + toeZ) / 2];
  const half: Vec3 = [0.085 * h * g, height / 2, Math.abs(heelZ - toeZ) / 2];
  return { bone, op: 'add', shape: { kind: 'box', center, half, round: 0.016 * h * g }, material: 'skin' };
};

const buildFlesh = (layout: DogLayout, p: QuadrupedParams): Feature[] => {
  const h = layout.height;
  // Radii author an adult dog's proportions directly (deep chest, thick neck, solid limbs);
  // `girth` then fattens or thins the whole animal.
  const g = p.girth;
  const hs = p.headScale;
  const features: Feature[] = [
    ellipsoidFeature('pelvis', layout.pelvisCenter, [0.27 * h * g, 0.25 * h * g, 0.32 * h * p.bodyLength * g]),
    capsuleFeature('spine', layout.spine.head, layout.spine.tail, [0.23 * h * g, 0.22 * h * g]),
    ellipsoidFeature('chest', layout.chestCenter, [0.3 * h * g, 0.3 * h * g, 0.34 * h * p.bodyLength * g]),
    capsuleFeature('neck', layout.neck.head, layout.neck.tail, [0.16 * h * g, 0.13 * h * g]),
    // Skull plus a separate muzzle capsule: the muzzle (not the skull) sets the dog's read at distance.
    ellipsoidFeature('head', layout.headCenter, [0.17 * h * hs, 0.155 * h * hs, 0.19 * h * hs]),
    capsuleFeature('head', [0, 0.98 * h, -1.12 * h], layout.muzzleTip, [0.095 * h * hs, 0.06 * h * hs]),
    capsuleFeature('jaw', layout.jaw.head, layout.jaw.tail, [0.08 * h * hs, 0.05 * h * hs]),
    capsuleFeature('tail', layout.tail.head, layout.tail.tail, [0.075 * h * g, 0.035 * h * g]),
    roundJoint('tail', layout.tail.head, 0.075 * h * g),
    roundJoint('neck', layout.neck.head, 0.15 * h * g),
    roundJoint('head', layout.head.head, 0.13 * h * g),
    roundJoint('jaw', layout.jaw.head, 0.075 * h * hs),
  ];

  // Ears: earSize 0 means none (see sampleQuadruped: it is zero-biased). Generous blend: a thin ear
  // is smaller than a voxel at coarse sizes and needs smin help to stay merged with the skull.
  if (p.earSize > 0.01) {
    for (const side of SIDES) {
      features.push({
        bone: 'head',
        op: 'add',
        shape: {
          kind: 'ellipsoid',
          center: [(side === 'L' ? -1 : 1) * 0.125 * h * hs, 1.22 * h, -0.92 * h],
          radii: [0.05 * h * hs * p.earSize, 0.12 * h * hs * p.earSize, 0.04 * h * hs * p.earSize],
        },
        material: 'skin',
        blend: 0.05,
      });
    }
  }

  for (const leg of QUADRUPED_LEGS) {
    const [upper, lower, paw] = legBoneIds(leg);
    const joints = layout.leg[leg];
    const front = leg[0] === 'F';
    const raUpper = (front ? 0.1 : 0.11) * h * g;
    const rbUpper = (front ? 0.072 : 0.08) * h * g;
    const raLower = 0.075 * h * g;
    const rbLower = 0.055 * h * g;
    // A chest/pelvis-owned sphere across the pivot gap, so the limb's own round joint below never
    // depends on a single repaired marrow voxel to reach the torso (see mob/humanoid.ts, the same
    // bridge at the humanoid shoulder).
    const torso = front ? layout.chestCenter : layout.pelvisCenter;
    const torsoBone = front ? 'chest' : 'pelvis';
    const bridge = mid(torso, joints.root);
    const bridgeR = Math.max(0.03 * h * g, length(sub(joints.root, bridge)) - raUpper + 0.03 * h * g);
    features.push(ellipsoidFeature(torsoBone, bridge, [bridgeR, bridgeR, bridgeR]));
    features.push(
      capsuleFeature(upper, joints.root, joints.mid, [raUpper, rbUpper]),
      capsuleFeature(lower, joints.mid, joints.ankle, [raLower, rbLower]),
      // Flat-bottomed sole from heel to toe (see mob/humanoid.ts, footFeature): a rounded foot would
      // only touch the ground at one point and the `grounded`/`balance` rules need a sole on y = 0.
      pawFeature(paw, joints, h, g),
      roundJoint(upper, joints.root, raUpper),
      roundJoint(lower, joints.mid, raLower),
      roundJoint(paw, joints.ankle, 0.06 * h * g),
    );
  }
  return features;
};

// ---- Paint: fur, eyes, mouth, claws, mottling ----

const buildPaint = (layout: DogLayout, p: QuadrupedParams): Feature[] => {
  const h = layout.height;
  const hs = p.headScale;
  const features: Feature[] = [];

  // Patchy fur over the saddle: noise-gated so the sickly skin reads through where it thins. One
  // extra material only (see PROJECT.md: extra colour variation must justify its mesh fragmentation).
  if (p.furCover > 0.02) {
    features.push({
      bone: 'chest',
      op: 'paint',
      shape: {
        kind: 'capsule',
        a: [0, 0.86 * h, 0.5 * h * p.bodyLength],
        b: [0, 0.9 * h, -0.45 * h * p.bodyLength],
        ra: 0.24 * h,
        rb: 0.22 * h,
      },
      material: 'hair',
      onto: ['skin'],
      noise: { scale: 0.08, threshold: 0.1 + 0.5 * p.furCover },
    });
  }

  // Eyes: a shallow socket carve on the front corners of the skull with the paint centred just
  // forward of the carve, so the paint covers whatever wall the carve exposes (see mob/humanoid.ts's
  // face notes on paint/carve reach).
  for (const side of SIDES) {
    const x = (side === 'L' ? -1 : 1) * 0.105 * h * hs;
    const carveR = 0.055 * h * hs;
    features.push({
      bone: 'head',
      op: 'carve',
      shape: { kind: 'ellipsoid', center: [x, 1.06 * h, -1.15 * h], radii: [carveR, carveR, carveR] },
      material: 'skin', // carve ignores material; Feature just always requires one
    });
    const paintR = 0.068 * h * hs;
    features.push({
      bone: 'head',
      op: 'paint',
      shape: { kind: 'ellipsoid', center: [x, 1.055 * h, -1.185 * h], radii: [paintR, paintR, paintR] },
      material: 'eye',
    });
  }

  // Mouth: a dark band along the muzzle/jaw seam; jawOpen carves down from its fixed top edge into
  // the jaw (an open mouth drops the lower jaw, never grows up into the muzzle — same reasoning as
  // mob/humanoid.ts's open-mouth carve).
  const seamY = layout.muzzleBottomY;
  const seamZ = -1.13 * h - 0.16 * h * p.snoutLength;
  const seamHalf: Vec3 = [0.085 * h * hs, 0.024 * h, 0.17 * h * p.snoutLength];
  features.push({
    bone: 'jaw',
    op: 'paint',
    shape: { kind: 'box', center: [0, seamY, seamZ], half: seamHalf, round: 0.015 * h },
    material: 'mouth',
    onto: ['skin'],
  });
  if (p.jawOpen > 0.02) {
    const top = seamY + seamHalf[1];
    const bottom = top - (0.02 * h + 0.08 * h * p.jawOpen);
    const openHalf: Vec3 = [seamHalf[0] * 0.85, (top - bottom) / 2, seamHalf[2] + 0.02 * h * p.jawOpen];
    const openCenter: Vec3 = [0, (top + bottom) / 2, seamZ];
    features.push({
      bone: 'jaw',
      op: 'carve',
      shape: { kind: 'box', center: openCenter, half: openHalf, round: 0.012 * h },
      material: 'skin', // carve ignores material; Feature just always requires one
    });
    features.push({
      bone: 'jaw',
      op: 'paint',
      shape: {
        kind: 'box',
        center: [0, openCenter[1] - 0.15 * openHalf[1], seamZ],
        half: [openHalf[0] + 0.008 * h, openHalf[1] * 0.9, openHalf[2] + 0.008 * h],
        round: 0.012 * h,
      },
      material: 'mouth',
      onto: ['skin'],
    });
  }

  // Dark claw tips: a small paint per paw, so the feet read at game distance.
  for (const leg of QUADRUPED_LEGS) {
    const [paw] = legBoneIds(leg);
    const { toe } = layout.leg[leg];
    features.push({
      bone: paw,
      op: 'paint',
      shape: {
        kind: 'ellipsoid',
        center: [toe[0], 0.04 * h, toe[2] - 0.01 * h],
        radii: [0.07 * h, 0.05 * h, 0.06 * h],
      },
      material: 'shoe',
    });
  }

  // Bruises: low-probability mottling over skin anywhere on the body.
  features.push({
    bone: 'chest',
    op: 'paint',
    shape: { kind: 'box', center: [0, 0.6 * h, 0], half: [0.42 * h, 0.5 * h, 0.9 * h * p.bodyLength], round: 0 },
    material: 'bruise',
    onto: ['skin'],
    noise: { scale: 0.09, threshold: 0.09 },
  });

  return features;
};

// ---- Wounds ----

const boneFleshRadius = (boneId: string, p: QuadrupedParams): number => {
  const h = p.height;
  const g = p.girth;
  const base = boneId.split('.')[0]!;
  const table: Record<string, number> = {
    spine: 0.22 * h * g,
    chest: 0.29 * h * g,
    neck: 0.145 * h * g,
    tail: 0.06 * h * g,
    upperArm: 0.086 * h * g,
    forearm: 0.065 * h * g,
    thigh: 0.095 * h * g,
    shin: 0.065 * h * g,
    paw: 0.07 * h * g,
  };
  return table[base] ?? 0.07 * h * g;
};

const buildWounds = (bones: readonly Bone[], p: QuadrupedParams, wounds: readonly Wound[]): Feature[] => {
  const features: Feature[] = [];
  for (const w of wounds) {
    const bone = bones.find((candidate) => candidate.id === w.bone);
    if (!bone) {
      throw new Error(`quadruped: unknown wound bone "${w.bone}"`);
    }
    const axis = length(sub(bone.tail, bone.head)) > 1e-9 ? normalize(sub(bone.tail, bone.head)) : UP;
    const reference = Math.abs(dot(axis, UP)) > 0.9 ? RIGHT : UP;
    const perp0 = normalize(cross(axis, reference));
    const perp1 = cross(axis, perp0);
    const angle = toRad(w.angle);
    const outward = add(scale(perp0, Math.cos(angle)), scale(perp1, Math.sin(angle)));
    const center = add(bone.head, scale(sub(bone.tail, bone.head), w.t));
    const surface = add(center, scale(outward, boneFleshRadius(w.bone, p)));
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
      onto: ['skin', 'bruise', 'hair'],
    });
  }
  return features;
};

// ---- Colour ----

/** Sickly flesh carries the sampled hue; the rest are fixed so the dog stays readable as one
 * fleshy animal rather than a palette exercise (see PROJECT.md, the kept-look boundary). */
const buildPalette = (p: QuadrupedParams): Record<Material, Vec3> => ({
  skin: hslToRgb(p.skinHue, p.skinSat, p.skinLight),
  bruise: [0.34, 0.27, 0.33],
  // No clothing on this plan; the palette type is total, so inert materials get a muted stand-in.
  shirt: [0.3, 0.28, 0.26],
  pants: [0.25, 0.24, 0.22],
  shoe: [0.12, 0.1, 0.09],
  hair: [0.22, 0.16, 0.12],
  eye: [0.06, 0.06, 0.06],
  mouth: [0.24, 0.05, 0.06],
  gore: [0.32, 0.09, 0.06],
  bone: [0.85, 0.82, 0.72],
});

// ---- Build & sample ----

const buildQuadruped = (genome: Genome): Body => {
  const p = genome.params as QuadrupedParams;
  const layout = dogLayout(p);
  const bones = buildBones(layout);
  return {
    bones,
    features: [...buildFlesh(layout, p), ...buildPaint(layout, p), ...buildWounds(bones, p, genome.wounds)],
    palette: buildPalette(p),
  };
};

const sampleQuadruped: BodyPlanDef['sample'] = (rng: Rng, template: Template) => {
  const params = sampleParams(rng, template.params, QUADRUPED_PARAM_ORDER);
  const wounds = sampleWounds(rng, params.woundCount!, QUADRUPED_WOUND_BONES);
  return { params, wounds };
};

registerBodyPlan('quadruped', {
  sample: sampleQuadruped,
  build: (genome) => buildQuadruped(genome),
  paramOrder: QUADRUPED_PARAM_ORDER,
  woundBones: QUADRUPED_WOUND_BONES,
});
