// Archetype templates (PROJECT.md §3, milestone 1: shambler, runner, brute).
// Registering a template (a side effect of importing this module) is what
// lets core/template.ts's templateByName and core/generate.ts's build/realize
// dispatch by name alone.

import { registerTemplate, type Template } from '../core/template.ts';
import { FEET_BONES } from './humanoid.ts';
import './humanoid.ts'; // registers the 'humanoid' body plan (sample + build)

const FEET = FEET_BONES;
/** Shares of nominal mass for severable parts; each key covers the whole subtree it cuts off (forearm.L includes its hand). */
const HUMANOID_MASS_FRACTIONS = {
  'hand.L': 0.006,
  'hand.R': 0.006,
  'forearm.L': 0.022,
  'forearm.R': 0.022,
  'upperArm.L': 0.05,
  'upperArm.R': 0.05,
  head: 0.081,
} as const;

/** Params every humanoid template must supply (see mob/humanoid.ts's HUMANOID_PARAM_ORDER). */
const shamblerParams: Template['params'] = {
  height: { min: 1.55, max: 1.9 },
  girth: { min: 0.85, max: 1.25 },
  shoulderWidth: { min: 0.85, max: 1.15 },
  hipWidth: { min: 0.9, max: 1.2 },
  headScale: { min: 0.9, max: 1.1 },
  armLength: { min: 0.9, max: 1.1 },
  legLength: { min: 0.9, max: 1.05 },
  hunch: { min: 5, max: 25 },
  kneeBend: { min: 5, max: 20 },
  headTilt: { choices: [-10, -5, 0, 0, 5, 10, 15] },
  jawOpen: { choices: [0, 0, 0.2, 0.4, 0.6, 0.8, 1] },
  noseLength: { min: 0.008, max: 0.02 },
  earSize: { choices: [0, 0, 0, 0.18, 0.22, 0.28] },
  skinHue: { min: 55, max: 110 },
  skinSat: { min: 0.12, max: 0.3 },
  skinLight: { min: 0.35, max: 0.55 },
  shirtHue: { min: 0, max: 360 },
  shirtLight: { min: 0.2, max: 0.45 },
  pantsHue: { min: 0, max: 360 },
  pantsLight: { min: 0.15, max: 0.4 },
  sleeveLength: { min: 0, max: 1 },
  pantsLength: { min: 0.7, max: 1 },
  shirtTear: { min: 0, max: 0.25 },
  pantsTear: { min: 0, max: 0.2 },
  hairCover: { min: 0, max: 0.9 },
  woundCount: { choices: [0, 0, 1, 1, 2, 3] },
  armSwing: { min: 5, max: 20 },
  armRaise: { choices: [0, 0, 10, 30, 50, 65] },
  limp: { min: 0, max: 0.5 },
  strideFactor: { min: 0.85, max: 1.15 },
  pelvisSway: { min: 1, max: 6 },
  spineTwist: { min: 1, max: 5 },
  headLoll: { min: 2, max: 10 },
  jawChatter: { min: 0, max: 15 },
  footLift: { min: 0.02, max: 0.06 },
};

export const shambler: Template = {
  name: 'shambler',
  description: 'Average build, hunched, shuffling walk with an occasional forward reach.',
  bodyPlan: 'humanoid',
  voxelSize: 0.5 / 12,
  bodyMassKg: 70,
  massFractions: HUMANOID_MASS_FRACTIONS,
  params: shamblerParams,
  feet: FEET,
  budgets: {
    totalVoxels: { min: 500, max: 2000 },
    totalTriangles: { min: 800, max: 9500 },
    // A head 5 voxels wide, room for eyes, brow, nose and mouth; measured p1..p99 is 72..122.
    groups: { head: { bones: ['head', 'jaw'], min: 60, max: 130 } },
  },
};

export const runner: Template = {
  name: 'runner',
  description: 'Lean, taller, upright, faster stride.',
  bodyPlan: 'humanoid',
  voxelSize: 0.5 / 12,
  bodyMassKg: 60,
  massFractions: HUMANOID_MASS_FRACTIONS,
  params: {
    ...shamblerParams,
    height: { min: 1.75, max: 2.0 },
    girth: { min: 0.75, max: 1.0 },
    hunch: { min: 0, max: 8 },
    kneeBend: { min: 2, max: 10 },
    armRaise: { choices: [0, 0, 0, 5, 15] },
    strideFactor: { min: 1.05, max: 1.4 },
    limp: { min: 0, max: 0.15 },
    jawOpen: { choices: [0, 0, 0.2, 0.4, 0.6] },
    woundCount: { choices: [0, 0, 0, 1, 1, 2] },
  },
  feet: FEET,
  budgets: {
    totalVoxels: { min: 500, max: 2100 },
    totalTriangles: { min: 800, max: 9500 },
    groups: { head: { bones: ['head', 'jaw'], min: 60, max: 135 } },
  },
};

export const brute: Template = {
  name: 'brute',
  description: 'Tall, very broad, heavy, big hands. Coarser voxels (1/10 of a block).',
  bodyPlan: 'humanoid',
  voxelSize: 0.5 / 10,
  bodyMassKg: 140,
  massFractions: HUMANOID_MASS_FRACTIONS,
  params: {
    ...shamblerParams,
    height: { min: 2.0, max: 2.3 },
    girth: { min: 1.1, max: 1.4 },
    shoulderWidth: { min: 1.25, max: 1.55 },
    hipWidth: { min: 1.05, max: 1.3 },
    hunch: { min: 5, max: 20 },
    kneeBend: { min: 5, max: 18 },
    strideFactor: { min: 0.7, max: 1.0 },
    armSwing: { min: 3, max: 12 },
  },
  feet: FEET,
  budgets: {
    totalVoxels: { min: 500, max: 2400 },
    totalTriangles: { min: 800, max: 10_000 },
    groups: { head: { bones: ['head', 'jaw'], min: 60, max: 130 } },
  },
};

export const TEMPLATES: readonly Template[] = [shambler, runner, brute];
for (const t of TEMPLATES) {
  registerTemplate(t);
}
