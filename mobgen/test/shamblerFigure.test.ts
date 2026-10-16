import { describe, expect, it } from 'vitest';
import { cellIndex, worldPosition } from '../src/core/voxelize.ts';
import {
  type BoneVoxelBox,
  type ShamblerFigure,
  type ShamblerHitRegion,
  shamblerFigure,
} from '../src/mob/shamblerFigure.ts';

// Fixture seeds: Deadvox authors the shipped pool, and its own tests check those.
const FIXTURE_SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

const REGION_BONES: Readonly<Record<ShamblerHitRegion, readonly string[]>> = {
  head: ['head', 'jaw'],
  torso: ['pelvis', 'spine', 'chest', 'neck'],
  leftArm: ['upperArm.L', 'forearm.L', 'hand.L'],
  rightArm: ['upperArm.R', 'forearm.R', 'hand.R'],
  leftLeg: ['thigh.L', 'shin.L', 'foot.L'],
  rightLeg: ['thigh.R', 'shin.R', 'foot.R'],
};

const regionBoneErrors = (figure: ShamblerFigure): string[] => {
  const errors: string[] = [];
  for (const [region, bones] of Object.entries(REGION_BONES) as [ShamblerHitRegion, readonly string[]][]) {
    for (const bone of bones) {
      if (!(figure.boxes[region].some((box) => box.bone === bone) && figure.voxelCentersByBone.get(bone)?.length)) {
        errors.push(`${region}/${bone} missing voxel bounds`);
      }
    }
  }
  return errors;
};

const voxelOutsideBox = (point: readonly number[], box: BoneVoxelBox) =>
  point.some((coordinate, axis) => Math.abs(coordinate - box.center[axis]!) > box.halfSize[axis]! + 1e-9);

const voxelContainmentErrors = (figure: ShamblerFigure): string[] => {
  const errors: string[] = [];
  const boneToBox = new Map(
    Object.values(figure.boxes)
      .flat()
      .map((box) => [box.bone, box]),
  );
  const { voxels } = figure.realized;
  for (let k = 0; k < voxels.dims[2]; k++) {
    for (let j = 0; j < voxels.dims[1]; j++) {
      for (let i = 0; i < voxels.dims[0]; i++) {
        const owner = voxels.owner[cellIndex(voxels.dims, i, j, k)]! - 1;
        if (owner < 0) {
          continue;
        }
        const bone = figure.realized.body.bones[owner]!.id;
        const box = boneToBox.get(bone)!;
        const point = worldPosition(voxels, i, j, k);
        if (voxelOutsideBox(point, box)) {
          errors.push(`${figure.seed}/${bone} voxel outside bounds`);
        }
      }
    }
  }
  return errors;
};

describe('shared shambler hit-region figures', () => {
  it('realizes valid figures and caches tight per-bone rest boxes', () => {
    for (const seed of FIXTURE_SEEDS) {
      const figure = shamblerFigure(seed);
      expect(figure.genome.seed).toBe(seed);
      expect(shamblerFigure(seed)).toBe(figure);
      expect(regionBoneErrors(figure)).toEqual([]);
      expect(voxelContainmentErrors(figure)).toEqual([]);
    }
  });
});
