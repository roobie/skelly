// The leaper body plan: an ambush predator built around folded hind springs. The rest pose is its
// everyday coiled crouch, so validation judges the body it spends its life in; every other stance is a
// clip on this rig (see motion.ts). Values a look change would tune live in leaper.jsonnet; proportions
// and joint ranges that the supports, the coil, the clips and the region contract depend on live here.

import type { Body, BodyRegion, Bone, Feature, Material } from '../../core/body.ts';
import { registerBodyPlan, sampleParams } from '../../core/generate.ts';
import {
  add,
  clamp,
  cross,
  dot,
  length,
  lerp3,
  mulMV,
  normalize,
  rotX,
  scale,
  sub,
  type Vec3,
} from '../../core/math.ts';
import type { Budgets } from '../../core/rules.ts';
import type { Shape } from '../../core/sdf.ts';
import { type Genome, registerTemplate, type Template } from '../../core/template.ts';
import { resolveMaterials } from '../materials.ts';
import content from './leaper.json' with { type: 'json' };

export const LEAPER_TEMPLATE = content as unknown as Template;

const PARAM_ORDER = [
  'scale',
  'haunch',
  'reach',
  'splay',
  'skull',
  'hump',
  'skinHue',
  'skinSat',
  'skinLight',
  'dorsalHue',
  'dorsalLight',
] as const;
type Params = Readonly<Record<(typeof PARAM_ORDER)[number], number>>;

const SIDES = [
  ['L', -1],
  ['R', 1],
] as const;
type Side = (typeof SIDES)[number][0];

/** Hit regions. Forelimbs grip and strike, so they are the arms; hind limbs carry the pounce, so they
 * are the legs, and losing one is what cripples the leaper. The head and jaw are one aim point. */
const LEAPER_REGION_BONES: Readonly<Record<BodyRegion, readonly string[]>> = {
  head: ['head', 'jaw'],
  torso: ['pelvis', 'spine', 'chest'],
  leftArm: ['upperArm.L', 'forearm.L', 'hand.L'],
  rightArm: ['upperArm.R', 'forearm.R', 'hand.R'],
  leftLeg: ['thigh.L', 'shin.L', 'foot.L'],
  rightLeg: ['thigh.R', 'shin.R', 'foot.R'],
};

type Range = readonly [number, number];
/** Joint ranges in degrees, as [flex, abduct, twist]; positive flex is the joint's working direction (see
 * jointFrames). The waist, chest and neckless head stay narrow: one bone owns each voxel, so a wide bend
 * there opens a crack through the trunk (seams.ts, jointCracks), and rearing pivots at the pelvis root
 * and the hips instead. */
const JOINT_LIMITS: Readonly<Record<string, readonly [Range, Range, Range]>> = {
  pelvis: [
    [-30, 80],
    [-15, 15],
    [-25, 25],
  ],
  spine: [
    [-8, 8],
    [-6, 6],
    [-8, 8],
  ],
  chest: [
    [-8, 8],
    [-6, 6],
    [-8, 8],
  ],
  head: [
    [-12, 12],
    [-12, 12],
    [-10, 10],
  ],
  jaw: [
    [0, 40],
    [0, 0],
    [0, 0],
  ],
  upperArm: [
    [-60, 130],
    [-35, 45],
    [-35, 35],
  ],
  forearm: [
    [-70, 65],
    [-10, 10],
    [-20, 20],
  ],
  hand: [
    [-45, 70],
    [-15, 15],
    [-20, 20],
  ],
  thigh: [
    [-45, 170],
    [-25, 30],
    [-25, 25],
  ],
  shin: [
    [-25, 150],
    [-5, 5],
    [-10, 10],
  ],
  foot: [
    [-40, 90],
    [-10, 10],
    [-10, 10],
  ],
};

/** A joint frame whose x is exactly the flex axis and whose y follows the bone as closely as stays square
 * to it (see core/joints.ts, jointRotation). */
