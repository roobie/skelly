// The joint angles a pose reports (Pose.angles / clipAngles, see core/pose.ts) must recompose to the
// pose's own matrices. The composition order per bone is written down twice on purpose — in pose.ts's doc
// comment and in ORDER below — so changing how the walk composes a bone fails here instead of silently
// leaving a joint-limits check reading angles that no longer mean what it thinks.

import { describe, expect, it } from 'vitest';
import { generate, realize } from '../src/core/generate.ts';
import { type Mat3, mulMM, rotX, rotY, rotZ } from '../src/core/math.ts';
import type { EulerDeg, Pose } from '../src/core/pose.ts';
import { ATTACK_CLIPS, attackPose, blendArmBase } from '../src/mob/attack.ts';
import {
  advanceClock,
  footRestExtents,
  type GaitClock,
  INITIAL_CLOCK,
  legGeometryFor,
  type WalkActor,
  walkPose,
} from '../src/mob/gait.ts';
import type { HumanoidParams } from '../src/mob/humanoid.ts';
import { TEMPLATES } from '../src/mob/templates.ts';

const LUNGE_GRAB = ATTACK_CLIPS.LUNGE_GRAB!;
const TOL = 1e-9;

type Axis = 'x' | 'y' | 'z';
const ROT = { x: rotX, y: rotY, z: rotZ } as const;

/** Leftmost = outermost, i.e. ['z','x'] is rotZ(z) ∘ rotX(x) = mulMM(rotZ(z), rotX(x)). */
const compose = (order: readonly Axis[], [x, y, z]: EulerDeg): Mat3 => {
  const angle: Record<Axis, number> = { x, y, z };
  return order.map((a) => ROT[a](angle[a])).reduce((acc, m) => mulMM(acc, m));
};

const ORDER: Readonly<Record<string, readonly Axis[]>> = {
  pelvis: ['x', 'z', 'y'],
  spine: ['z', 'y'],
  chest: ['z'],
  head: ['z', 'x'],
  jaw: ['x'],
  'upperArm.L': ['z', 'x'],
  'upperArm.R': ['z', 'x'],
  'forearm.L': ['x'],
  'forearm.R': ['x'],
  'thigh.L': ['y', 'z', 'x'],
  'thigh.R': ['y', 'z', 'x'],
  'shin.L': ['x'],
  'shin.R': ['x'],
};
const CLIP_ORDER: readonly Axis[] = ['z', 'y', 'x'];
const DERIVED = new Set(['foot.L', 'foot.R']); // matrix is the world-level inverse chain, not angles
const ARM_BONE = /^(upperArm|forearm)\./;

const maxDiff = (a: Mat3, b: Mat3): number => Math.max(...a.map((v, i) => Math.abs(v - b[i]!)));

const SEEDS = [1, 2, 3, 7];
const SPEEDS = [0.8, 1.4, 2.8];
const DISTANCES = [0, 0.13, 0.4, 0.75, 1.1, 1.9, 3.3];
// Includes fractional arm-fade weights (t < 0.18 and t > 0.72 for the 0.9 s clip) as well as 0 and 1.
const ATTACK_TIMES = [0, 0.05, 0.1, 0.17, 0.2, 0.45, 0.7, 0.75, 0.85, 0.9];

const actorFor = (templateName: string, seed: number) => {
  const template = TEMPLATES.find((t) => t.name === templateName)!;
  const genome = generate(template, seed);
  const { body, voxels } = realize(genome);
  const extents = footRestExtents(body.bones, voxels);
  const params = genome.params as HumanoidParams;
  const geomL = legGeometryFor(body.bones, extents, 'L');
  const actor: WalkActor = { bones: body.bones, extents, params, seed: genome.seed };
  return { actor, geomL, params, seed: genome.seed };
};
type Fixture = ReturnType<typeof actorFor>;

const clocksFor = (fixture: Fixture, speed: number): GaitClock[] => {
  let clock = INITIAL_CLOCK;
  return DISTANCES.map((distance) => {
    clock = advanceClock(clock, distance, { params: fixture.params, geomL: fixture.geomL, speed, seed: fixture.seed });
    return clock;
  });
};

// The checks below return a list of problems (empty = fine) so the assertions stay inside the it() blocks.

