import { readFileSync } from 'node:fs';
import { ActorBodySchema, ActorClipsSchema, JointDeltaClipSchema, PoseClipSchema } from '@skelly/engine/content';
import {
  applyJointDelta,
  applyMotion,
  idleBlendWeight,
  stanceMotion,
  walkToIdle,
} from '@skelly/engine/internal/core/actorClips.ts';
import type { HumanoidIdle, JointDeltaClip, PoseClip } from '@skelly/engine/internal/core/schema/actors.ts';
import {
  type Bone,
  blendPose,
  decodeFrame,
  groundFit,
  IDENTITY_M,
  idleBase,
  jointAngles,
  type Mat3,
  type Pose,
  sampleClip,
  slerpQuat,
  walkCursor,
} from '@skelly/engine/pose';
import { parse } from 'valibot';
import { describe, expect, it } from 'vitest';

const readFixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/actors/${name}`, import.meta.url), 'utf8'));

const body = parse(ActorBodySchema, readFixture('fixture.body.json'));
const { standing, crawling } = parse(ActorClipsSchema, readFixture('fixture.clips.json'));
const finitePose = parse(PoseClipSchema, readFixture('fixture.finite-pose.json'));
const jointDelta = parse(JointDeltaClipSchema, readFixture('fixture.joint-delta.json'));

const pick = <T>(entry: unknown, name: string): T => {
  if (entry === undefined) {
    throw new Error(`the fixture lacks ${name}`);
  }
  return entry as T;
};
const walk = pick<PoseClip>(standing?.walk, 'standing.walk');
const crawlIdle = pick<PoseClip>(crawling?.idle, 'crawling.idle');
const idle = pick<HumanoidIdle>(standing?.idle, 'standing.idle');
const boneOf = (id: string): Bone =>
  pick<Bone>(
    body.bones.find((entry) => entry.id === id),
    id,
  );

const TOLERANCE = 1e-9;
/** The largest per-component difference; unequal lengths never compare close. */
const gap = (a: readonly number[], b: readonly number[]): number =>
  a.length === b.length ? Math.max(0, ...a.map((value, i) => Math.abs(value - b[i]!))) : Number.POSITIVE_INFINITY;
const close = (a: readonly number[], b: readonly number[]): boolean => gap(a, b) <= TOLERANCE;

// The stance motion hash of `packages/engine/src/core/actorClips.ts`, `phaseFor`, restated so a test can find an oscillator's zero.
const phaseFor = (seed: number, salt: number): number => {
  const h = Math.sin(seed * 12.9898 + salt * 78.233) * 43_758.5453;
  return (h - Math.floor(h)) * 2 * Math.PI;
};

describe('sampleClip', () => {
  it('interpolates a looping clip between neighbouring frames', () => {
    const [a, b] = [walk.frames[0]!, walk.frames[1]!];
    const sample = sampleClip(walk, 1 / 8);
    const midRoot = a.root.map((value, axis) => value + (b.root[axis]! - value) / 2);
    expect(gap(sample.root, midRoot)).toBeLessThanOrEqual(TOLERANCE);
    const midArm = slerpQuat(a.rotations['upperArm.L']!, b.rotations['upperArm.L']!, 1 / 2);
    expect(gap(sample.rotations['upperArm.L']!, midArm)).toBeLessThanOrEqual(TOLERANCE);
  });

  it('interpolates a finite clip between neighbouring frames', () => {
    const [a, b] = [finitePose.frames[0]!, finitePose.frames[1]!];
    const sample = sampleClip(finitePose, finitePose.durationSimSeconds! / 4);
    const midChest = slerpQuat(a.rotations.chest!, b.rotations.chest!, 1 / 2);
    expect(gap(sample.rotations.chest!, midChest)).toBeLessThanOrEqual(TOLERANCE);
  });

  it('spans a finite clip by whichever single clock key it carries', () => {
    const { durationSimSeconds: span, ...rest } = finitePose;
    const death = { kind: rest.kind, loop: false as const, frames: rest.frames, durationRealSeconds: span! };
    expect(sampleClip(death, span! / 4)).toEqual(sampleClip(finitePose, span! / 4));
    expect(() => sampleClip(rest, span! / 4)).toThrow();
    expect(() => sampleClip({ ...finitePose, durationRealSeconds: span! } as PoseClip, span! / 4)).toThrow();
  });

  it('returns the only frame of a one-frame clip at any cursor', () => {
    for (const cursor of [0, 0.37, 5, -2]) {
      expect(sampleClip(crawlIdle, cursor)).toBe(crawlIdle.frames[0]);
    }
  });
});

describe('walkCursor', () => {
  it('spans the given number of gait cycles and wraps into [0, 1)', () => {
    expect(walkCursor(2 * Math.PI, 2)).toBe(0.5);
    expect(walkCursor(4 * Math.PI, 2)).toBe(0);
    expect(walkCursor(-Math.PI, 1)).toBe(0.5);
    for (const phase of [-7, -0.1, 0, 3, 6.2, 40]) {
      const cursor = walkCursor(phase, 2);
      expect(cursor).toBeGreaterThanOrEqual(0);
      expect(cursor).toBeLessThan(1);
    }
  });
});

describe('stance idle', () => {
  const slack = decodeFrame(idle.slack.base);
  const aggravated = decodeFrame(idle.aggravated.base);

  it('blends the slack and aggravated bases by stance weight', () => {
    expect(idleBase(idle, 0)).toEqual(slack);
    expect(idleBase(idle, 1)).toEqual(aggravated);
    expect(idleBase(idle, 0.5)).toEqual(blendPose(slack, aggravated, 0.5));
  });

  it('selects the aggravated oscillators from a stance weight of one half', () => {
    expect(stanceMotion(idle, 0.49)).toBe(idle.slack.motion);
    expect(stanceMotion(idle, 0.5)).toBe(idle.aggravated.motion);
  });

  it('leaves the base unchanged where an oscillator sine is zero', () => {
    for (const oscillator of idle.slack.motion) {
      const zeroTime =
        ((2 * Math.PI - phaseFor(body.seed, oscillator.salt)) * oscillator.periodSimSeconds) / (2 * Math.PI);
      const moved = applyMotion(slack, [oscillator], zeroTime, body.seed);
      expect(moved.root).toEqual(slack.root);
      for (const { bone } of oscillator.bones) {
        expect(gap(moved.rotations[bone]!, slack.rotations[bone] ?? IDENTITY_M)).toBeLessThanOrEqual(TOLERANCE);
      }
    }
  });

  it('multiplies the oscillators in list order', () => {
    const [first, second] = idle.slack.motion;
    const firstBones = new Set(first!.bones.map(({ bone }) => bone));
    const shared = pick<string>(second!.bones.find(({ bone }) => firstBones.has(bone))?.bone, 'a shared bone');
    const time = 0.37;
    const inOrder = applyMotion(slack, [first!, second!], time, body.seed);
    const stepwise = applyMotion(applyMotion(slack, [first!], time, body.seed), [second!], time, body.seed);
    const reversed = applyMotion(slack, [second!, first!], time, body.seed);
    expect(gap(inOrder.rotations[shared]!, stepwise.rotations[shared]!)).toBeLessThanOrEqual(TOLERANCE);
    expect(close(inOrder.rotations[shared]!, reversed.rotations[shared]!)).toBe(false);
  });

  it('fades the walk fully into the idle at rest and out of it at idleBlendSpeed', () => {
    const blendSpeed = walk.idleBlendSpeed!;
    const stride = decodeFrame(walk.frames[2]!);
    expect(idleBlendWeight(0, blendSpeed)).toBe(1);
    expect(idleBlendWeight(blendSpeed, blendSpeed)).toBe(0);
    expect(idleBlendWeight(2 * blendSpeed, blendSpeed)).toBe(0);
    expect(walkToIdle(stride, slack, 0, blendSpeed)).toBe(slack);
    expect(walkToIdle(stride, slack, blendSpeed, blendSpeed)).toBe(stride);
  });
});

describe('applyJointDelta', () => {
  const base = decodeFrame(finitePose.frames[1]!);
  const ids = body.bones.map(({ id }) => id);
  const end = jointDelta.durationSimSeconds!;
  const delta = (side: number, clip: JointDeltaClip = jointDelta): Pose =>
    applyJointDelta(body, base, clip, end, { speed: 0, side });
  const anglesGap = (pose: Pose, id: string, expected: readonly number[]): number =>
    gap(jointAngles(boneOf(id), pose.rotations[id] as Mat3), expected);

  it('keeps the base rotations at zero deltas and refits the root to the ground', () => {
    const start = applyJointDelta(body, base, jointDelta, 0, { speed: 0, side: 1 });
    for (const id of Object.keys(jointDelta.frames[0]!.angles)) {
      expect(gap(start.rotations[id]!, base.rotations[id] ?? IDENTITY_M)).toBeLessThanOrEqual(TOLERANCE);
    }
    const { lowest } = groundFit(body, { root: base.root, rotations: start.rotations }, ids);
    expect(gap(start.root, [base.root[0], base.root[1] - lowest, base.root[2]])).toBeLessThanOrEqual(TOLERANCE);
  });

  it('adds the last frame deltas to the base joint angles at the duration', () => {
    const result = delta(1);
    expect(anglesGap(result, 'chest', [30, 0, 10])).toBeLessThanOrEqual(TOLERANCE);
    expect(anglesGap(result, 'head', [5, 0, 0])).toBeLessThanOrEqual(TOLERANCE);
  });

  it('flips only the z delta for the other side', () => {
    const result = delta(-1);
    expect(anglesGap(result, 'chest', [30, 0, -10])).toBeLessThanOrEqual(TOLERANCE);
    expect(anglesGap(result, 'head', [5, 0, 0])).toBeLessThanOrEqual(TOLERANCE);
  });

  it('clamps the summed angles to the bone limits', () => {
    const wide = structuredClone(jointDelta);
    wide.frames[1]!.angles.chest = [0, 0, 60];
    expect(anglesGap(delta(1, wide), 'chest', [30, 0, 45])).toBeLessThanOrEqual(TOLERANCE);
  });

  it('returns the base itself for a speed-weighted clip at rest', () => {
    const weighted = { ...jointDelta, speedWeight: true };
    expect(applyJointDelta(body, base, weighted, end, { speed: 0, side: 1 })).toBe(base);
  });
});
