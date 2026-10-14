import { describe, expect, it } from 'vitest';
import { generate, realize } from '../src/core/generate.ts';
import { posedVoxelSurfaceBoundsForBones } from '../src/core/voxelBounds.ts';
import { crowdTextureLayout, isSeveredInMask, packSeveredMask } from '../src/mob/crowd.ts';
import { severedBoneSet } from '../src/mob/dismember.ts';
import { dogGaitPose, dogHitPose, dogPawBones, dogPose } from '../src/mob/dog.ts';
import { dogTemplate } from '../src/mob/dogTemplate.ts';
import { HIT_FLINCH } from '../src/mob/reactions.ts';
import { HUMANOID_TEMPLATES, TEMPLATES } from '../src/mob/templates.ts';
import { sweepGroup } from './sweeps.ts';

const DOG_SEEDS = [1, 2, 3, 7, 11, 42];
const EXTRA_SWEEP_SEEDS = Array.from({ length: 24 }, (_, index) => index + 50);

const realizedFor = (seed: number) => realize(generate(dogTemplate, seed));

/** Bones that own a voxel in the lowest filled layer — the actual ground contacts. */
const groundContactBones = (realized: ReturnType<typeof realize>): ReadonlySet<string> => {
  const [nx, ny] = realized.voxels.dims;
  let lowestRow = Number.POSITIVE_INFINITY;
  for (let index = 0; index < realized.voxels.owner.length; index++) {
    if (realized.voxels.owner[index] !== 0) {
      lowestRow = Math.min(lowestRow, Math.floor(index / nx) % ny);
    }
  }
  const contacts = new Set<string>();
  for (let index = 0; index < realized.voxels.owner.length; index++) {
    const owner = realized.voxels.owner[index]!;
    if (owner !== 0 && Math.floor(index / nx) % ny === lowestRow) {
      contacts.add(realized.body.bones[owner - 1]!.id);
    }
  }
  return contacts;
};

const ownerIds = (realized: ReturnType<typeof realize>): ReadonlySet<string> => {
  const owners = new Set<string>();
  for (const owner of realized.voxels.owner) {
    if (owner !== 0) {
      owners.add(realized.body.bones[owner - 1]!.id);
    }
  }
  return owners;
};

const pawSurface = (realized: ReturnType<typeof realize>, pose: ReturnType<typeof dogPose>, boneId: string): number =>
  posedVoxelSurfaceBoundsForBones(realized, pose, [boneId]).get(boneId)!;

describe('dog shambler', () => {
  it('is its own body plan, outside the templates Deadvox spawns', () => {
    expect(dogTemplate.bodyPlan).toBe('dog');
    expect(TEMPLATES.some((template) => template.name === 'dog')).toBe(false);
    expect(HUMANOID_TEMPLATES.some((template) => template.name === 'dog')).toBe(false);
  });

  it.each(DOG_SEEDS)('validates as a connected, grounded, budgeted body for seed %i', (seed) => {
    const realized = realizedFor(seed);
    expect(realized.report.ok, realized.report.issues.map((issue) => issue.message).join('; ')).toBe(true);
  });

  it('grounds the body on exactly its four declared paws', () => {
    const realized = realizedFor(1);
    expect(realized.supportBones).toEqual(new Set(dogPawBones));
    expect(groundContactBones(realized)).toEqual(new Set(dogPawBones));
    expect(realized.report.issues.filter((issue) => issue.rule === 'grounded')).toEqual([]);

    const rest = dogPose(realized);
    const tolerance = realized.voxels.size;
    const owners = ownerIds(realized);
    for (const paw of dogPawBones) {
      expect(owners).toContain(paw);
      expect(Math.abs(pawSurface(realized, rest, paw))).toBeLessThanOrEqual(tolerance);
    }
  });

  it('keeps the gait and hit pose supported by the planted paws', () => {
    for (const seed of [DOG_SEEDS[0]!, DOG_SEEDS.at(-1)!]) {
      const realized = realizedFor(seed);
      const tolerance = realized.voxels.size;
      const rest = dogPose(realized, { limp: 0.3, headTilt: 4 });
      expect(dogGaitPose(realized, 0.5, 0, { limp: 0.3, headTilt: 4 })).toEqual(rest);

      for (const [phase, speed] of [
        [0.5, 1],
        [1.4, 1],
        [Math.PI + 0.5, 1],
        [4.8, 0.6],
        [6, 1],
      ] as const) {
        const gait = dogGaitPose(realized, phase, speed, { limp: 0.3, headTilt: 4 });
        const surfaces = dogPawBones.map((paw) => pawSurface(realized, gait, paw));
        expect(Math.min(...surfaces)).toBeGreaterThanOrEqual(-tolerance);
        // At least one paw is planted on the ground at every phase.
        expect(surfaces.some((surface) => Math.abs(surface) <= tolerance)).toBe(true);

        const flinch = dogHitPose(realized, gait, 0.08, 0.5);
        expect(flinch.rotations.head).not.toEqual(gait.rotations.head);
        const flinchSurfaces = dogPawBones.map((paw) => pawSurface(realized, flinch, paw));
        expect(Math.min(...flinchSurfaces)).toBeGreaterThanOrEqual(-tolerance);
        expect(flinchSurfaces.some((surface) => Math.abs(surface) <= tolerance)).toBe(true);
        expect(dogHitPose(realized, gait, HIT_FLINCH.duration)).toEqual(gait);
      }
    }
  });

  it('survives the crowd sever-mask handoff for every bone index', () => {
    const realized = realizedFor(1);
    const { bones } = realized.body;
    const layout = crowdTextureLayout(bones.length, 1);
    const data = new Float32Array(layout.width * layout.height * 4);
    const owners = ownerIds(realized);
    for (const [index, bone] of bones.entries()) {
      expect(owners).toContain(bone.id);
      packSeveredMask(data, layout, 0, [index]);
      for (let check = 0; check < bones.length; check++) {
        expect(isSeveredInMask(data, layout, 0, check)).toBe(check === index);
      }
    }
  });

  it('stands on its remaining contacts after one leg is severed', () => {
    const realized = realizedFor(1);
    const rest = dogPose(realized);
    const tolerance = realized.voxels.size;
    for (const cut of ['foreUpper.L', 'foreUpper.R', 'hindUpper.L', 'hindUpper.R']) {
      const hidden = severedBoneSet(realized.body.bones, [cut]);
      expect(hidden.has(cut)).toBe(true);
      const remaining = dogPawBones.filter((paw) => !hidden.has(paw));
      expect(remaining.length).toBe(3);
      for (const paw of remaining) {
        expect(Math.abs(pawSurface(realized, rest, paw))).toBeLessThanOrEqual(tolerance);
      }
    }
  });

  sweepGroup('additional dog body seeds', () => {
    it.each(EXTRA_SWEEP_SEEDS)('validates and rests grounded for seed %i', (seed) => {
      const realized = realizedFor(seed);
      expect(realized.report.ok, realized.report.issues.map((issue) => issue.message).join('; ')).toBe(true);
      expect(realized.supportBones).toEqual(new Set(dogPawBones));
    });
  });
});
