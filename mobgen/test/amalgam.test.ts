import { describe, expect, it } from 'vitest';
import { generate, realize, resolveSupportBones } from '../src/core/generate.ts';
import { mulMM, mulMV, rotX, rotY, rotZ } from '../src/core/math.ts';
import { meshBones } from '../src/core/mesh.ts';
import { validate } from '../src/core/validate.ts';
import { voxelize } from '../src/core/voxelize.ts';
import {
  amalgamManifest,
  bodyWithoutAmalgamPart,
  MAX_AMALGAM_MEMBERS,
  MIN_AMALGAM_MEMBERS,
} from '../src/mob/amalgam.ts';
import { boss } from '../src/mob/bossTemplate.ts';
import { sweepGroup } from './sweeps.ts';

const SAMPLE_SEEDS = [1, 17, 42];
const FOOT_BONE_PATTERN = /\.foot\.[LR]$/;
const HEAD_BONE_PATTERN = /\.head$/;

const bodyIssues = (body: ReturnType<typeof realize>['body'], seed: number) => {
  const voxels = voxelize(body, boss.voxelSize, seed);
  const meshes = meshBones(voxels, body.bones.length);
  return validate({
    body,
    voxels,
    meshes,
    supportBones: resolveSupportBones(boss, body, voxels),
    budgets: boss.budgets,
  });
};

const actualGroundOwners = (realized: ReturnType<typeof realize>): ReadonlySet<string> => {
  const { body, voxels } = realized;
  const [nx, ny] = voxels.dims;
  let lowestRow = Number.POSITIVE_INFINITY;
  for (let index = 0; index < voxels.owner.length; index++) {
    if (voxels.owner[index] !== 0) {
      lowestRow = Math.min(lowestRow, Math.floor(index / nx) % ny);
    }
  }
  const owners = new Set<string>();
  for (let index = 0; index < voxels.owner.length; index++) {
    const owner = voxels.owner[index]!;
    if (owner !== 0 && Math.floor(index / nx) % ny === lowestRow) {
      owners.add(body.bones[owner - 1]!.id);
    }
  }
  return owners;
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
    memberCount: manifest.parts.filter((part) => part.severable).length,
    headCount: manifest.headBoneIds.length,
    rootsResolve: manifest.parts.every((part) => boneIds.has(part.rootBone)),
    partsOwnKnownBones: ownedBones.every((id) => boneIds.has(id)),
    partsDisjointAndComplete: new Set(ownedBones).size === boneIds.size && boneIds.size === ownedBones.length,
    partsHaveBonesAndPositiveMass: manifest.parts.every(
      (part) => part.boneIds.length > 0 && Number.isFinite(part.massFraction) && part.massFraction > 0,
    ),
    coreIsNotSeverable: partById.get('core')?.severable === false,
    massFractionsSumToOne: Math.abs(manifest.parts.reduce((sum, part) => sum + part.massFraction, 0) - 1) < 1e-10,
    regionIdsAreUnique: new Set(manifest.regions.map((region) => region.id)).size === manifest.regions.length,
    regionsResolve,
  };
};

