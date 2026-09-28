// Golden-equivalence guard for the posing hot path (mobgen/CHALLENGES.md §1: ~75 µs/actor/frame in
// the browser, aiming for ~20 µs). Records walkPose/attackPose/boneTransforms/advanceClock outputs from
// the pre-optimization code across templates, seeds, speeds, many clock values and attack times, and
// pins them with toMatchSnapshot. A later change to gait.ts/steps.ts/attack.ts/pose.ts that alters any
// of these outputs by more than ~1e-9 (rad/m) fails this test — caching and allocation changes must not
// change what the walk looks like. A snapshot change here means the walk itself changed: check that's
// intentional (and regenerate with `vitest -u`), don't just accept the diff.

import { expect, it } from 'vitest';
import { generate, generateValid, realize } from '../src/core/generate.ts';
import type { Mat3, Vec3 } from '../src/core/math.ts';
import { boneTransforms, type Pose } from '../src/core/pose.ts';
import { ATTACK_CLIPS, attackPose } from '../src/mob/attack.ts';
import {
  advanceClock,
  footRestExtents,
  type GaitClock,
  INITIAL_CLOCK,
  legGeometryFor,
  walkPose,
} from '../src/mob/gait.ts';
import type { HumanoidParams } from '../src/mob/humanoid.ts';
import { TEMPLATES } from '../src/mob/templates.ts';

const LUNGE_GRAB = ATTACK_CLIPS.LUNGE_GRAB!;
const SEEDS = [1, 2, 3];
const SPEEDS = [0.8, 1.4, 2.8];
// Distances advanceClock is fed in sequence, from a fresh clock each speed — walks the clock through
// several steps (varying stepIndex and progress) without depending on advanceClock's own internals.
const DISTANCES = [0, 0.2, 0.5, 0.9, 1.5, 2.3];
const ATTACK_TIMES = [0, 0.2, 0.45, 0.7, 0.9]; // spans windup, hitTime and recovery (LUNGE_GRAB.duration = 0.9)

// Numbers are joined into one comma-separated string per vector/matrix (rather than left as arrays) so
// the default snapshot serializer prints one line per vector/matrix instead of one line per component —
// the golden record has thousands of them, and this keeps the .snap file (and its diffs) readable.

/** Rounds to 9 decimal places (the equivalence tolerance) and folds -0 to 0, so the snapshot doesn't
 * churn on harmless last-bit float noise while still catching a genuine >=1e-9 change. */
const round = (x: number): number => {
  const r = Number(x.toFixed(9));
  return r === 0 ? 0 : r;
};
const fmtVec3 = (v: Vec3): string => v.map(round).join(',');
const fmtMat3 = (m: Mat3): string => m.map(round).join(',');

const roundPose = (pose: Pose): unknown => ({
  root: fmtVec3(pose.root),
  rotations: Object.fromEntries(
    Object.keys(pose.rotations)
      .sort()
      .map((id) => [id, fmtMat3(pose.rotations[id]!)]),
  ),
});

const roundClock = (clock: GaitClock): string => `${clock.stepIndex}@${round(clock.progress)}`;

const roundTransforms = (transforms: ReadonlyMap<string, { readonly r: Mat3; readonly t: Vec3 }>): unknown =>
  Object.fromEntries(
    [...transforms.keys()].sort().map((id) => {
      const t = transforms.get(id)!;
      return [id, `${fmtMat3(t.r)} | ${fmtVec3(t.t)}`];
    }),
  );

for (const template of TEMPLATES) {
  for (const seed of SEEDS) {
    it(`${template.name} seed ${seed}: walkPose/attackPose/boneTransforms/advanceClock match the golden record`, () => {
      // generate (not generateValid): the golden record only needs a stable body, not a passing one —
      // seeds 1-3 as given, so this doesn't quietly drift onto different bodies if validation changes.
      const genome = generate(template, seed);
      const realized = realize(genome);
      const extents = footRestExtents(realized.body.bones, realized.voxels);
      const legGeometryL = legGeometryFor(realized.body.bones, extents, 'L');
      const params = genome.params as HumanoidParams;
      const walkActor = { bones: realized.body.bones, extents, params, seed: genome.seed };

      const record: unknown[] = [];
      for (const speed of SPEEDS) {
        let clock: GaitClock = INITIAL_CLOCK;
        for (const distance of DISTANCES) {
          clock = advanceClock(clock, distance, { params, geomL: legGeometryL, speed, seed: genome.seed });
          record.push({ kind: 'clock', speed, distance, clock: roundClock(clock) });

          const pose = walkPose(walkActor, clock, speed);
          record.push({ kind: 'walkPose', speed, distance, pose: roundPose(pose) });

          const transforms = boneTransforms(realized.body.bones, pose);
          record.push({ kind: 'boneTransforms', speed, distance, transforms: roundTransforms(transforms) });

          for (const attackTime of ATTACK_TIMES) {
            const attacked = attackPose(walkActor, LUNGE_GRAB, attackTime, pose);
            record.push({ kind: 'attackPose', speed, distance, attackTime, pose: roundPose(attacked) });
          }
        }
      }
      expect(record).toMatchSnapshot();
    });
  }
}

it('generateValid still finds a passing build for every template (sanity: the golden bodies above are real rigs)', () => {
  for (const template of TEMPLATES) {
    expect(generateValid(template, 1)).toBeDefined();
  }
});
