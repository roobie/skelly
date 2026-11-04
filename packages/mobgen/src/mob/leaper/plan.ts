// The leaper body plan: an ambush predator built around folded hind springs. The rest pose is its
// everyday coiled crouch, so validation judges the body it spends its life in; rearing is a pose
// (see poses.ts). Values a look change would tune live in leaper.jsonnet; proportions that the
// supports, the coil and the region contract depend on live here.

import type { Body, BodyRegion, Bone, Feature, Material } from '../../core/body.ts';
import { registerBodyPlan, sampleParams } from '../../core/generate.ts';
import { add, clamp, dot, length, lerp3, mulMV, normalize, rotX, scale, sub, type Vec3 } from '../../core/math.ts';
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
        half: [r(0.3), band, r(0.5)],
        round: 0,
        rot: rotX(pitch),
      },
      material: 'dorsal',
      onto: ['skin'],
    });
  }
  return { bones: rig.bones, features: rig.features, materials: resolveMaterials(template, genome.params) };
};

interface Limb {
  readonly at: (x: number, y: number, z: number) => Vec3;
  readonly r: (value: number) => number;
  readonly p: Params;
}

/** Long forelimbs planted ahead as props, elbows swept out and back, the hands well forward of the
 * shoulders: the reach the melee strikes with, kept inside the knee points from the front. */
const buildForelimb = (rig: Rig, side: Side, x: number, { at, r, p }: Limb): void => {
  const shoulder = at(0.22 * x, 0.64, -0.2);
  const wrist = at(0.28 * p.splay * x, 0.13, -0.62 - 0.25 * (p.reach - 1));
  const elbow = bentJoint(shoulder, wrist, [r(0.38 * p.reach), r(0.4 * p.reach)], [0.6 * x, 0.2, 0.8]);
  const tip = add(wrist, at(0, -0.11, -0.16));
  rig.bones.push(
    { id: `upperArm.${side}`, parent: 'chest', head: shoulder, tail: elbow, disposition: 'sever' },
    { id: `forearm.${side}`, parent: `upperArm.${side}`, head: elbow, tail: wrist },
    { id: `hand.${side}`, parent: `forearm.${side}`, head: wrist, tail: tip },
  );
  flesh(rig, `upperArm.${side}`, ellipsoid(shoulder, [r(0.08), r(0.08), r(0.08)]));
  flesh(rig, `upperArm.${side}`, capsule(shoulder, elbow, r(0.07), r(0.05)));
  flesh(rig, `forearm.${side}`, capsule(elbow, wrist, r(0.05), r(0.04)));
  accent(rig, `forearm.${side}`, ellipsoid(add(elbow, at(0, 0.02, 0.07)), [r(0.036), r(0.036), r(0.07)]), SPUR);
  const palm = lerp3(wrist, tip, 0.3);
  flesh(rig, `hand.${side}`, ellipsoid(palm, [r(0.06), r(0.04), r(0.06)]));
  // A knuckle pad under the claw roots keeps every claw tip joined to the hand where it meets the ground.
  const pad = lerp3(palm, tip, 0.65);
  flesh(rig, `hand.${side}`, ellipsoid([pad[0], r(0.032), pad[2]], [r(0.065), r(0.026), r(0.06)]));
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
  flesh(rig, `thigh.${side}`, capsule(hip, knee, r(0.13 * h), r(0.065)));
  flesh(rig, `thigh.${side}`, ellipsoid(lerp3(hip, knee, 0.28), [r(0.12 * h), r(0.13 * h), r(0.13 * h)]), {
    blend: 0.05,
  });
  flesh(rig, `shin.${side}`, ellipsoid(knee, [r(0.065), r(0.065), r(0.065)]));
  // A bony cap makes the knee read as the sharp apex of the spring, not another hump.
  accent(rig, `shin.${side}`, ellipsoid(add(knee, at(0.01 * x, 0.05, 0.03)), [r(0.04), r(0.06), r(0.045)]), SPUR);
  flesh(rig, `shin.${side}`, capsule(knee, hock, r(0.07), r(0.045)));
  flesh(rig, `foot.${side}`, capsule(hock, ball, r(0.045), r(0.035)));
  accent(rig, `foot.${side}`, ellipsoid(add(hock, at(0, 0.03, 0.07)), [r(0.036), r(0.05), r(0.07)]), SPUR);
  for (const spread of [-0.05, 0, 0.05]) {
    flesh(rig, `foot.${side}`, capsule(ball, add(tip, at(spread, 0, 0)), r(0.035), r(0.02)));
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