describe('amalgam body plan', () => {
  it('generates valid connected bodies and a resolved part/region manifest across sample seeds', () => {
    for (const seed of SAMPLE_SEEDS) {
      const realized = realize(generate(boss, seed));
      expect(realized.report.ok, JSON.stringify(realized.report.issues)).toBe(true);
      const manifest = amalgamManifest(realized.body, realized.voxels);
      const boneIds = new Set(realized.body.bones.map((bone) => bone.id));
      const summary = inspectManifest(manifest, boneIds);
      expect(summary.memberCount).toBeGreaterThanOrEqual(MIN_AMALGAM_MEMBERS);
      expect(summary.memberCount).toBeLessThanOrEqual(MAX_AMALGAM_MEMBERS);
      expect(summary.headCount).toBe(summary.memberCount);
      expect(summary.rootsResolve).toBe(true);
      expect(summary.partsOwnKnownBones).toBe(true);
      expect(summary.partsDisjointAndComplete).toBe(true);
      expect(summary.partsHaveBonesAndPositiveMass).toBe(true);
      expect(summary.coreIsNotSeverable).toBe(true);
      expect(summary.massFractionsSumToOne).toBe(true);
      expect(summary.regionIdsAreUnique).toBe(true);
      expect(summary.regionsResolve).toBe(true);
      expect([...realized.supportBones].sort()).toEqual([...actualGroundOwners(realized)].sort());
    }
  });

  it('samples member counts within range and varies them across seeds', () => {
    const counts = Array.from({ length: 20 }, (_, seed) => generate(boss, seed).params.memberCount!);
    expect(
      counts.every((count) => Number.isInteger(count) && count >= MIN_AMALGAM_MEMBERS && count <= MAX_AMALGAM_MEMBERS),
    ).toBe(true);
    expect(new Set(counts).size).toBeGreaterThan(1);
  });

  it('rejects a member root detached from the shared core when building the manifest', () => {
    const realized = realize(generate(boss, SAMPLE_SEEDS[0]!));
    const brokenBody = {
      ...realized.body,
      bones: realized.body.bones.map((bone) => (bone.parent === 'core' ? { ...bone, parent: null } : bone)),
    };
    expect(() => amalgamManifest(brokenBody, realized.voxels)).toThrow('core as its only root');
  });

  it('severing every member in one body leaves a valid core-supported body', () => {
    const seed = SAMPLE_SEEDS[0]!;
    const realized = realize(generate(boss, seed));
    const manifest = amalgamManifest(realized.body, realized.voxels);
    for (const part of manifest.parts.filter((candidate) => candidate.severable)) {
      const remaining = bodyWithoutAmalgamPart(realized.body, part.id);
      const report = bodyIssues(remaining, seed);
      expect(report.ok, `${part.id}: ${JSON.stringify(report.issues)}`).toBe(true);
    }
  });

  sweepGroup('amalgam validity sweep', () => {
    it('covers variable counts, hanging members, and non-foot ground contacts across seeds', () => {
      const memberCounts = new Set<number>();
      let sawHangingMember = false;
      let sawUpsideDownMember = false;
      let sawSidewaysMember = false;
      let sawNonFootMemberContact = false;
      let sawFloorBearingHead = false;
      for (let seed = 0; seed < 100; seed++) {
        const genome = generate(boss, seed);
        const realized = realize(genome);
        expect(realized.report.ok, `seed ${seed}: ${JSON.stringify(realized.report.issues)}`).toBe(true);
        const manifest = amalgamManifest(realized.body, realized.voxels);
        const contacts = actualGroundOwners(realized);
        expect([...realized.supportBones].sort()).toEqual([...contacts].sort());
        const members = manifest.parts.filter((part) => part.severable);
        memberCounts.add(members.length);
        expect(members.length).toBeGreaterThanOrEqual(MIN_AMALGAM_MEMBERS);
        expect(members.length).toBeLessThanOrEqual(MAX_AMALGAM_MEMBERS);
        sawHangingMember ||= members.some((part) => part.boneIds.every((boneId) => !contacts.has(boneId)));
        for (const part of members) {
          const member = Number(part.id.slice('member.'.length));
          const rotation = mulMM(
            rotY(genome.params[`member.${member}.rotateY`]!),
            mulMM(rotZ(genome.params[`member.${member}.rotateZ`]!), rotX(genome.params[`member.${member}.rotateX`]!)),
          );
          const up = mulMV(rotation, [0, 1, 0]);
          sawUpsideDownMember ||= up[1] < -0.9;
          sawSidewaysMember ||= Math.abs(up[1]) < 0.1;
        }
        sawNonFootMemberContact ||= [...contacts].some(
          (boneId) => boneId.startsWith('member.') && !FOOT_BONE_PATTERN.test(boneId),
        );
        sawFloorBearingHead ||= manifest.headBoneIds.some(
          (boneId) => contacts.has(boneId) || contacts.has(boneId.replace(HEAD_BONE_PATTERN, '.jaw')),
        );
      }
      expect(memberCounts.size).toBeGreaterThan(1);
      expect(sawHangingMember).toBe(true);
      expect(sawUpsideDownMember).toBe(true);
      expect(sawSidewaysMember).toBe(true);
      expect(sawNonFootMemberContact).toBe(true);
      expect(sawFloorBearingHead).toBe(true);
    }, 180_000);
  });
});
