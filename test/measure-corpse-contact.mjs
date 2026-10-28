import { performance } from 'node:perf_hooks';
import process from 'node:process';
import zombieContent from '../packages/deadvox/src/content/base/zombies.json' with { type: 'json' };
import { generateValid } from '../packages/mobgen/src/core/generate.ts';
import { crawlerGaitPose } from '../packages/mobgen/src/mob/crawler.ts';
import deathContent from '../packages/mobgen/src/mob/deathPoses.json' with { type: 'json' };
import {
  bodyRestExtents,
  createGaitCache,
  footRestExtents,
  INITIAL_CLOCK,
  walkPose,
} from '../packages/mobgen/src/mob/gait.ts';
import { DEATH_FALL_DURATION, deathPose } from '../packages/mobgen/src/mob/reactions.ts';
import { TEMPLATES } from '../packages/mobgen/src/mob/templates.ts';

for (const template of TEMPLATES) {
  const seeds = [
    ...new Set(
      zombieContent.zombies
        .filter((entry) => entry.model === template.name)
        .flatMap((entry) => entry.figureSeeds ?? []),
    ),
  ];
  let maximum = 0;
  let worst;
  let cases = 0;
  for (const seed of seeds) {
    const found = generateValid(template, seed, { maxAttempts: 1 });
    if (!found) {
      throw new Error(`Invalid authored figure ${template.name}/${seed}`);
    }
    const { body, voxels } = found.realized;
    const bodyExtents = bodyRestExtents(body.bones, voxels);
    for (const posture of template.bodyPlan === 'crawler' ? ['prone'] : ['upright', 'prone']) {
      const actor = {
        bones: body.bones,
        voxels,
        bodyExtents,
        posture,
        params: found.genome.params,
        seed,
        extents: footRestExtents(body.bones, voxels),
        cache: createGaitCache(),
      };
      const base = posture === 'prone' ? crawlerGaitPose(found.realized, 0.5, 1) : walkPose(actor, INITIAL_CLOCK, 0);
      for (const { id: poseId } of deathContent.poses) {
        const start = performance.now();
        deathPose(actor, base, DEATH_FALL_DURATION, { direction: -1, poseId });
        const elapsed = performance.now() - start;
        cases += 1;
        if (elapsed > maximum) {
          maximum = elapsed;
          worst = { seed, posture, poseId };
        }
      }
    }
  }
  process.stdout.write(`${JSON.stringify({ model: template.name, cases, maximumMilliseconds: maximum, worst })}\n`);
}