const walkProblems = (pose: Pose): string[] => {
  const problems: string[] = [];
  const angles = pose.angles ?? {};
  for (const [bone, r] of Object.entries(pose.rotations)) {
    const order = ORDER[bone];
    const a = angles[bone];
    if (DERIVED.has(bone)) {
      if (a !== undefined) {
        problems.push(`${bone} is derived but reports angles`);
      }
    } else if (order === undefined || a === undefined) {
      problems.push(`${bone} has no recorded order or angles`);
    } else if (maxDiff(compose(order, a), r) >= TOL) {
      problems.push(`${bone} does not recompose`);
    }
  }
  for (const bone of Object.keys(angles)) {
    if (pose.rotations[bone] === undefined) {
      problems.push(`${bone} reports angles but no rotation`);
    }
  }
  return problems;
};

const attackProblems = (base: Pose, attacked: Pose, time: number): string[] => {
  const problems: string[] = [];
  const clipAngles = attacked.clipAngles ?? {};
  const weight = attacked.armWalkWeight ?? Number.NaN;
  for (const [bone, clip] of Object.entries(clipAngles)) {
    const walkR = compose(ORDER[bone]!, base.angles![bone]!);
    const blended = ARM_BONE.test(bone) ? blendArmBase(walkR, weight) : walkR;
    const expected = mulMM(blended, compose(CLIP_ORDER, clip));
    if (!(maxDiff(expected, attacked.rotations[bone]!) < TOL)) {
      problems.push(`${bone} does not recompose at t=${time}`);
    }
  }
  for (const [bone, r] of Object.entries(base.rotations)) {
    if (!(bone in clipAngles) && maxDiff(r, attacked.rotations[bone]!) !== 0) {
      problems.push(`${bone} is untouched by the clip but changed at t=${time}`);
    }
  }
  return problems;
};

const attackFixtureProblems = (fixture: Fixture): string[] => {
  const problems: string[] = [];
  for (const speed of SPEEDS) {
    for (const clock of clocksFor(fixture, speed)) {
      const base = walkPose(fixture.actor, clock, speed, true);
      for (const time of ATTACK_TIMES) {
        const attacked = attackPose(fixture.actor, LUNGE_GRAB, time, base);
        const layered = attacked.angles === base.angles && Object.keys(attacked.clipAngles ?? {}).length > 0;
        problems.push(...(layered ? [] : [`t=${time} lost the walk or clip layer`]));
        problems.push(...attackProblems(base, attacked, time));
      }
    }
  }
  return problems;
};

describe('Pose.angles recompose to the walk matrices', () => {
  for (const template of TEMPLATES) {
    it(`${template.name}: every angle-carrying bone, seeds x speeds x phases, within ${TOL}`, () => {
      const problems: string[] = [];
      for (const seed of SEEDS) {
        const fixture = actorFor(template.name, seed);
        for (const speed of SPEEDS) {
          for (const clock of clocksFor(fixture, speed)) {
            const pose = walkPose(fixture.actor, clock, speed, true);
            problems.push(...walkProblems(pose));
            // Recording angles must not change a single matrix or the root.
            const plain = walkPose(fixture.actor, clock, speed);
            expect(plain.angles).toBeUndefined();
            expect(pose.root).toEqual(plain.root);
            expect(pose.rotations).toEqual(plain.rotations);
          }
        }
      }
      expect(problems).toEqual([]);
    });
  }

  it('a standing pose (speed 0) reports empty angles, matching its empty rotations', () => {
    const fixture = actorFor('shambler', 1);
    const pose = walkPose(fixture.actor, INITIAL_CLOCK, 0, true);
    expect(pose.angles).toEqual({});
    expect(pose.rotations).toEqual({});
  });
});

describe('attackPose clipAngles recompose to the attacked matrices', () => {
  for (const template of TEMPLATES) {
    it(`${template.name}: walk layer x clip layer (with the arm fade weight) within ${TOL}`, () => {
      const problems = SEEDS.flatMap((seed) => attackFixtureProblems(actorFor(template.name, seed)));
      expect(problems).toEqual([]);
    });
  }

  it('without walk angles the attack pose carries none either', () => {
    const fixture = actorFor('shambler', 1);
    const base = walkPose(fixture.actor, { stepIndex: 2, progress: 0.3 }, 1.4);
    const attacked = attackPose(fixture.actor, LUNGE_GRAB, 0.45, base);
    expect(attacked.angles).toBeUndefined();
    expect(attacked.clipAngles).toBeUndefined();
  });
});
