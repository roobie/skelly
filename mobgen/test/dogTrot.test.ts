import { describe, expect, it } from 'vitest';
import { generate, realize } from '../src/core/generate.ts';
import { applyPoint } from '../src/core/math.ts';
import { boneTransforms } from '../src/core/pose.ts';
import { dogGaitPose, dogStrideLength } from '../src/mob/dog.ts';
import { dogTemplate } from '../src/mob/dogTemplate.ts';

const dog = realize(generate(dogTemplate, 7));

describe('dog trot', () => {
  it('keeps the impaired gait shorter than the unimpaired trot', () => {
    const impaired = dogStrideLength(dog, { limp: 0.6 });
    expect(impaired).toBeGreaterThan(0);
    expect(impaired).toBeLessThan(dogStrideLength(dog));
  });

  it('scales stride with the skeleton and lowers cadence as stride grows', () => {
    const larger = {
      ...dog,
      body: {
        ...dog.body,
        bones: dog.body.bones.map((bone) => ({
          ...bone,
          head: [bone.head[0] * 2, bone.head[1] * 2, bone.head[2] * 2] as const,
          tail: [bone.tail[0] * 2, bone.tail[1] * 2, bone.tail[2] * 2] as const,
        })),
      },
    };
    expect(dogStrideLength(larger)).toBeCloseTo(dogStrideLength(dog) * 2);
    const speed = 2.8;
    expect(speed / dogStrideLength(larger)).toBeLessThan(speed / dogStrideLength(dog));
  });

  it.each([0, 0.6])('compensates bob and pitch at both planted diagonals (limp %s)', (limp) => {
    const stance = { limp };
    const stride = dogStrideLength(dog, stance);
    const shortStep = stride - dogStrideLength(dog) / 2;
    const halves = [
      { start: 0, length: shortStep, paws: ['forePaw.L', 'hindPaw.R'] },
      { start: shortStep, length: stride - shortStep, paws: ['forePaw.R', 'hindPaw.L'] },
    ];
    for (const half of halves) {
      const samples = [0, 0.2, 0.5, 0.8, 1 - 1e-6].map((progress) => {
        const distance = half.start + half.length * progress;
        const pose = dogGaitPose(dog, distance, 2.8, stance);
        return { distance, pose, transforms: boneTransforms(dog.body.bones, pose) };
      });
      // Real root motion and changing pitch: a frozen torso cannot satisfy this probe.
      expect(
        Math.max(...samples.map(({ pose }) => pose.root[1])) - Math.min(...samples.map(({ pose }) => pose.root[1])),
      ).toBeGreaterThan(dog.voxels.size / 10);
      expect(samples[1]!.pose.rotations.pelvis).not.toEqual(samples[3]!.pose.rotations.pelvis);
      for (const paw of half.paws) {
        const bone = dog.body.bones.find((candidate) => candidate.id === paw)!;
        const positions = samples.map(({ transforms, distance }) => {
          const toe = applyPoint(transforms.get(paw)!, bone.tail);
          return [toe[0], toe[1], toe[2] - distance];
        });
        for (let axis = 0; axis < 3; axis++) {
          const values = positions.map((p) => p[axis]!);
          expect(Math.max(...values) - Math.min(...values)).toBeLessThan(1e-8);
        }
      }
    }
  });
});
