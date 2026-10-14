// The dog shambler's two model-comparison builds, kept side by side so their results can be looked at
// together: `dogTemplate` is the quadruped build (body plan 'quadruped', mob/quadruped.ts and
// mob/quadrupedPose.ts), `dogM3Template` the earlier build (body plan 'dog', mob/dog.ts). Each keeps its
// own body plan, poses and look; only the template names differ.
//
// Both are `comparison-only` (core/template.ts's `TemplateStatus`): kept to be compared against others,
// not fit for a player to meet, so a consumer refuses them (core/template.ts's `consumableTemplate`) and
// the viewer labels them. They stay outside mob/templates.ts's TEMPLATES list, so Deadvox's enumerations
// never see them; the viewer opts both in explicitly (mob/viewerTemplates.ts).
//
// The quadruped build keeps the plain `dog` name because the look URL under review opens that name
// (?template=dog&seed=7&walk=1&speed=0.8); the merged-in earlier build is `dog-m3` beside it.

import { registerTemplate, type Template } from '../core/template.ts';
// Side effect: registers the 'dog' body plan (mob/dog.ts's registerBodyPlan call).
import './dog.ts';
import { QUADRUPED_SUPPORT_BONES } from './quadruped.ts';

/** Shares of nominal mass for severable parts; each key covers the whole subtree it cuts off
 * (forearm.FL includes its paw). An infected dog's mass is a template choice, not a density
 * consequence (see core/templateMass.ts). */
const DOG_MASS_FRACTIONS = {
  'paw.FL': 0.03,
  'paw.FR': 0.03,
  'paw.BL': 0.035,
  'paw.BR': 0.035,
  'forearm.FL': 0.075,
  'forearm.FR': 0.075,
  'shin.BL': 0.095,
  'shin.BR': 0.095,
  'upperArm.FL': 0.135,
  'upperArm.FR': 0.135,
  'thigh.BL': 0.165,
  'thigh.BR': 0.165,
  head: 0.14,
  tail: 0.03,
} as const;

export const dogTemplate: Template = {
  name: 'dog',
  description: 'Dog-sized infected quadruped: low head carriage, patchy fur, limping lurch on four paws.',
  bodyPlan: 'quadruped',
  // A dog is much smaller than the humanoid mobs, so its grid is finer: the voxel size is a
  // per-template choice (see mobgen/PROJECT.md's design boundaries) and a coarse grid would leave
  // a muzzle and ears only a voxel or two wide.
  voxelSize: 0.5 / 20,
  bodyMassKg: 32,
  massFractions: DOG_MASS_FRACTIONS,
  params: {
    height: { min: 0.42, max: 0.58 },
    girth: { min: 0.85, max: 1.2 },
    bodyLength: { min: 0.9, max: 1.15 },
    headScale: { min: 0.85, max: 1.15 },
    snoutLength: { min: 0.8, max: 1.3 },
    earSize: { choices: [0, 0, 0, 0.5, 0.75, 1] },
    jawOpen: { choices: [0, 0, 0, 0.2, 0.4, 0.6] },
    tailLift: { min: 0, max: 1 },
    skinHue: { min: 55, max: 110 },
    skinSat: { min: 0.12, max: 0.32 },
    skinLight: { min: 0.34, max: 0.56 },
    furCover: { min: 0, max: 0.8 },
    woundCount: { choices: [0, 0, 1, 1, 2, 3] },
    limp: { min: 0, max: 0.5 },
    strideFactor: { min: 0.85, max: 1.15 },
    lurch: { min: 2, max: 8 },
    headLoll: { min: 2, max: 10 },
  },
  supportBones: QUADRUPED_SUPPORT_BONES,
  budgets: {
    totalVoxels: { min: 1800, max: 5600 },
    totalTriangles: { min: 3200, max: 8500 },
    // Head = skull, muzzle, ears and jaw. Measured across generated seeds 1..24 at the template
    // voxel size, the head group normalizes to 220..350 voxels; the range leaves headroom for
    // parameter extremes those seeds did not hit.
    groups: { head: { bones: ['head', 'jaw'], min: 160, max: 420 } },
  },
  status: 'comparison-only',
};

/** The earlier build of the same mob, kept only for the side-by-side comparison this template family
 * exists for (see mobgen/PROJECT.md's body-plan constraints). */
export const dogM3Template: Template = {
  name: 'dog-m3',
  description: 'Dog-sized infected quadruped, earlier build: a lurching, limping four-paw shamble with a hanging head.',
  bodyPlan: 'dog',
  voxelSize: 0.5 / 12,
  bodyMassKg: 30,
  params: {
    height: { min: 0.5, max: 0.72 },
    girth: { min: 0.85, max: 1.2 },
    headScale: { min: 0.9, max: 1.1 },
    neckLength: { min: 0.85, max: 1.15 },
    tailLength: { min: 0.7, max: 1.3 },
    headTilt: { choices: [-8, -4, 0, 0, 4, 8] },
    jawOpen: { choices: [0, 0, 0.2, 0.4, 0.6] },
    skinHue: { min: 55, max: 110 },
    skinSat: { min: 0.12, max: 0.3 },
    skinLight: { min: 0.35, max: 0.55 },
    woundCount: { choices: [0, 0, 1, 1, 2, 3] },
    limp: { min: 0, max: 0.5 },
  },
  supportBones: ['forePaw.L', 'forePaw.R', 'hindPaw.L', 'hindPaw.R'],
  budgets: {
    totalVoxels: { min: 110, max: 1500 },
    totalTriangles: { min: 400, max: 8500 },
    groups: { head: { bones: ['head', 'jaw'], min: 18, max: 140 } },
  },
  status: 'comparison-only',
};

registerTemplate(dogTemplate);
registerTemplate(dogM3Template);
