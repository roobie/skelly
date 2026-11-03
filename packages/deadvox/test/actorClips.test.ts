import type { Pose } from '@mobgen/core/pose.ts';
import { registerTemplate } from '@mobgen/core/template.ts';
import { attackClipFor, attackPose } from '@mobgen/mob/attack.ts';
import { footRestExtents } from '@mobgen/mob/gait.ts';
import type { HumanoidParams } from '@mobgen/mob/humanoid.ts';
import { flinchPoseWithClip, RUNNER_HIT_FLINCH } from '@mobgen/mob/reactions.ts';
import { humanoid } from '@mobgen/mob/templates.ts';
import { afterAll, describe, expect, it } from 'vitest';
import { type ActorPoseInput, flinchSideForId, posedActor } from '../src/core/actorPose.ts';

const template = { ...humanoid, attackClip: 'swipe', flinchClip: 'runner-hit-flinch' };
registerTemplate(template);
afterAll(() => registerTemplate(humanoid));
const input: ActorPoseInput = {
  model: 'humanoid',
  seed: 1,
  position: [0, 0, 0],
  facing: [0, 0, -1],
  headYaw: 0,
  gaitPhase: 0,
  speed: 0,
  chasing: true,
  stanceWeight: 1,
  attackWindup: 0,
  attackWindupSeconds: 0,
  severed: [],
  blockSize: 0.5,
};
const base = () => {
  const posed = posedActor(input);
  const { bones } = posed;
  return {
    posed,
    actor: {
      bones,
      extents: footRestExtents(bones, posed.figure.realized.voxels),
      params: posed.figure.genome.params as HumanoidParams,
      seed: input.seed,
    },
  };
};

const closePose = (pose: Pose) => ({
  root: pose.root.map((value) => expect.closeTo(value, 10)),
  rotations: Object.fromEntries(
    Object.entries(pose.rotations).map(([bone, rotation]) => [
      bone,
      rotation?.map((value) => expect.closeTo(value, 10)),
    ]),
  ),
});

describe('template-selected zombie clips', () => {
  it('uses the selected non-lunge attack and its hit timing', () => {
    const clip = attackClipFor(template);
    const windup = clip.hitTime / 2;
    const remaining = windup / 2;
    const { posed, actor } = base();
    const expectedTime = clip.hitTime - remaining;
    const attacked = posedActor({ ...input, attackWindupSeconds: windup, attackWindup: remaining });
    const expected = attackPose(actor, clip, expectedTime, posed.pose);
    expect(expected).not.toEqual(posed.pose);
    expect(attacked.pose).toEqual(expected);
    const cooldown = clip.duration + windup;
    expect(
      posedActor({
        ...input,
        attackWindupSeconds: windup,
        attackWait: cooldown - (windup - remaining),
        attackCooldown: cooldown,
      }).pose,
    ).toEqual(closePose(expected));
  });

  it('uses the selected flinch without selecting by model name', () => {
    const { posed, actor } = base();
    const time = RUNNER_HIT_FLINCH.keys[1]!.t;
    const expected = flinchPoseWithClip(actor, time, posed.pose, { clip: RUNNER_HIT_FLINCH, side: flinchSideForId(0) });
    expect(expected).not.toEqual(posed.pose);
    expect(posedActor({ ...input, hitFlinchTime: time }).pose).toEqual(expected);
  });
});
