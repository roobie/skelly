// Crowd CPU bench (mobgen/PROJECT.md's deadvox target: 60 active zombies at 60 fps). Times:
//   1. generating `--pool` distinct valid actors — the same valid-seed search main.ts's "only valid"
//      checkbox and stress.ts's pool use (generate, realize, keep the first PASS per template slot).
//   2. walkPose + boneTransforms — the CPU cost every render path (bones or skinned) pays once per
//      actor per frame, regardless of how it's drawn — for 60 and 240 simulated actors over 600 frames
//      at 60 fps.
//   npm run bench
//   npm run bench -- --pool 20 --frames 300
//
// See src/viewer/stress.ts / stressActors.ts for the in-browser version of the same pool and walk
// simulation, with an actual renderer attached.

import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { generate, realize } from '../core/generate.ts';
import { boneTransforms } from '../core/pose.ts';
import { range, seededRng } from '../core/random.ts';
import type { Genome, Template } from '../core/template.ts';
import {
  advanceClock,
  footRestExtents,
  type GaitClock,
  INITIAL_CLOCK,
  type LegGeometry,
  legGeometryFor,
  type WalkActor,
  walkPose,
} from '../mob/gait.ts';
import type { HumanoidParams } from '../mob/humanoid.ts';
import { TEMPLATES } from '../mob/templates.ts';

const { values } = parseArgs({
  options: {
    pool: { type: 'string', default: '12' },
    frames: { type: 'string', default: '600' },
  },
});
const poolSize = Number(values.pool);
const frameCount = Number(values.frames);
if (!(Number.isInteger(poolSize) && poolSize > 0)) {
  console.error('--pool must be a positive integer');
  process.exit(2);
}
if (!(Number.isInteger(frameCount) && frameCount > 0)) {
  console.error('--frames must be a positive integer');
  process.exit(2);
}

interface PoolEntry {
  readonly genome: Genome;
  readonly walkActor: WalkActor;
  readonly legGeometryL: LegGeometry;
}

/** Same search as core/generate.ts's generateValid, duplicated (not imported) so this also times the
 * failed attempts along the way, same as stress.ts's pool build does. */
const findValid = (
  template: Template,
  fromSeed: number,
  maxAttempts = 100,
): { readonly genome: Genome } | undefined => {
  for (let i = 0; i < maxAttempts; i++) {
    const genome = generate(template, fromSeed + i);
    if (realize(genome).report.ok) {
      return { genome };
    }
  }
  return undefined;
};

console.log(
  `generating ${poolSize} pool actor${poolSize === 1 ? '' : 's'} (templates cycling shambler/runner/brute)\n`,
);

const pool: PoolEntry[] = [];
let nextSeed = 1;
let genTotalMs = 0;
let genMaxMs = 0;
for (let i = 0; i < poolSize; i++) {
  const template = TEMPLATES[i % TEMPLATES.length]!;
  const t0 = performance.now();
  const found = findValid(template, nextSeed);
  const ms = performance.now() - t0;
  if (!found) {
    console.error(`no valid ${template.name} within 100 seeds of ${nextSeed}`);
    process.exit(1);
  }
  genTotalMs += ms;
  genMaxMs = Math.max(genMaxMs, ms);
  const { genome } = found;
  nextSeed = genome.seed + 1;
  const realized = realize(genome);
  const extents = footRestExtents(realized.body.bones, realized.voxels);
  const legGeometryL = legGeometryFor(realized.body.bones, extents, 'L');
  const walkActor: WalkActor = {
    bones: realized.body.bones,
    extents,
    params: genome.params as HumanoidParams,
    seed: genome.seed,
  };
  pool.push({ genome, walkActor, legGeometryL });
}
console.log(
  `generation: total ${genTotalMs.toFixed(2)} ms, mean ${(genTotalMs / poolSize).toFixed(3)} ms/actor, max ${genMaxMs.toFixed(2)} ms\n`,
);

interface SimActor {
  readonly poolIndex: number;
  readonly speed: number;
  clock: GaitClock;
}

/** Same deterministic per-actor speed draw as stress.ts's buildCrowd (mulberry32, 0.8-2.8 m/s). */
const makeSimActors = (n: number): SimActor[] =>
  Array.from({ length: n }, (_, i) => {
    const rng = seededRng(i + 1);
    return { poolIndex: i % pool.length, speed: range(rng, 0.8, 2.8), clock: INITIAL_CLOCK };
  });

const DT = 1 / 60;

const benchN = (n: number): void => {
  const actors = makeSimActors(n);
  const t0 = performance.now();
  for (let frame = 0; frame < frameCount; frame++) {
    for (const actor of actors) {
      const entry = pool[actor.poolIndex]!;
      actor.clock = advanceClock(actor.clock, actor.speed * DT, {
        params: entry.walkActor.params,
        geomL: entry.legGeometryL,
        speed: actor.speed,
        seed: entry.walkActor.seed,
      });
      const pose = walkPose(entry.walkActor, actor.clock, actor.speed);
      boneTransforms(entry.walkActor.bones, pose); // the per-frame matrix-write cost both render paths pay
    }
  }
  const totalMs = performance.now() - t0;
  const msPerFrame = totalMs / frameCount;
  const usPerActorPerFrame = (totalMs * 1000) / (frameCount * n);
  console.log(
    `n=${n}: ${totalMs.toFixed(0)} ms over ${frameCount} frames — ${msPerFrame.toFixed(3)} ms/frame, ${usPerActorPerFrame.toFixed(2)} µs/actor/frame`,
  );
};

console.log(`walkPose + boneTransforms, ${frameCount} simulated frames at 60 fps:\n`);
for (const n of [60, 240]) {
  benchN(n);
}
