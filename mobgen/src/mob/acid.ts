// The acid zombie body plan: the humanoid skeleton and base flesh, plus a chest sac, acid drool,
// glowing eyes and its own build variance (hump, belly, uneven arms, blisters). It keeps the humanoid's
// bone ids so Deadvox's hit regions, severing, poses and gaze apply unchanged (docs/acid-zombie-body.md).

import type { Body, Feature, Material } from '../core/body.ts';
import { type BodyPlanDef, registerBodyPlan, sampleParams } from '../core/generate.ts';
import { add, lerp3, type Vec3 } from '../core/math.ts';
import type { Rng } from '../core/random.ts';
import type { Genome, Template } from '../core/template.ts';
import {
  boneFleshRadius,
  buildBones,
  buildClothes,
  buildFaceLayout,
  buildFlesh,
  buildPalette,
  buildWounds,
  capsuleFeature,
  ellipsoidFeature,
  type FaceLayout,
  FLESH_SCALE,
  HUMANOID_PARAM_ORDER,
  type HumanoidParams,
  hslToRgb,
  type JointLayout,
  jointLayout,
  mid,
  mouthOpening,
  type Side,
  sampleWounds,
  WOUNDABLE_BONES,
} from './humanoid.ts';

export const ACID_PARAM_ORDER = [
  ...HUMANOID_PARAM_ORDER,
  'sacSize',
  'sacDrop',
  'sacSide',
  'sacVeins',
  'acidHue',
  'acidLight',
  'eyeLight',
  'droolLength',
  'humpSize',
  'bellySize',
  'armAsym',
  'blisterCover',
] as const;
type AcidParams = Readonly<Record<(typeof ACID_PARAM_ORDER)[number], number>>;

/** Below this a sampled shape param means "none", so a template can bias a part off with zero choices. */
const PRESENT = 0.05;

/** The sac's add shape; the acid repaint reuses it so the shirt paint cannot hide the sac. */
const sacShape = (layout: JointLayout, p: AcidParams): { readonly center: Vec3; readonly radii: Vec3 } => {
  const h = layout.height;
  const g = p.girth * FLESH_SCALE;
  const r = 0.07 * h * p.sacSize;
  const onAxis = lerp3(layout.chest.head, layout.chest.tail, 0.75 - 0.5 * p.sacDrop);
  // Sunk most of the way into the chest's own front radius, so the sac bulges from the chest instead of
  // hanging off it, and the two adds blend into one surface.
  const center = add(onAxis, [p.sacSide * 0.05 * h, 0, -(0.8 * 0.11 * h * g + 0.2 * r)]);
  return { center, radii: [1.1 * r, r, 0.85 * r] };
};

const buildAcidFlesh = (layout: JointLayout, p: AcidParams, face: FaceLayout): Feature[] => {
  const h = layout.height;
  const g = p.girth * FLESH_SCALE;
  const sac = sacShape(layout, p);
  const features: Feature[] = [ellipsoidFeature('chest', sac.center, sac.radii, 'acid')];

  if (p.humpSize > PRESENT) {
    const s = 0.6 + 0.6 * p.humpSize;
    const center = add(lerp3(layout.chest.head, layout.chest.tail, 0.7), [0, 0, 0.08 * h * g]);
    features.push(ellipsoidFeature('chest', center, [0.09 * h * g * s, 0.08 * h * g * s, 0.06 * h * g * s]));
  }
  if (p.bellySize > PRESENT) {
    const s = 0.8 + 0.4 * p.bellySize;
    const center = add(mid(layout.spine.head, layout.spine.tail), [0, 0, -0.03 * h * g]);
    features.push(ellipsoidFeature('spine', center, [0.085 * h * g * s, 0.075 * h * g * s, 0.07 * h * g * s]));
  }

  // At coarse LOD the forearm flesh is dropped (see humanoid.ts's buildFlesh), so its thickening is too.
  const keepDistalFlesh = face.voxel <= 0.06;
  if (Math.abs(p.armAsym) > PRESENT) {
    const side: Side = p.armAsym > 0 ? 'R' : 'L';
    const arm = layout.arm[side];
    const s = 1 + 0.35 * Math.abs(p.armAsym);
    features.push(capsuleFeature(`upperArm.${side}`, arm.shoulder, arm.elbow, [0.048 * h * g * s, 0.038 * h * g * s]));
    if (keepDistalFlesh) {
      features.push(capsuleFeature(`forearm.${side}`, arm.elbow, arm.wrist, [0.036 * h * g * s, 0.028 * h * g * s]));
    }
  }

  // Drool: a one-column strand owned by the jaw, so it leaves with a severed head. The open-mouth carve
  // reaches below the jaw, so the strand hangs from inside the jaw just behind the carve's back wall;
  // in front of that wall the carve would cut it off. Sub-voxel at coarse LOD.
  if (p.droolLength > PRESENT && keepDistalFlesh) {
    const { center, half } = mouthOpening(face, p.jawOpen);
    const r = 0.65 * face.scale;
    const z = center[2] + half[2] + 1.2 * r;
    const top: Vec3 = [0, face.jawCenter[1] - 0.5 * face.jawRadii[1], z];
    const bottom: Vec3 = [0, face.jawCenter[1] - face.jawRadii[1] - p.droolLength * 0.09 * h, z];
    features.push({
      bone: 'jaw',
      op: 'add',
      shape: { kind: 'capsule', a: top, b: bottom, ra: r, rb: 0.8 * r },
      material: 'acid',
      blend: 0.5 * face.scale,
    });
  }
  return features;
};

