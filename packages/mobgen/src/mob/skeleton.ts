// The skeleton body plan: bare bones on the humanoid rig. It keeps the humanoid's bone names and
// reference joint layout so the shared walk, idle and attack poses drive it unchanged; its shape,
// sizes and colours come from the template's `geometry` and `materials` (skeletonTemplate.jsonnet).
//
// Face parts (eye sockets, nose, teeth) and the separate ribs are snapped to voxel rows and columns:
// at about 1/12 block a rib or a socket is one or two voxels, so an unsnapped one would merge with its
// neighbour or vanish.

import type { Body, Feature } from '../core/body.ts';
import { registerBodyPlan, sampleParams } from '../core/generate.ts';
import { add, cross, lerp3, type Mat3, mulMV, normalize, rotX, rotZ, scale, sub, type Vec3 } from '../core/math.ts';
import type { Genome } from '../core/template.ts';
import { heightHeadBudgets } from './budgets.ts';
import {
  buildBones,
  HUMANOID_LIMB_BONES,
  type HumanoidParams,
  type JointLayout,
  jointLayout,
  REF,
  snapCol,
  snapRow,
} from './humanoid.ts';
import type { SkeletonTemplate } from './skeletonTemplate.ts';

type Pair = readonly [number, number];
type Triple = readonly [number, number, number];
// JSON imports type fixed-length arrays as number[]; these restore their lengths.
type Geometry = Omit<
  SkeletonTemplate['geometry'],
  'vertebraHalf' | 'sternumHalf' | 'sacrumHalf' | 'pubisHalf' | 'iliumHalf' | 'palmHalf'
> & {
  readonly vertebraHalf: Pair;
  readonly sternumHalf: Pair;
  readonly sacrumHalf: Triple;
  readonly pubisHalf: Pair;
  readonly iliumHalf: Triple;
  readonly palmHalf: Pair;
};

type SkeletonParams = HumanoidParams & { readonly jawGape: number; readonly boneTint: number };

const SIDES = ['L', 'R'] as const;
type Side = (typeof SIDES)[number];
const sideSign = (side: Side): number => (side === 'L' ? -1 : 1);

