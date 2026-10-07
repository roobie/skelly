import { describe, expect, it } from 'vitest';
import { generate, realize } from '../src/core/generate.ts';
import { meshBones } from '../src/core/mesh.ts';
import { validate } from '../src/core/validate.ts';
import { voxelize } from '../src/core/voxelize.ts';
import { amalgamManifest, bodyWithoutAmalgamPart } from '../src/mob/amalgam.ts';
import { boss } from '../src/mob/templates.ts';
import { sweepGroup } from './sweeps.ts';

const SAMPLE_SEEDS = [1, 17, 42];

const bodyIssues = (body: ReturnType<typeof realize>['body'], seed: number) => {
  const voxels = voxelize(body, boss.voxelSize, seed);
  const meshes = meshBones(voxels, body.bones.length);
  return validate({
    body,
    voxels,
    meshes,
    supportBones: new Set(boss.supportBones.filter((id) => body.bones.some((bone) => bone.id === id))),
    budgets: boss.budgets,
  });
};

const inspectManifest = (manifest: ReturnType<typeof amalgamManifest>, boneIds: ReadonlySet<string>) => {
  const partById = new Map(manifest.parts.map((part) => [part.id, part]));
  const ownedBones = manifest.parts.flatMap((part) => part.boneIds);
  const regionsResolve = manifest.regions.every((region) => {
    const part = partById.get(region.partId);
    return (
      Boolean(part) &&
      part!.regionIds.includes(region.id) &&
      region.boneIds.length > 0 &&
      region.boneIds.every((id) => boneIds.has(id) && part!.boneIds.includes(id))
    );
  });
  return {
    rootsResolve: manifest.parts.every((part) => boneIds.has(part.rootBone)),
    partsOwnKnownBones: ownedBones.every((id) => boneIds.has(id)),
    partsDisjointAndComplete: new Set(ownedBones).size === boneIds.size && boneIds.size === ownedBones.length,
    partsHaveBonesAndPositiveMass: manifest.parts.every(
      (part) => part.boneIds.length > 0 && Number.isFinite(part.massFraction) && part.massFraction > 0,
    ),
    coreIsNotSeverable: partById.get('core')?.severable === false,
    multipleMembersCanBeSevered: manifest.parts.filter((part) => part.severable).length > 1,
    massFractionsSumToOne: Math.abs(manifest.parts.reduce((sum, part) => sum + part.massFraction, 0) - 1) < 1e-10,
    regionIdsAreUnique: new Set(manifest.regions.map((region) => region.id)).size === manifest.regions.length,
    regionsResolve,
    multipleHeadBonesResolve: manifest.headBoneIds.length > 1 && manifest.headBoneIds.every((id) => boneIds.has(id)),
  };
};

describe('amalgam body plan', () => {
  it('generates valid connected bodies and a resolved part/region manifest across sample seeds', () => {
    for (const seed of SAMPLE_SEEDS) {
      const realized = realize(generate(boss, seed));
      expect(realized.report.ok, JSON.stringify(realized.report.issues)).toBe(true);
      const manifest = amalgamManifest(realized.body, realized.voxels);
      const boneIds = new Set(realized.body.bones.map((bone) => bone.id));
      expect(inspectManifest(manifest, boneIds)).toEqual({
        rootsResolve: true,
        partsOwnKnownBones: true,
        partsDisjointAndComplete: true,
        partsHaveBonesAndPositiveMass: true,
        coreIsNotSeverable: true,
        multipleMembersCanBeSevered: true,
        massFractionsSumToOne: true,
        regionIdsAreUnique: true,
        regionsResolve: true,
        multipleHeadBonesResolve: true,
      });
    }
  });

  it('severing any member removes only its subtree and leaves a valid core-supported body', () => {
    const genome = generate(boss, SAMPLE_SEEDS[0]!);
    const realized = realize(genome);
    const manifest = amalgamManifest(realized.body, realized.voxels);
    const boneIds = new Set(realized.body.bones.map((bone) => bone.id));

    for (const part of manifest.parts.filter((candidate) => candidate.severable)) {
      const remaining = bodyWithoutAmalgamPart(realized.body, part.id);
      const remainingIds = new Set(remaining.bones.map((bone) => bone.id));
      expect(remainingIds.has('core')).toBe(true);
      expect([...remainingIds].sort()).toEqual([...boneIds].filter((id) => !part.boneIds.includes(id)).sort());
      expect(bodyIssues(remaining, genome.seed).ok).toBe(true);
    }
  });

  sweepGroup('amalgam validity sweep', () => {
    for (let batch = 0; batch < 10; batch++) {
      it(`passes full validation and resolves references in batch ${batch + 1}`, () => {
        for (let seed = batch * 10; seed < (batch + 1) * 10; seed++) {
          const genome = generate(boss, seed);
          const realized = realize(genome);
          expect(realized.report.ok, `seed ${seed}: ${JSON.stringify(realized.report.issues)}`).toBe(true);
          const manifest = amalgamManifest(realized.body, realized.voxels);
          const boneIds = new Set(realized.body.bones.map((bone) => bone.id));
          for (const part of manifest.parts) {
            expect(boneIds.has(part.rootBone), `seed ${seed}: ${part.id} root`).toBe(true);
            expect(
              part.boneIds.every((id) => boneIds.has(id)),
              `seed ${seed}: ${part.id} bones`,
            ).toBe(true);
          }
          expect(manifest.regions.every((region) => manifest.parts.some((part) => part.id === region.partId))).toBe(
            true,
          );
        }
      });
    }
  });
});