const frameAbout = (bone: Bone, flexAxis: Vec3): NonNullable<Bone['frame']> => {
  const x = normalize(flexAxis);
  const along = sub(bone.tail, bone.head);
  const y = normalize(sub(along, scale(x, dot(along, x))));
  return { x, y, z: cross(x, y) };
};

/** Gives every bone its frame and range. Every joint flexes about the body's right axis, so the coil and
 * the jump stay in the line of travel however wide the limbs splay. Positive flex is each joint's working
 * direction: a trunk or shoulder bone pitches its far end up and back (a positive pelvis rears); the knee,
 * foot and elbow open, and the thigh swings down and back, the launch's directions; the jaw and wrist
 * open the mouth and curl the claws. Mirrored sides share flex angles; twist and abduct mirror. */
const REVERSED_FLEX = new Set(['jaw', 'hand', 'forearm', 'shin', 'foot']);
const jointFrames = (bones: readonly Bone[]): Bone[] =>
  bones.map((bone) => {
    const name = bone.id.split('.')[0]!;
    const limits = JOINT_LIMITS[name];
    if (!limits) {
      throw new Error(`leaper bone "${bone.id}" has no joint range`);
    }
    const [flex, abduct, twist] = limits;
    const axis: Vec3 = REVERSED_FLEX.has(name) ? [-1, 0, 0] : [1, 0, 0];
    return { ...bone, frame: frameAbout(bone, axis), limits: { flex, abduct, twist } };
  });

/** Segments whose flesh thickness decides the validation profile; hands and feet carry thin claws and toes. */
const LIMB_BONES = SIDES.flatMap(([s]) => [`upperArm.${s}`, `forearm.${s}`, `thigh.${s}`, `shin.${s}`]);

/** The middle joint of a two-segment limb from `start` to `end`, bent toward `pole`. */
const bentJoint = (start: Vec3, end: Vec3, [upper, lower]: readonly [number, number], pole: Vec3): Vec3 => {
  const span = clamp(length(sub(end, start)), 1e-6, upper + lower - 1e-4);
  const axis = normalize(sub(end, start));
  const bend = normalize(sub(pole, scale(axis, dot(pole, axis))));
  const along = (upper * upper - lower * lower + span * span) / (2 * span);
  return add(add(start, scale(axis, along)), scale(bend, Math.sqrt(Math.max(0, upper * upper - along * along))));
};

interface Rig {
  readonly bones: Bone[];
  readonly features: Feature[];
  /** The grid this build is for. */
  readonly cell: number;
}

const capsule = (a: Vec3, b: Vec3, ra: number, rb: number): Shape => ({ kind: 'capsule', a, b, ra, rb });
interface Look {
  readonly material?: Material;
  readonly blend?: number;
}
const flesh = (rig: Rig, bone: string, shape: Shape, { material = 'skin', blend }: Look = {}): void => {
  rig.features.push({ bone, op: 'add', shape, material, ...(blend === undefined ? {} : { blend }) });
};
const thinnest = (shape: Shape): number =>
  shape.kind === 'capsule'
    ? Math.min(shape.ra, shape.rb)
    : Math.min(...(shape.kind === 'box' ? shape.half : shape.radii));
/** Spurs, claws, teeth and eyes. One less than half a cell across cannot be sampled, yet as the nearest
 * feature it would still recolour the cell around its bone and split that bone's merged faces, so a
 * coarse grid leaves it out. */
const accent = (rig: Rig, bone: string, shape: Shape, look: Look): void => {
  if (4 * thinnest(shape) >= rig.cell) {
    flesh(rig, bone, shape, look);
  }
};
const ellipsoid = (center: Vec3, radii: Vec3): Shape => ({ kind: 'ellipsoid', center, radii });
/** Bony growths blend in a little so they read as part of the flesh; tips and eyes stay crisp. */
const SPUR: Look = { material: 'claw', blend: 0.01 };
const TIP: Look = { material: 'claw', blend: 0.005 };
const EYE: Look = { material: 'eye', blend: 0.005 };
/** Limb flesh is its own material, coloured like the skin, so the trunk's countershading cannot reach it:
 * limbs swing through every stance, and a band baked for the crouch would land on the front of a leg. */
