// The first standing frame after a build — the step the viewer's load crashed on (m4-2): it posed
// every body through the humanoid idle layer first, whose leg IK looks the thigh/shin/foot chain up by
// name and reads `.tail` off the result, so a body without that chain died before its own pose layer
// could run. These cases pin the dispatch itself: each plan stands through its own pose layer.

import { describe, expect, it } from 'vitest';
import { generate, type Realized, realize } from '../src/core/generate.ts';
import type { Pose } from '../src/core/pose.ts';
import type { BodyPlan, Template } from '../src/core/template.ts';
import { crawlerPose } from '../src/mob/crawler.ts';
import { dogPose } from '../src/mob/dog.ts';
import { dogM3Template, dogTemplate } from '../src/mob/dogTemplate.ts';
import { createGaitCache, footRestExtents, type WalkActor } from '../src/mob/gait.ts';
import type { HumanoidParams } from '../src/mob/humanoid.ts';
import { idlePose } from '../src/mob/idle.ts';
import { quadrupedPose } from '../src/mob/quadrupedPose.ts';
import { type StandInputs, standPose } from '../src/mob/standPose.ts';
import { TEMPLATES } from '../src/mob/templates.ts';

const shambler = TEMPLATES.find((template) => template.name === 'shambler')!;
const crawler = TEMPLATES.find((template) => template.name === 'crawler')!;

/** Each plan, one template for it, and the plan's own standing layer — the dispatch's ground truth. */
const CASES: readonly (readonly [
  Exclude<BodyPlan, 'amalgam'>,
  Template,
  number,
  (realized: Realized, inputs: StandInputs) => Pose,
])[] = [
  ['humanoid', shambler, 1, (_realized, inputs) => idlePose(inputs.walkActor, inputs.idleStance, inputs.idleTime)],
  ['crawler', crawler, 1, (realized) => crawlerPose(realized)],
  ['dog', dogM3Template, 1, (realized, inputs) => dogPose(realized, inputs.dogStance)],
  ['quadruped', dogTemplate, 7, (realized) => quadrupedPose(realized)],
];

describe('standPose', () => {
  it('stands each body plan through its own pose layer', () => {
    for (const [plan, template, seed, ownStand] of CASES) {
      const genome = generate(template, seed);
      const realized = realize(genome);
      // The same rig shape mobgen/src/viewer/main.ts, load builds per loaded figure.
      const walkActor: WalkActor = {
        bones: realized.body.bones,
        extents: footRestExtents(realized.body.bones, realized.voxels),
        params: genome.params as HumanoidParams,
        seed: genome.seed,
        cache: createGaitCache(),
      };
      const inputs: StandInputs = { walkActor, idleStance: 'slack', idleTime: 0 };
      expect(standPose(plan, realized, inputs), `the ${plan} plan must stand through its own pose layer`).toEqual(
        ownStand(realized, inputs),
      );
    }
  });
});
