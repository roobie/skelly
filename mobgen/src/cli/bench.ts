// Crowd CPU bench (mobgen/PROJECT.md's deadvox target: 60 active zombies at 60 fps; see
// mobgen/CHALLENGES.md §1 for the measured browser numbers this tracks). Times:
//   1. generating `--pool` distinct valid actors — the same valid-seed search main.ts's "only valid"
//      checkbox and stress.ts's pool use (generate, realize, keep the first PASS per template slot).
//   2. the full per-frame posing cost stress.ts's crowd simulation pays per actor: advanceClock, ~10%
//      of actors periodically layering attackPose over the walk (same LUNGE_GRAB clip, same cadence), an
//      allocation-free FK pass (boneTransformsInto) and a matrix write into a Float32Array (the same
//      shape a renderer's per-actor bone matrix buffer would be) — for 60 and 240 simulated actors over
//      600 frames at 60 fps.
//   npm run bench
//   npm run bench -- --pool 20 --frames 300
//
// See src/viewer/stress.ts / stressActors.ts for the in-browser version of the same pool and crowd
// simulation, with an actual renderer attached.

import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { generateValid } from '../core/generate.ts';
import {
  allocateBoneTransforms,
  boneTransformsInto,
  indexBonesByParent,
  type MutableTransform,
  type ParentIndex,
  type Pose,
} from '../core/pose.ts';
import { chance, range, seededRng } from '../core/random.ts';
import type { Genome } from '../core/template.ts';
import { ATTACK_CLIPS, attackPose } from '../mob/attack.ts';
import {
  advanceClock,
  createGaitCache,
  footRestExtents,
  type GaitClock,
  type LegGeometry,
  legGeometryFor,
  type WalkActor,
  walkPose,
} from '../mob/gait.ts';
import type { HumanoidParams } from '../mob/humanoid.ts';
import { idleBasePose } from '../mob/idle.ts';
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

const LUNGE_GRAB = ATTACK_CLIPS.LUNGE_GRAB!;
const ATTACKER_FRACTION = 0.1; // matches stress.ts's crowd

interface PoolEntry {
  readonly genome: Genome;
  readonly walkActor: WalkActor;
  readonly legGeometryL: LegGeometry;
  readonly parentIndex: ParentIndex;
}

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
  const found = generateValid(template, nextSeed);
  const ms = performance.now() - t0;
  if (!found) {
    console.error(`no valid ${template.name} within 100 seeds of ${nextSeed}`);
    process.exit(1);
  }
  genTotalMs += ms;
  genMaxMs = Math.max(genMaxMs, ms);
  const { genome, realized } = found;
  nextSeed = genome.seed + 1;
  const extents = footRestExtents(realized.body.bones, realized.voxels);
  const legGeometryL = legGeometryFor(realized.body.bones, extents, 'L');
  const walkActor: WalkActor = {
    bones: realized.body.bones,
    extents,
    params: genome.params as HumanoidParams,
    seed: genome.seed,
  };
  pool.push({ genome, walkActor, legGeometryL, parentIndex: indexBonesByParent(realized.body.bones) });
}
console.log(
  `generation: total ${genTotalMs.toFixed(2)} ms, mean ${(genTotalMs / poolSize).toFixed(3)} ms/actor, max ${genMaxMs.toFixed(2)} ms\n`,
);

interface SimActor {
  readonly poolIndex: number;
  /** This actor's own WalkActor: shares the pool entry's bones/extents/params/seed, but with its own
   * GaitCache. Several sim actors reference the same pool entry (and so the same params object) at
   * different speeds and different current stepIndex — footfallPeak's cache must be per actor or it
   * thrashes on almost every call (see mob/gait.ts's GaitCache; how much slower that was was not recorded). */
  readonly walkActor: WalkActor;
  /** Static idle stance (see mob/idle.ts) this actor eases toward/from at low speed — computed once, not
   * per frame, same reasoning as stress.ts's CrowdMember.idleBase. */
  readonly idleBase: Pose;
  readonly speed: number;
  readonly attacker: boolean;
  readonly attackIntervalS: number;
  clock: GaitClock;
  attackTime: number | undefined;
  attackCooldown: number;
  /** Allocated once per actor, reused every frame (mirrors stressActors.ts's per-actor scratch). */
  readonly scratch: MutableTransform[];
  /** The "upload buffer" a renderer would read bone matrices from — one 4x4 (column-major) per bone. */
  readonly matrices: Float32Array;
}

/** Same deterministic per-actor draws as stress.ts's buildCrowd (mulberry32): speed, and (new here) an
 * attacker flag/cadence for the ~10% of actors that periodically layer LUNGE_GRAB over their walk. */
