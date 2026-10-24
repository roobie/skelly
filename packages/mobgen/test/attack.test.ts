import { describe, expect, it } from 'vitest';
import { generateValid } from '../src/core/generate.ts';
import { applyPoint, IDENTITY_M } from '../src/core/math.ts';
import { boneTransforms, type Pose } from '../src/core/pose.ts';
import { attackPose, LUNGE_GRAB } from '../src/mob/attack.ts';
import {
  advanceClock,
  corners,
  createGaitCache,
  footRestExtents,
  type GaitBasis,
  type GaitClock,
  INITIAL_CLOCK,
  legGeometryFor,
  walkPose,
} from '../src/mob/gait.ts';
import type { HumanoidParams } from '../src/mob/humanoid.ts';
import { HUMANOID_TEMPLATES, TEMPLATES } from '../src/mob/templates.ts';

const setup = (name: string, seed = 1) => {
  const t = TEMPLATES.find((x) => x.name === name)!;
  const found = generateValid(t, seed)!;
  const { body, voxels } = found.realized;
  const extents = footRestExtents(body.bones, voxels);
  return { body, voxels, extents, params: found.genome.params as HumanoidParams, seed: found.genome.seed };
};

const actorOf = (found: ReturnType<typeof setup>) => ({
  bones: found.body.bones,
  extents: found.extents,
  params: found.params,
  seed: found.seed,
  cache: createGaitCache(),
});

const CLIP = LUNGE_GRAB;

/** Walk clock advances with distance, same mechanic the viewer uses — see advanceClock's doc comment. */
const clockTrack = (setupResult: ReturnType<typeof setup>, speed: number) => {
  const { body, extents, params, seed } = setupResult;
  const geomL = legGeometryFor(body.bones, extents, 'L');
  const basis: GaitBasis = { params, geomL, speed, seed };
  let clock: GaitClock = INITIAL_CLOCK;
  return {
    at: (dt: number): GaitClock => {
      clock = advanceClock(clock, speed * dt, basis);
      return clock;
    },
  };
};

/** Worst absolute difference between `pose` and `walkBase` — root Y and every bone's rotation matrix,
 * treating a missing entry on either side as identity (boneTransforms' own convention). Returned rather
 * than asserted here so the `it()` caller does the actual expect(). */
const maxPoseDiff = (pose: Pose, walkBase: Pose): number => {
  let worst = Math.abs(pose.root[1] - walkBase.root[1]);
  for (const boneId of new Set([...Object.keys(pose.rotations), ...Object.keys(walkBase.rotations)])) {
    const a = pose.rotations[boneId] ?? IDENTITY_M;
    const b = walkBase.rotations[boneId] ?? IDENTITY_M;
    for (let k = 0; k < 9; k++) {
      worst = Math.max(worst, Math.abs(a[k]! - b[k]!));
    }
  }
  return worst;
};

describe('attackPose', () => {
  for (const name of HUMANOID_TEMPLATES.map((t) => t.name)) {
    it(`${name}: pose at time 0 and at duration equals the base pose`, () => {
      const found = setup(name);
      const actor = actorOf(found);
      for (const speed of [0, 0.8, 2.8]) {
        const walkBase = walkPose(actor, { stepIndex: 0, progress: 0.2 }, speed);
        for (const time of [0, CLIP.duration]) {
          expect(maxPoseDiff(attackPose(actor, CLIP, time, walkBase), walkBase)).toBeLessThan(1e-9);
        }
      }
    });
  }

  const lowestFootY = (
    bones: ReturnType<typeof setup>['body']['bones'],
    extents: ReturnType<typeof setup>['extents'],
    pose: Pose,
  ): number => {
    const transforms = boneTransforms(bones, pose);
    let lowest = Number.POSITIVE_INFINITY;
    for (const footBone of ['foot.L', 'foot.R']) {
      for (const c of corners(extents.get(footBone)!)) {
        const [, y] = applyPoint(transforms.get(footBone)!, c);
        lowest = Math.min(lowest, y);
      }
    }
    return lowest;
  };

  for (const name of HUMANOID_TEMPLATES.map((t) => t.name)) {
    it(`${name}: the lowest foot point stays within half a voxel of the ground throughout the attack`, () => {
      const found = setup(name);
      const { body, voxels, extents } = found;
      const actor = actorOf(found);
      const track = clockTrack(found, 0.8);
      const n = 100;
      const dt = CLIP.duration / n;
      for (let i = 0; i <= n; i++) {
        const clock = track.at(i === 0 ? 0 : dt);
        const pose = attackPose(actor, CLIP, i * dt, walkPose(actor, clock, 0.8));
        expect(Math.abs(lowestFootY(body.bones, extents, pose))).toBeLessThanOrEqual(voxels.size / 2 + 1e-6);
      }
    });
  }

  for (const name of HUMANOID_TEMPLATES.map((t) => t.name)) {
    for (const seed of [1, 2, 3]) {
      it(`${name} seed ${seed}: at hitTime, hands reach forward without crossing`, () => {
        const found = setup(name, seed);
        const { body } = found;
        const actor = actorOf(found);
        const walkBase = walkPose(actor, { stepIndex: 0, progress: 0.2 }, 0.8);
        const pose = attackPose(actor, CLIP, CLIP.hitTime, walkBase);
        const transforms = boneTransforms(body.bones, pose);
        const chest = body.bones.find((b) => b.id === 'chest')!;
        const [, , chestHeadZ] = applyPoint(transforms.get('chest')!, chest.head);

        const tipXs: number[] = [];
        for (const side of ['L', 'R']) {
          const hand = body.bones.find((b) => b.id === `hand.${side}`)!;
          const tip = applyPoint(transforms.get(`hand.${side}`)!, hand.tail);
          tipXs.push(tip[0]);
          expect(tip[2]).toBeLessThan(chestHeadZ); // more -Z than the chest = in front of it
          expect(tip[2]).toBeLessThan(hand.tail[2]);
        }
        expect(tipXs[1]!).toBeGreaterThan(tipXs[0]!);
      });
    }
  }
});