const LIMB: Look = { material: 'limb' };

const buildLeaper = (genome: Genome, template: Template): Body => {
  const p = genome.params as Params;
  const s = p.scale;
  const at = (x: number, y: number, z: number): Vec3 => [x * s, y * s, z * s];
  const r = (value: number): number => value * s;
  const rig: Rig = { bones: [], features: [], cell: genome.voxelSize };

  // Torso core, pitched up from low haunches like a sitting frog: rump, a starved wasp waist and a
  // shoulder hump. Never severs.
  const hip = at(0, 0.36, 0.24);
  const loin = at(0, 0.48, 0.06);
  const withers = at(0, 0.66, -0.14);
  const nape = at(0, 0.7, -0.3);
  rig.bones.push(
    { id: 'pelvis', parent: null, head: hip, tail: loin, disposition: 'fixed' },
    { id: 'spine', parent: 'pelvis', head: loin, tail: withers, disposition: 'fixed' },
    { id: 'chest', parent: 'spine', head: withers, tail: nape, disposition: 'fixed' },
  );
  flesh(rig, 'pelvis', ellipsoid(at(0, 0.4, 0.2), [r(0.18), r(0.12), r(0.15)]));
  flesh(rig, 'spine', capsule(at(0, 0.47, 0.06), at(0, 0.6, -0.1), r(0.095), r(0.12)));
  accent(rig, 'spine', ellipsoid(at(0, 0.6, 0.04), [r(0.03), r(0.045), r(0.04)]), SPUR);
  flesh(rig, 'chest', ellipsoid(at(0, 0.7, -0.18), [r(0.22), r(0.15 * p.hump), r(0.17)]));
  flesh(rig, 'chest', ellipsoid(at(0, 0.78, -0.1), [r(0.16), r(0.1 * p.hump), r(0.13)]), { blend: 0.06 });
  accent(rig, 'chest', ellipsoid(at(0, 0.79 + 0.1 * p.hump, -0.1), [r(0.035), r(0.05), r(0.045)]), SPUR);
  accent(rig, 'chest', ellipsoid(at(0, 0.73 + 0.08 * p.hump, 0.02), [r(0.03), r(0.045), r(0.04)]), SPUR);
  for (const [, x] of SIDES) {
    flesh(rig, 'chest', ellipsoid(at(0.2 * x, 0.64, -0.2), [r(0.09), r(0.09), r(0.09)]));
  }

  // Head slung below the hump with no neck; the jaw hinges far back so the whole lower face drops.
  const k = p.skull;
  rig.bones.push(
    { id: 'head', parent: 'chest', head: nape, tail: at(0, 0.58, -0.58), disposition: 'sever' },
    { id: 'jaw', parent: 'head', head: at(0, 0.62, -0.36), tail: at(0, 0.48, -0.58) },
  );
  flesh(rig, 'head', ellipsoid(at(0, 0.62, -0.46), [r(0.13 * k), r(0.075), r(0.15)]));
  flesh(rig, 'head', ellipsoid(at(0, 0.67, -0.52), [r(0.14 * k), r(0.04), r(0.06)]));
  for (const [, x] of SIDES) {
    accent(rig, 'head', ellipsoid(at(0.075 * k * x, 0.68, -0.58), [r(0.032), r(0.032), r(0.032)]), EYE);
    accent(rig, 'head', ellipsoid(at(0.115 * k * x, 0.69, -0.49), [r(0.024), r(0.024), r(0.024)]), EYE);
  }
  flesh(rig, 'jaw', ellipsoid(at(0, 0.53, -0.48), [r(0.14 * k), r(0.05), r(0.14)]));
  for (const x of [-0.07, 0, 0.07]) {
    accent(rig, 'jaw', capsule(at(x * k, 0.555, -0.59), at(x * k, 0.605, -0.6), r(0.016), r(0.012)), TIP);
  }
  rig.features.push({
    bone: 'jaw',
    op: 'paint',
    shape: { kind: 'box', center: at(0, 0.57, -0.57), half: [r(0.12 * k), r(0.014), r(0.06)], round: 0 },
    material: 'maw',
    onto: ['skin'],
  });

  for (const [side, x] of SIDES) {
    buildForelimb(rig, side, x, { at, r, p });
    buildHindlimb(rig, side, x, { at, r, p });
  }

  // Countershading: a band along the pitched back reads dark, belly and limb undersides pale. A grid too
  // coarse to draw the band two cells thick would only speckle it, splitting every face it touches.
  const back = sub(nape, hip);
  const pitch = (Math.atan2(back[1], -back[2]) * 180) / Math.PI;
  const band = r(0.13);
  if (band >= rig.cell) {
    rig.features.push({
      bone: 'chest',
      op: 'paint',
      shape: {
        kind: 'box',
        center: add(lerp3(hip, nape, 0.5), scale(mulMV(rotX(pitch), [0, 1, 0]), r(0.17))),
        half: [r(0.2), band, r(0.5)],
        round: 0,
        rot: rotX(pitch),
      },
      material: 'dorsal',
      onto: ['skin'],
    });
  }
  return {
    bones: jointFrames(rig.bones),
    features: rig.features,
    materials: resolveMaterials(template, genome.params),
  };
};

