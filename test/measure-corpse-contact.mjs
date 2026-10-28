import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    root: { type: 'string', default: fileURLToPath(new URL('../', import.meta.url)) },
    unprepared: { type: 'boolean', default: false },
  },
});
const root = pathToFileURL(`${resolve(values.root)}/`);
const load = (path) => import(new URL(path, root).href);
const { default: zombieContent } = await import(new URL('packages/deadvox/src/content/base/zombies.json', root), {
  with: { type: 'json' },
});
const { default: deathContent } = await import(new URL('packages/mobgen/src/mob/deathPoses.json', root), {
  with: { type: 'json' },
});
const { generateValid } = await load('packages/mobgen/src/core/generate.ts');
const { crawlerGaitPose } = await load('packages/mobgen/src/mob/crawler.ts');
const { bodyRestExtents, createGaitCache, footRestExtents, INITIAL_CLOCK, walkPose } = await load(
  'packages/mobgen/src/mob/gait.ts',
);
const reactions = await load('packages/mobgen/src/mob/reactions.ts');
const { TEMPLATES } = await load('packages/mobgen/src/mob/templates.ts');

for (const template of TEMPLATES) {
  const seeds = [
    ...new Set(
      zombieContent.zombies
        .filter((entry) => entry.model === template.name)
        .flatMap((entry) => entry.figureSeeds ?? []),
    ),
  ];
  let maximum = 0;
  let total = 0;
  let worst;
  let cases = 0;
  let buildTotal = 0;
  let buildMaximum = 0;
  let preparationTotal = 0;
  let preparationMaximum = 0;
  for (const seed of seeds) {
    const buildStart = performance.now();
    const found = generateValid(template, seed, { maxAttempts: 1 });
    if (!found) {
      throw new Error(`Invalid authored figure ${template.name}/${seed}`);
    }
    const { body, voxels } = found.realized;
    const bodyExtents = bodyRestExtents(body.bones, voxels);
    const extents = footRestExtents(body.bones, voxels);
    const actors = (template.bodyPlan === 'crawler' ? ['prone'] : ['upright', 'prone']).map((posture) => ({
      bones: body.bones,
      voxels,
      bodyExtents,
      posture,
      params: found.genome.params,
      seed,
      extents,
      cache: createGaitCache(),
    }));
    const preparationStart = performance.now();
    if (!values.unprepared) {
      for (const actor of actors) {
        reactions.prepareDeathPoses(actor);
      }
    }
    const preparation = performance.now() - preparationStart;
    const build = performance.now() - buildStart;
    preparationTotal += preparation;
    preparationMaximum = Math.max(preparationMaximum, preparation);
    buildTotal += build;
    buildMaximum = Math.max(buildMaximum, build);
    for (const actor of actors) {
      const base =
        actor.posture === 'prone' ? crawlerGaitPose(found.realized, 0.5, 1) : walkPose(actor, INITIAL_CLOCK, 0);
      for (const { id: poseId } of deathContent.poses) {
        const start = performance.now();
        reactions.deathPose(actor, base, Number.EPSILON, { direction: -1, poseId });
        const elapsed = performance.now() - start;
        total += elapsed;
        cases += 1;
        if (elapsed > maximum) {
          maximum = elapsed;
          worst = { seed, posture: actor.posture, poseId };
        }
      }
    }
  }
  process.stdout.write(
    `${JSON.stringify({
      model: template.name,
      prepared: !values.unprepared,
      cases,
      maximumMilliseconds: maximum,
      meanMilliseconds: total / cases,
      worst,
      variantBuild: {
        variants: seeds.length,
        maximumMilliseconds: buildMaximum,
        meanMilliseconds: buildTotal / seeds.length,
        totalMilliseconds: buildTotal,
      },
      preparation: {
        maximumMilliseconds: preparationMaximum,
        meanMilliseconds: preparationTotal / seeds.length,
        totalMilliseconds: preparationTotal,
      },
    })}\n`,
  );
}
