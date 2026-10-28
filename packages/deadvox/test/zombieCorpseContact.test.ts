import { generateValid } from '@mobgen/core/generate.ts';
import { applyPoint, cross, dot, length, mulMV, sub, type Vec3 } from '@mobgen/core/math.ts';
import { boneTransforms } from '@mobgen/core/pose.ts';
import { worldPosition } from '@mobgen/core/voxelize.ts';
import { crawlerGaitPose } from '@mobgen/mob/crawler.ts';
import deathContent from '@mobgen/mob/deathPoses.json' with { type: 'json' };
import {
  bodyRestExtents,
  corners,
  createGaitCache,
  footRestExtents,
  INITIAL_CLOCK,
  walkPose,
} from '@mobgen/mob/gait.ts';
import type { HumanoidParams } from '@mobgen/mob/humanoid.ts';
import { DEATH_FALL_DURATION, deathPose } from '@mobgen/mob/reactions.ts';
import { TEMPLATES } from '@mobgen/mob/templates.ts';
import { describe, expect, it } from 'vitest';
import zombieContent from '../src/content/base/zombies.json' with { type: 'json' };

const figures = TEMPLATES.flatMap((template) =>
  [
    ...new Set(
      zombieContent.zombies
        .filter((entry) => entry.model === template.name)
        .flatMap((entry) => entry.figureSeeds ?? []),
    ),
  ].map((seed) => {
    const found = generateValid(template, seed, { maxAttempts: 1 });
    return {
      template,
      seed,
      found,
      bodyExtents: found && bodyRestExtents(found.realized.body.bones, found.realized.voxels),
      extents: found && footRestExtents(found.realized.body.bones, found.realized.voxels),
    };
  }),
);

describe('authored corpse contact', () => {
  it.for(
    figures.flatMap(({ template, seed }) =>
      deathContent.poses.flatMap(({ id: poseId }) =>
        (template.bodyPlan === 'crawler' ? (['prone'] as const) : (['upright', 'prone'] as const)).map((posture) => ({
          name: template.name,
          poseId,
          posture,
          seed,
        })),
      ),
    ),
  )(
    '$name seed $seed $posture $poseId keeps the settled skull clear of the chest',
    async ({ name, seed, posture, poseId }, { annotate }) => {
      const { found, bodyExtents, extents } = figures.find(
        (figure) => figure.template.name === name && figure.seed === seed,
      )!;
      expect(found, `${name}/${seed} is a valid authored figure`).toBeDefined();
      const { body, voxels } = found!.realized;
      const actor = {
        bones: body.bones,
        bodyExtents: bodyExtents!,
        extents: extents!,
        voxels,
        posture,
        params: found!.genome.params as HumanoidParams,
        seed,
        cache: createGaitCache(),
      };
      const base = posture === 'prone' ? crawlerGaitPose(found!.realized, 0.5, 1) : walkPose(actor, INITIAL_CLOCK, 0);
      const transforms = boneTransforms(
        actor.bones,
        deathPose(actor, base, DEATH_FALL_DURATION, { direction: -1, poseId }),
      );
      const neckBone = actor.bones.find((bone) => bone.id === 'neck')!;
      const neckVector = sub(neckBone.tail, neckBone.head);
      const flatNeck = mulMV(transforms.get('chest')!.r, neckVector);
      const posedNeck = mulMV(transforms.get('neck')!.r, neckVector);
      const liftAxis = cross(flatNeck, [0, 1, 0]);
      const lift =
        (Math.atan2(dot(liftAxis, cross(flatNeck, posedNeck)) / length(liftAxis), dot(flatNeck, posedNeck)) * 180) /
        Math.PI;
      await annotate(`Neck elevation relative to chest rest frame (degrees): ${lift}`);
      const cells = (id: string): Vec3[] => {
        const owner = actor.bones.findIndex((bone) => bone.id === id) + 1;
        const result: Vec3[] = [];
        voxels.owner.forEach((cellOwner, index) => {
          if (cellOwner !== owner) {
            return;
          }
          const i = index % voxels.dims[0];
          const j = Math.floor(index / voxels.dims[0]) % voxels.dims[1];
          const k = Math.floor(index / (voxels.dims[0] * voxels.dims[1]));
          result.push(applyPoint(transforms.get(id)!, worldPosition(voxels, i, j, k)));
        });
        expect(result.length).toBeGreaterThan(0);
        return result;
      };
      const chest = cells('chest');
      let skullSupported = false;
      for (const id of ['head', 'jaw']) {
        const skull = cells(id);
        const axesOf = (boneId: string) =>
          (
            [
              [1, 0, 0],
              [0, 1, 0],
              [0, 0, 1],
            ] as const
          ).map((axis) => mulMV(transforms.get(boneId)!.r, axis));
        const a = axesOf(id);
        const b = axesOf('chest');
        const axes = [...a, ...b, ...a.flatMap((axis) => b.map((other) => cross(axis, other)))].filter(
          (axis) => length(axis) > 1e-10,
        );
        const projections = axes.map((axis) => ({
          axis,
          radius: (voxels.size / 2) * [...a, ...b].reduce((sum, basis) => sum + Math.abs(dot(axis, basis)), 0),
        }));
        const overlaps = skull.some((left) =>
          chest.some((right) => {
            const delta = sub(left, right);
            return (
              dot(delta, delta) < 3 * voxels.size ** 2 &&
              projections.every(
                ({ axis, radius }) =>
                  Math.abs(dot(delta, axis)) <
                  radius - Math.max(...deathContent.contact.penetrationVoxels) * voxels.size * length(axis) - 1e-9,
              )
            );
          }),
        );
        expect(overlaps, `${id} cells must not exceed the authored collar penetration allowance`).toBe(false);
        const nearChest = skull.some((left) =>
          chest.some((right) => {
            const delta = sub(left, right);
            return (
              dot(delta, delta) <= 3 * (voxels.size * (1 + deathContent.contact.supportDistanceVoxels)) ** 2 &&
              projections.every(
                ({ axis, radius }) =>
                  Math.abs(dot(delta, axis)) <=
                  radius + voxels.size * deathContent.contact.supportDistanceVoxels * length(axis),
              )
            );
          }),
        );
        const floorClearance = Math.min(
          ...corners(actor.bodyExtents.get(id)!).map((point) => applyPoint(transforms.get(id)!, point)[1]),
        );
        expect(floorClearance, `${id} stays above the floor`).toBeGreaterThanOrEqual(0);
        skullSupported ||= floorClearance <= voxels.size || nearChest;
      }
      expect(skullSupported, 'the skull settles onto the floor or chest instead of freezing above both').toBe(true);
    },
  );
});