const makeSimActors = (n: number): SimActor[] =>
  Array.from({ length: n }, (_, i) => {
    const rng = seededRng(i + 1);
    const poolIndex = i % pool.length;
    const boneCount = pool[poolIndex]!.walkActor.bones.length;
    const attacker = chance(rng, ATTACKER_FRACTION);
    const attackIntervalS = range(rng, 2, 5);
    const walkActor: WalkActor = { ...pool[poolIndex]!.walkActor, cache: createGaitCache() };
    return {
      poolIndex,
      walkActor,
      idleBase: idleBasePose(walkActor, attacker ? 'aggravated' : 'slack'),
      speed: range(rng, 0.8, 2.8),
      attacker,
      attackIntervalS,
      clock: { stepIndex: Math.floor(range(rng, 0, 8)), progress: rng() },
      attackTime: undefined,
      attackCooldown: attacker ? range(rng, 0, attackIntervalS) : Number.POSITIVE_INFINITY,
      scratch: allocateBoneTransforms(boneCount),
      matrices: new Float32Array(boneCount * 16),
    };
  });

const DT = 1 / 60;

/** Writes one bone's Transform into `out` at `offset`, in the same column-major 4x4 layout
 * stressActors.ts's writeMatrix hands three.js (see that file for why: this is the actual shape a
 * renderer consumes, not just r/t as separate arrays). */
const writeMatrixInto = (out: Float32Array, offset: number, t: MutableTransform): void => {
  const r = t.r;
  const p = t.t;
  out[offset] = r[0];
  out[offset + 1] = r[3];
  out[offset + 2] = r[6];
  out[offset + 3] = 0;
  out[offset + 4] = r[1];
  out[offset + 5] = r[4];
  out[offset + 6] = r[7];
  out[offset + 7] = 0;
  out[offset + 8] = r[2];
  out[offset + 9] = r[5];
  out[offset + 10] = r[8];
  out[offset + 11] = 0;
  out[offset + 12] = p[0];
  out[offset + 13] = p[1];
  out[offset + 14] = p[2];
  out[offset + 15] = 1;
};

/** Advances one actor's attack cooldown/timer by one frame — same shape as stress.ts's advanceMember,
 * split out so benchN itself stays under the linter's complexity budget. */
const advanceAttack = (actor: SimActor): void => {
  if (actor.attacker) {
    actor.attackCooldown -= DT;
    if (actor.attackCooldown <= 0) {
      actor.attackTime = 0;
      actor.attackCooldown = actor.attackIntervalS;
    }
  }
  if (actor.attackTime !== undefined) {
    actor.attackTime += DT;
    if (actor.attackTime > LUNGE_GRAB.duration) {
      actor.attackTime = undefined;
    }
  }
};

/** One actor's per-frame cost: advance its walk clock and attack state, pose it (walk, or walk +
 * attackPose while lunging), then FK + write its bone matrices — everything stress.ts's crowd pays for
 * every actor every frame. */
const updateActor = (actor: SimActor): void => {
  const entry = pool[actor.poolIndex]!;
  // geomL/parentIndex are shared across every actor referencing this pool entry — fine, they're constant
  // for a given body (strideCap's own cache, keyed on params and validated against the geometry, is
  // correctly shared too). Only the per-actor walkActor.cache needs to be this actor's own (see SimActor).
  actor.clock = advanceClock(actor.clock, actor.speed * DT, {
    params: actor.walkActor.params,
    geomL: entry.legGeometryL,
    speed: actor.speed,
    seed: actor.walkActor.seed,
    cache: actor.walkActor.cache,
  });
  advanceAttack(actor);
  const basePose = walkPose(actor.walkActor, actor.clock, actor.speed, { idle: actor.idleBase });
  const pose =
    actor.attackTime === undefined ? basePose : attackPose(actor.walkActor, LUNGE_GRAB, actor.attackTime, basePose);
  boneTransformsInto(actor.walkActor.bones, pose, entry.parentIndex, actor.scratch);
  for (let i = 0; i < actor.scratch.length; i++) {
    writeMatrixInto(actor.matrices, i * 16, actor.scratch[i]!);
  }
};

const benchN = (n: number): void => {
  const actors = makeSimActors(n);
  const t0 = performance.now();
  for (let frame = 0; frame < frameCount; frame++) {
    for (const actor of actors) {
      updateActor(actor);
    }
  }
  const totalMs = performance.now() - t0;
  const msPerFrame = totalMs / frameCount;
  const usPerActorPerFrame = (totalMs * 1000) / (frameCount * n);
  console.log(
    `n=${n}: ${totalMs.toFixed(0)} ms over ${frameCount} frames — ${msPerFrame.toFixed(3)} ms/frame, ${usPerActorPerFrame.toFixed(2)} µs/actor/frame`,
  );
};

console.log(`walk + ~10% attackers + FK + matrix write, ${frameCount} simulated frames at 60 fps:\n`);
for (const n of [60, 240]) {
  benchN(n);
}