interface Limb {
  readonly at: (x: number, y: number, z: number) => Vec3;
  readonly r: (value: number) => number;
  readonly p: Params;
}

/** Long forelimbs planted ahead as props, elbows swept out and back, the hands well forward of the
 * shoulders: the reach the melee strikes with, kept inside the knee points from the front. */
const buildForelimb = (rig: Rig, side: Side, x: number, { at, r, p }: Limb): void => {
  const limb = (bone: string, shape: Shape): void => flesh(rig, bone, shape, LIMB);
  const shoulder = at(0.22 * x, 0.64, -0.2);
  const wrist = at(0.28 * p.splay * x, 0.13, -0.62 - 0.25 * (p.reach - 1));
  const elbow = bentJoint(shoulder, wrist, [r(0.38 * p.reach), r(0.4 * p.reach)], [0.6 * x, 0.2, 0.8]);
  const tip = add(wrist, at(0, -0.11, -0.16));
  rig.bones.push(
    { id: `upperArm.${side}`, parent: 'chest', head: shoulder, tail: elbow, disposition: 'sever' },
    { id: `forearm.${side}`, parent: `upperArm.${side}`, head: elbow, tail: wrist },
    { id: `hand.${side}`, parent: `forearm.${side}`, head: wrist, tail: tip },
  );
  limb(`upperArm.${side}`, ellipsoid(shoulder, [r(0.08), r(0.08), r(0.08)]));
  limb(`upperArm.${side}`, capsule(shoulder, elbow, r(0.07), r(0.05)));
  limb(`forearm.${side}`, capsule(elbow, wrist, r(0.05), r(0.04)));
  accent(rig, `forearm.${side}`, ellipsoid(add(elbow, at(0, 0.02, 0.07)), [r(0.036), r(0.036), r(0.07)]), SPUR);
  const palm = lerp3(wrist, tip, 0.3);
  limb(`hand.${side}`, ellipsoid(palm, [r(0.06), r(0.04), r(0.06)]));
  // A knuckle pad under the claw roots keeps every claw tip joined to the hand where it meets the ground.
  const pad = lerp3(palm, tip, 0.65);
  limb(`hand.${side}`, ellipsoid([pad[0], r(0.032), pad[2]], [r(0.065), r(0.026), r(0.06)]));
  for (const spread of [-0.05, 0, 0.05]) {
    accent(
      rig,
      `hand.${side}`,
      capsule(add(palm, at(spread * 0.6, -0.005, -0.03)), add(tip, at(spread, 0, 0)), r(0.026), r(0.018)),
      SPUR,
    );
  }
};