const SKELETON_PARAM_ORDER = [
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
  'jawGape',
  'boneTint',
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

const BONE = 'bone';

interface BoxSpec {
  readonly center: Vec3;
  readonly half: Vec3;
  readonly round?: number;
  readonly rot?: Mat3;
}

const box = (bone: string, spec: BoxSpec, blend: number): Feature => ({
  bone,
  op: 'add',
  shape: { kind: 'box', round: 0, ...spec },
  material: BONE,
  blend,
});

const capsule = (bone: string, [a, b]: readonly [Vec3, Vec3], radius: number, blend: number): Feature => ({
  bone,
  op: 'add',
  shape: { kind: 'capsule', a, b, ra: radius, rb: radius },
  material: BONE,
  blend,
});

const ellipsoid = (bone: string, center: Vec3, radius: number, blend: number): Feature => ({
  bone,
  op: 'add',
  shape: { kind: 'ellipsoid', center, radii: [radius, radius, radius] },
  material: BONE,
  blend,
});

/** An axis-aligned carve or paint over a voxel-snapped block of the skull. */
const cell = (op: 'carve' | 'paint', material: string, center: Vec3, half: Vec3): Feature => ({
  bone: 'head',
  op,
  shape: { kind: 'box', center, half, round: 0 },
  material,
  onto: [BONE],
});

/** The centre of a run of `count` voxels near `at`: a row or column centre for an odd count, the
 * boundary between two for an even one. `cellCentre` is where this axis puts voxel centres. */
const snapRun = (at: number, count: number, v: number, cellCentre: (x: number, v: number) => number): number =>
  count % 2 === 1 ? cellCentre(at, v) : cellCentre(at - v / 2, v) + v / 2;

/** Half extent that covers exactly `count` voxels around a snapped run centre (carves have no tolerance). */
const runHalf = (count: number, v: number): number => (count / 2 - 0.05) * v;

/** A rotation whose local +Y points along `dir`. */
const frameAlong = (dir: Vec3): Mat3 => {
  const y = normalize(dir);
  const side = Math.abs(y[2]) > 0.9 ? ([1, 0, 0] as Vec3) : ([0, 0, 1] as Vec3);
  const x = normalize(cross(y, side));
  const z = cross(x, y);
  return [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
};

const upTilted = (len: number, tiltDeg: number): Vec3 => mulMV(rotX(-tiltDeg), [0, len, 0]);

/** The spine's z at height y, read off the hunch-tilted pelvis-to-skull chain. */
const spineZAt = (layout: JointLayout, y: number): number => {
  const chain = [layout.spine.head, layout.spine.tail, layout.chest.tail, layout.neck.tail];
  for (let i = 1; i < chain.length; i++) {
    const a = chain[i - 1]!;
    const b = chain[i]!;
    if (y <= b[1] || i === chain.length - 1) {
      const t = Math.min(1, Math.max(0, (y - a[1]) / (b[1] - a[1])));
      return a[2] + (b[2] - a[2]) * t;
    }
  }
  return 0;
};

interface SkullLayout {
  readonly base: Vec3;
  readonly size: number;
  readonly faceFront: number;
  readonly hinge: Vec3;
  readonly jawRot: Mat3;
  readonly chin: Vec3;
}

/** Joints from the humanoid reference, with the frame shrunk so a larger stylised skull still ends at
 * the sampled height, and the feet set apart for blocky toes. */
const skeletonLayout = (p: SkeletonParams, g: Geometry, v: number): { layout: JointLayout; skull: SkullLayout } => {
  const h = p.height;
  const size = g.skullFraction * h * p.headScale;
  const frame = jointLayout({ ...p, height: (h - size) / REF.baseOfSkull });
  const base = frame.head.head;
  const tilt = p.hunch + p.headTilt;
  const [, , axisZ] = base;
  // The face plane sits midway between two voxel columns, so its front column is known exactly.
  const faceFront = snapCol(axisZ - g.faceForward * size, v) - v / 2;
  const jawRot = rotX(-p.jawGape);
  const hinge: Vec3 = [0, base[1] + g.jawTop * size, axisZ + g.jawBack * size];
  const chinClosed: Vec3 = [0, base[1] - g.jawDrop * size, faceFront];
  const chin = add(hinge, mulMV(jawRot, sub(chinClosed, hinge)));
  const legs = Object.fromEntries(
    SIDES.map((side) => {
      const leg = frame.leg[side];
      const footX = sideSign(side) * snapCol(g.footSpread * h, v);
      const kneeX = sideSign(side) * g.kneeSpread * h;
      return [
        side,
        {
          hip: leg.hip,
          knee: [kneeX, leg.knee[1], leg.knee[2]] as Vec3,
          ankle: [footX, leg.ankle[1], leg.ankle[2]] as Vec3,
          toe: [footX, leg.toe[1], leg.toe[2]] as Vec3,
        },
      ];
    }),
  ) as unknown as JointLayout['leg'];
  const layout: JointLayout = {
    ...frame,
    height: h,
    head: { head: base, tail: add(base, upTilted(g.headBoneLength * size, tilt)) },
    jaw: { head: hinge, tail: chin },
    leg: legs,
  };
  return { layout, skull: { base, size, faceFront, hinge, jawRot, chin } };
};

const buildSpine = (layout: JointLayout, skull: SkullLayout, g: Geometry, v: number): Feature[] => {
  const h = layout.height;
  const blend = g.crispBlend;
  const segments: [string, Vec3, Vec3][] = [
    ['spine', layout.spine.head, layout.spine.tail],
    ['chest', layout.chest.head, layout.chest.tail],
    ['neck', layout.neck.head, layout.neck.tail],
  ];
  const radius = g.spineRadiusVoxels * v;
  const features: Feature[] = segments.map(([bone, a, b]) => capsule(bone, [a, b], radius, blend));
  // The top vertebra reaches into the skull so the skull always rests on the neck.
  const neckTop = layout.neck.tail;
  features.push(capsule('neck', [neckTop, add(neckTop, [0, g.neckReach * skull.size, 0])], radius, blend));
  const [, bottom] = layout.spine.head;
  const [, top] = neckTop;
  const [vertebraX, vertebraZ] = g.vertebraHalf;
  for (let y = snapRow(bottom, v); y < top - v; y += g.vertebraPitchVoxels * v) {
    const [bone] = segments.find(([, , b]) => y < b[1]) ?? segments.at(-1)!;
    const widthScale = bone === 'neck' ? g.neckVertebraScale : 1;
    features.push(
      box(
        bone,
        { center: [0, y, spineZAt(layout, y)], half: [vertebraX * h * widthScale, runHalf(1, v), vertebraZ * h] },
        blend,
      ),
    );
  }
  return features;
};

const buildRibcage = (layout: JointLayout, p: HumanoidParams, g: Geometry, v: number): Feature[] => {
  const h = layout.height;
  const blend = g.crispBlend;
  const { shoulder } = layout.arm.R;
  const top = shoulder[1] - g.ribTop * h;
  const ribRadius = g.ribRadiusVoxels * v;
  const features: Feature[] = [];
  const ribRows = g.ribScale.map((_, i) => snapRow(top - i * g.ribPitch * h, v));
  ribRows.forEach((y, i) => {
    const s = g.ribScale[i]!;
    const rx = g.ribHalfWidth * h * p.shoulderWidth * s;
    const rz = g.ribDepth * h * s;
    const backZ = spineZAt(layout, y);
    const centreZ = backZ - rz;
    const gap = (g.ribFrontGapDeg * Math.PI) / 180;
    const steps = g.ribSegments;
    // Each half ring runs from the spine at the back (angle 0) round to the front gap (angle pi - gap).
    for (const sign of [-1, 1]) {
      let previous: Vec3 | undefined;
      for (let k = 0; k <= steps; k++) {
        const angle = ((Math.PI - gap) * k) / steps;
        const point: Vec3 = [sign * rx * Math.sin(angle), y, centreZ + rz * Math.cos(angle)];
        if (previous) {
          features.push(capsule('chest', [previous, point], ribRadius, g.ribBlend));
        }
        previous = point;
      }
    }
  });
  const sternumTop = ribRows[0]! + v;
  const sternumBottom = ribRows[Math.min(g.sternumRibs, ribRows.length) - 1]! - v / 2;
  const frontZ = spineZAt(layout, ribRows[0]!) - 2 * g.ribDepth * h * g.ribScale[0]!;
  const [sternumX, sternumZ] = g.sternumHalf;
  features.push(
    box(
      'chest',
      {
        center: [0, (sternumTop + sternumBottom) / 2, frontZ],
        half: [sternumX * h, (sternumTop - sternumBottom) / 2, sternumZ * h],
      },
      blend,
    ),
  );
  for (const side of SIDES) {
    const ends: [Vec3, Vec3] = [[0, sternumTop, frontZ], layout.arm[side].shoulder];
    features.push(capsule('chest', ends, g.clavicleRadiusVoxels * v, blend));
  }
  return features;
};

const buildPelvis = (layout: JointLayout, p: HumanoidParams, g: Geometry): Feature[] => {
  const h = layout.height;
  const blend = g.crispBlend;
  const [hipX, hipY] = layout.leg.R.hip;
  const scaled = (half: readonly number[]): Vec3 => [half[0]! * h, half[1]! * h, half[2]! * h];
  const [pubisY, pubisZ] = g.pubisHalf;
  const features: Feature[] = [
    box('pelvis', { center: [0, hipY + g.sacrumRise * h, g.sacrumBack * h], half: scaled(g.sacrumHalf) }, blend),
    box(
      'pelvis',
      { center: [0, hipY - g.pubisDrop * h, -g.pubisForward * h], half: [hipX, pubisY * h, pubisZ * h] },
      blend,
    ),
  ];
  for (const side of SIDES) {
    const sign = sideSign(side);
    features.push(
      box(
        'pelvis',
        {
          center: [sign * g.iliumOut * h * p.hipWidth, hipY + g.iliumRise * h, 0],
          half: scaled(g.iliumHalf),
          rot: rotZ(sign * g.iliumFlareDeg),
        },
        blend,
      ),
      ellipsoid('pelvis', layout.leg[side].hip, g.socketRadius * h, blend),
    );
  }
  return features;
};

const buildLimbs = (layout: JointLayout, g: Geometry, v: number): Feature[] => {
  const h = layout.height;
  const blend = g.crispBlend;
  const knob = g.knobHalf * h;
  const knobHalf: Vec3 = [knob, knob, knob];
  const features: Feature[] = [];
  for (const side of SIDES) {
    const arm = layout.arm[side];
    const leg = layout.leg[side];
    features.push(
      box(`upperArm.${side}`, { center: arm.shoulder, half: knobHalf }, blend),
      capsule(`upperArm.${side}`, [arm.shoulder, arm.elbow], g.upperArmRadius * h, blend),
      box(`forearm.${side}`, { center: arm.elbow, half: knobHalf }, blend),
      capsule(`forearm.${side}`, [arm.elbow, arm.wrist], g.forearmRadius * h, blend),
      ellipsoid(`thigh.${side}`, leg.hip, knob, blend),
      capsule(`thigh.${side}`, [leg.hip, leg.knee], g.thighRadius * h, blend),
      box(`shin.${side}`, { center: leg.knee, half: [knob * g.kneeWidth, knob, knob] }, blend),
      capsule(`shin.${side}`, [leg.knee, leg.ankle], g.shinRadius * h, blend),
      ...buildHand(side, [arm.wrist, arm.handTip], g, { h, v }),
      ...buildFoot(side, [leg.ankle, leg.toe], g, { h, v }),
    );
  }
  return features;
};

/** The sampled height and the voxel size: body-relative and voxel-relative lengths. */
interface Units {
  readonly h: number;
  readonly v: number;
}

const buildHand = (side: Side, [wrist, tip]: readonly [Vec3, Vec3], g: Geometry, { h, v }: Units): Feature[] => {
  const bone = `hand.${side}`;
  const blend = g.crispBlend;
  const rot = frameAlong(sub(tip, wrist));
  const along = (t: number): Vec3 => lerp3(wrist, tip, t);
  const across: Vec3 = [rot[2], rot[5], rot[8]];
  const palmLength = g.palmLength * h;
  const palmCentre = add(wrist, scale(normalize(sub(tip, wrist)), palmLength / 2));
  const count = g.fingerCount;
  const spread = ((count - 1) / 2) * g.fingerSpacingVoxels * v;
  // The palm spans every finger root so no finger is left standing apart from it.
  const palmWidth = Math.max(g.palmHalf[1] * h, spread);
  const [palmDepth] = g.palmHalf;
  const features: Feature[] = [
    box(bone, { center: palmCentre, half: [palmDepth * h, palmLength / 2, palmWidth], rot }, blend),
  ];
  const start = palmLength / Math.hypot(...sub(tip, wrist));
  const fingerRadius = g.fingerRadiusVoxels * v;
  for (let i = 0; i < count; i++) {
    const offset = scale(across, (i - (count - 1) / 2) * g.fingerSpacingVoxels * v);
    features.push(capsule(bone, [add(along(start / 2), offset), add(along(1), offset)], fingerRadius, blend));
  }
  const thumbBase = add(along(g.thumbStart), scale(across, -palmWidth));
  const thumbTip = add(thumbBase, add(scale(across, -g.thumbLength * h * 0.4), scale(sub(tip, wrist), 0.25)));
  features.push(capsule(bone, [thumbBase, thumbTip], fingerRadius, blend));
  return features;
};

const buildFoot = (side: Side, [ankle, toe]: readonly [Vec3, Vec3], g: Geometry, { h, v }: Units): Feature[] => {
  const bone = `foot.${side}`;
  const blend = g.crispBlend;
  const heelBack = ankle[2] + g.heelBack * h;
  const ballZ = ankle[2] + (toe[2] - ankle[2]) * g.footBall;
  const halfWidth = g.footHalfWidth * h;
  const features: Feature[] = [
    // The heel reaches from the ground up into the ankle so the foot bone touches the shin.
    box(
      bone,
      {
        center: [ankle[0], ankle[1] / 2, (heelBack + ankle[2]) / 2 - g.heelForward * h],
        half: [halfWidth, ankle[1] / 2, (heelBack - ankle[2]) / 2 + g.heelForward * h],
      },
      blend,
    ),
    box(
      bone,
      {
        center: [ankle[0], (g.archHeight * h) / 2, (ankle[2] + ballZ) / 2],
        half: [halfWidth, (g.archHeight * h) / 2, (ankle[2] - ballZ) / 2],
      },
      blend,
    ),
  ];
  const row = snapRow(v / 2, v);
  for (let i = 0; i < g.toeCount; i++) {
    const x = ankle[0] + (i - (g.toeCount - 1) / 2) * g.toeSpacingVoxels * v;
    features.push(
      capsule(
        bone,
        [
          [x, row, ballZ + v],
          [x, row, toe[2]],
        ],
        g.toeRadiusVoxels * v,
        blend,
      ),
    );
  }
  return features;
};

const buildSkull = (skull: SkullLayout, g: Geometry, v: number): Feature[] => {
  const { base, size, faceFront, hinge, jawRot } = skull;
  const blend = g.crispBlend;
  const [, , axisZ] = base;
  const frontColumn = faceFront + v / 2;
  const span = (from: number, to: number): [number, number] => [(from + to) / 2, (to - from) / 2];
  const [cranY, cranHalfY] = span(base[1] + g.craniumBottom * size, base[1] + size);
  const [cranZ, cranHalfZ] = span(faceFront, axisZ + g.craniumBack * size);
  const [maxY, maxHalfY] = span(base[1] + g.maxillaBottom * size, base[1] + g.maxillaTop * size);
  const [maxZ, maxHalfZ] = span(faceFront, axisZ + g.maxillaBack * size);
  const [jawY, jawHalfY] = span(base[1] - g.jawDrop * size, hinge[1]);
  const [jawZ, jawHalfZ] = span(faceFront, hinge[2]);
  const jawCentre = add(hinge, mulMV(jawRot, sub([0, jawY, jawZ], hinge)));
  const features: Feature[] = [
    box(
      'head',
      {
        center: [0, cranY, cranZ],
        half: [g.craniumWidth * size, cranHalfY, cranHalfZ],
        round: g.craniumRound * size,
      },
      blend,
    ),
    box('head', { center: [0, maxY, maxZ], half: [g.maxillaWidth * size, maxHalfY, maxHalfZ] }, blend),
    box('jaw', { center: jawCentre, half: [g.jawWidth * size, jawHalfY, jawHalfZ], rot: jawRot }, blend),
  ];
  // Eye sockets: one voxel deep, with the glowing eye on the socket's back wall.
  const eyeY = snapRun(base[1] + g.eyeHeight * size, g.eyeRows, v, snapRow);
  const eyeHalf: Vec3 = [runHalf(g.eyeColumns, v), runHalf(g.eyeRows, v), runHalf(1, v)];
  for (const sign of [-1, 1]) {
    const eyeX = sign * snapRun(g.eyeOffset * size, g.eyeColumns, v, snapCol);
    features.push(
      cell('carve', BONE, [eyeX, eyeY, frontColumn], eyeHalf),
      cell('paint', 'eye', [eyeX, eyeY, frontColumn + v], eyeHalf),
    );
  }
  const noseY = snapRun(base[1] + g.noseHeight * size, g.noseRows, v, snapRow);
  const noseHalf: Vec3 = [runHalf(1, v), runHalf(g.noseRows, v), runHalf(1, v)];
  features.push(
    cell('carve', BONE, [0, noseY, frontColumn], noseHalf),
    cell('paint', 'socket', [0, noseY, frontColumn + v], noseHalf),
  );
  // Teeth: dark gaps on alternate columns of the upper jaw's bottom row.
  const teethY = snapRow(base[1] + g.maxillaBottom * size + v / 2, v);
  const teethColumns = Math.floor((g.maxillaWidth * size) / v);
  for (let k = -teethColumns; k <= teethColumns; k++) {
    if (Math.abs(k) % 2 === 1) {
      features.push(cell('paint', 'socket', [k * v, teethY, frontColumn], [runHalf(1, v), runHalf(1, v), v]));
    }
  }
  return features;
};

const buildSkeleton = (genome: Genome, template: SkeletonTemplate): Body => {
  const p = genome.params as unknown as SkeletonParams;
  const g = template.geometry as unknown as Geometry;
  const v = genome.voxelSize;
  const { layout, skull } = skeletonLayout(p, g, v);
  // The humanoid's marrow material is skin, which a skeleton does not have.
  const bones = buildBones(layout).map(({ marrowMaterial: _skin, ...bone }) => bone);
  const h = layout.height;
  const grime: Feature = {
    bone: 'pelvis',
    op: 'paint',
    shape: { kind: 'box', center: [0, h / 2, 0], half: [h, h, h], round: 0 },
    material: 'grime',
    onto: [BONE],
    noise: { scale: g.grimeScale, threshold: g.grimeThreshold },
  };
  const features = [
    ...buildPelvis(layout, p, g),
    ...buildSpine(layout, skull, g, v),
    ...buildRibcage(layout, p, g, v),
    ...buildLimbs(layout, g, v),
    ...buildSkull(skull, g, v),
    grime,
  ];
  const tint = (a: readonly number[], b: readonly number[]): Vec3 =>
    lerp3(a as unknown as Vec3, b as unknown as Vec3, p.boneTint);
  const materials = {
    ...template.materials,
    bone: { ...template.materials.bone!, color: tint(template.materials.bone!.color, template.boneB) },
  };
  return { bones, features, materials };
};

registerBodyPlan('skeleton', {
  sample: (rng, template) => ({ params: sampleParams(rng, template.params, SKELETON_PARAM_ORDER), wounds: [] }),
  build: (genome, template) => buildSkeleton(genome, template as SkeletonTemplate),
  paramOrder: SKELETON_PARAM_ORDER,
  woundBones: [],
  budgets: heightHeadBudgets,
  limbBones: HUMANOID_LIMB_BONES,
});
