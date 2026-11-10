import { describe, expect, it } from 'vitest';
import { actorHitFlinchDuration } from '../src/core/actorPose.ts';
import { actorFigure } from '../src/engine/content.ts';
import { decodeFrame, type Pose, posedActor } from '../src/engine/pose.ts';
import { corpseFallPose, deathBlendSeconds, deathClip } from '../src/render/corpsePose.ts';
import { stackActorFigureFiles } from './baseContentFiles.ts';
import { baseRegistry } from './baseRegistry.ts';

const registry = baseRegistry();
const ACID = [...registry.actors.values()].find(({ model }) => model === 'acid')!;
const SEED = ACID.figureSeeds![0]!;
const FIGURE = actorFigure(stackActorFigureFiles(registry), ACID, SEED);

/** A living acid mid-stride, so its pose differs from the fall's first frame. */
const LIVE = posedActor({
  figure: FIGURE,
  seed: SEED,
  model: 'acid',
  position: [0, 0, 0],
  facing: [0, 0, -1],
  headYaw: 0,
  gaitPhase: Math.PI / 2,
  speed: ACID.speed.wanderMetresPerSimSecond,
  chasing: false,
  attackWindup: 0,
  attackWindupSeconds: 0,
  severed: [],
  blockSize: 1,
}).pose;

/** The largest root or rotation-matrix component difference over the bones `expected` rotates. */
const poseDelta = (actual: Pose, expected: Pose): number => {
  let worst = Math.max(...actual.root.map((value, axis) => Math.abs(value - expected.root[axis]!)));
  for (const [id, rotation] of Object.entries(expected.rotations)) {
    const other = actual.rotations[id];
    if (!other) {
      return Number.POSITIVE_INFINITY;
    }
    worst = Math.max(worst, ...rotation.map((value, index) => Math.abs(value - other[index]!)));
  }
  return worst;
};
const SAME = 1e-9;

describe('acid corpse fall', () => {
  for (const direction of [1, -1] as const) {
    const clip = deathClip(FIGURE.clips, direction)!;

    it(`starts at the live pose and reaches the clip by its first frame interval (${direction})`, () => {
      expect(clip.frames.length).toBeGreaterThan(1);
      expect(LIVE).not.toEqual(decodeFrame(clip.frames[0]!));
      expect(poseDelta(corpseFallPose(clip, LIVE, 0), LIVE)).toBeLessThan(SAME);
      expect(poseDelta(corpseFallPose(clip, LIVE, deathBlendSeconds(clip)), decodeFrame(clip.frames[1]!))).toBeLessThan(
        SAME,
      );
    });

    it(`settles on the clip's last frame whatever the live pose (${direction})`, () => {
      const settled = decodeFrame(clip.frames.at(-1)!);
      expect(poseDelta(corpseFallPose(clip, LIVE, clip.durationRealSeconds), settled)).toBeLessThan(SAME);
      const rest = { root: [0, 0, 0] as const, rotations: {} };
      expect(poseDelta(corpseFallPose(clip, rest, clip.durationRealSeconds * 2), settled)).toBeLessThan(SAME);
    });
  }
});

describe('acid hit flinch', () => {
  it("lasts its built hit clip's own span", () => {
    const hit = FIGURE.clips.standing!.hit!;
    expect('durationSimSeconds' in hit && hit.durationSimSeconds).toBe(actorHitFlinchDuration('acid', FIGURE));
  });
});
