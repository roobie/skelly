// The dog shambler template: an infected quadruped. Its body plan and poses live in mob/dog.ts; this
// module only names the template and its sampled ranges.
//
// It is `comparison-only`: kept for side-by-side checks against other quadrupeds, not for spawning, so a
// consumer refuses it (core/template.ts's `consumableTemplate`) and the viewer labels it. It also stays
// outside mob/templates.ts's TEMPLATES list, so Deadvox's enumerations never see it; the viewer opts in
// explicitly, the same way the amalgam boss does.

import { registerTemplate, type Template } from '../core/template.ts';
// Imports for the side effect of registering the 'dog' body plan (mob/dog.ts's registerBodyPlan call).
import './dog.ts';
import { dogMaterialHsl, dogMaterials } from './materialTemplates.ts';

export const dogTemplate: Template = {
  name: 'dog',
  materials: dogMaterials,
  materialHsl: dogMaterialHsl,
  description: 'Dog-sized infected quadruped: a lurching, limping four-paw shamble with a hanging head.',
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