/** Hind springs cocked like a grasshopper's: thighs swung up past where any hip could extend, knees high
 * above the rump, shins folded down and back to a rear hock, and a long foot sweeping forward under the
 * hip. The folded peak is the coil and the silhouette's signature from every side.
 * The foot is one bone from hock to ball with the toes as its flesh: at far LOD every bone costs a closed
 * block of triangles, and the hock alone carries the launch lever. */
const buildHindlimb = (rig: Rig, side: Side, x: number, { at, r, p }: Limb): void => {
  const limb = (bone: string, shape: Shape, blend?: number): void =>
    flesh(rig, bone, shape, blend === undefined ? LIMB : { ...LIMB, blend });
  const hip = at(0.16 * x, 0.36, 0.24);
  const knee = at(0.38 * p.splay * x, 0.88, 0.38);
  const hock = at(0.42 * x, 0.32, 0.46);
  const ball = at(0.35 * x, 0.06, 0.14);
  const tip = at(0.36 * x, 0.025, -0.08);
  rig.bones.push(
    { id: `thigh.${side}`, parent: 'pelvis', head: hip, tail: knee, disposition: 'sever' },
    { id: `shin.${side}`, parent: `thigh.${side}`, head: knee, tail: hock },
    { id: `foot.${side}`, parent: `shin.${side}`, head: hock, tail: ball },
  );
  const h = p.haunch;
  limb(`thigh.${side}`, capsule(hip, knee, r(0.13 * h), r(0.065)));
  limb(`thigh.${side}`, ellipsoid(lerp3(hip, knee, 0.28), [r(0.12 * h), r(0.13 * h), r(0.13 * h)]), 0.05);
  limb(`shin.${side}`, ellipsoid(knee, [r(0.065), r(0.065), r(0.065)]));
  // A bony cap makes the knee read as the sharp apex of the spring, not another hump.
  accent(rig, `shin.${side}`, ellipsoid(add(knee, at(0.01 * x, 0.05, 0.03)), [r(0.04), r(0.06), r(0.045)]), SPUR);
  limb(`shin.${side}`, capsule(knee, hock, r(0.07), r(0.045)));
  limb(`foot.${side}`, capsule(hock, ball, r(0.045), r(0.035)));
  accent(rig, `foot.${side}`, ellipsoid(add(hock, at(0, 0.03, 0.07)), [r(0.036), r(0.05), r(0.07)]), SPUR);
  for (const spread of [-0.05, 0, 0.05]) {
    limb(`foot.${side}`, capsule(ball, add(tip, at(spread, 0, 0)), r(0.035), r(0.02)));
    accent(rig, `foot.${side}`, ellipsoid(add(tip, at(spread, 0.005, -0.02)), [r(0.02), r(0.02), r(0.03)]), TIP);
  }
};

/** Budgets are authored at the template voxel size; another resolution keeps the same body, so counts
 * scale with cell volume and triangles with cell area. */
const budgetsFor = (genome: Genome, template: Template): Budgets => {
  const ratio = template.voxelSize / genome.voxelSize;
  const volume = ratio ** 3;
  const area = ratio ** 2;
  const { totalVoxels, totalTriangles, groups } = template.budgets;
  return {
    totalVoxels: { min: totalVoxels.min * volume, max: totalVoxels.max * volume },
    totalTriangles: { min: totalTriangles.min * area, max: totalTriangles.max * area },
    groups: Object.fromEntries(
      Object.entries(groups).map(([name, group]) => [
        name,
        { ...group, min: group.min * volume, max: group.max * volume },
      ]),
    ),
  };
};

registerBodyPlan('leaper', {
  sample: (rng, template) => ({ params: sampleParams(rng, template.params, PARAM_ORDER), wounds: [] }),
  build: buildLeaper,
  paramOrder: PARAM_ORDER,
  woundBones: [],
  budgets: budgetsFor,
  limbBones: LIMB_BONES,
  regionBones: LEAPER_REGION_BONES,
});
registerTemplate(LEAPER_TEMPLATE);