/** Paints that must land after the humanoid's clothes, which would otherwise cover them. */
const buildAcidPaints = (layout: JointLayout, p: AcidParams): Feature[] => {
  const h = layout.height;
  const sac = sacShape(layout, p);
  const covered: readonly Material[] = ['shirt', 'skin', 'bruise'];
  return [
    // Chest-only, so neck or jaw voxels inside the sac's ellipsoid stay flesh and a severed head takes none of it.
    {
      bone: 'chest',
      op: 'paint',
      shape: { kind: 'ellipsoid', ...sac },
      material: 'acid',
      onto: covered,
      ownerOnly: true,
    },
    {
      bone: 'chest',
      op: 'paint',
      shape: {
        kind: 'ellipsoid',
        center: sac.center,
        radii: [sac.radii[0] * 1.1, sac.radii[1] * 1.1, sac.radii[2] * 1.1],
      },
      material: 'bruise',
      onto: ['acid'],
      noise: { scale: 0.05, threshold: p.sacVeins },
      ownerOnly: true,
    },
    {
      bone: 'chest',
      op: 'paint',
      shape: { kind: 'box', center: [0, h * 0.5, 0], half: [h * 0.4, h * 0.55, h * 0.35], round: 0 },
      material: 'acid',
      onto: ['skin'],
      noise: { scale: 0.04, threshold: p.blisterCover },
    },
  ];
};

const buildAcid = (genome: Genome): Body => {
  const p = genome.params as AcidParams;
  const hp: HumanoidParams = p;
  const layout = jointLayout(hp);
  const bones = buildBones(layout);
  const face = buildFaceLayout(layout, hp, genome.voxelSize);
  const features = [
    ...buildFlesh(layout, hp, face),
    ...buildAcidFlesh(layout, p, face),
    ...buildClothes(layout, hp, face),
    ...buildAcidPaints(layout, p),
    ...buildWounds(bones, genome.wounds, (id) => boneFleshRadius(id, layout, hp)),
  ];
  const palette = {
    ...buildPalette(hp),
    acid: hslToRgb(p.acidHue, 0.85, p.acidLight),
    eye: hslToRgb(p.acidHue, 0.9, p.eyeLight),
  };
  return { bones, features, palette };
};

const sampleAcid: BodyPlanDef['sample'] = (rng: Rng, template: Template) => {
  const params = sampleParams(rng, template.params, ACID_PARAM_ORDER);
  const wounds = sampleWounds(rng, params.woundCount!);
  return { params, wounds };
};

registerBodyPlan('acid', {
  sample: sampleAcid,
  build: (genome) => buildAcid(genome),
  paramOrder: ACID_PARAM_ORDER,
  woundBones: WOUNDABLE_BONES,
});
