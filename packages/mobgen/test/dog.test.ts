import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';
import { generate, realize } from '../src/core/generate.ts';
import { applyPoint } from '../src/core/math.ts';
import { boneTransforms } from '../src/core/pose.ts';
import { posedVoxelSurfaceBoundsForBones } from '../src/core/voxelBounds.ts';
import { crowdTextureLayout, isSeveredInMask, packSeveredMask } from '../src/mob/crowd.ts';
import { severedBoneSet } from '../src/mob/dismember.ts';
import { dogGaitPose, dogHitPose, dogPawBones, dogPose, dogStrideLength } from '../src/mob/dog.ts';
import { dogTemplate } from '../src/mob/dogTemplate.ts';
import { HIT_FLINCH } from '../src/mob/reactions.ts';
import { zombieFigure } from '../src/mob/shamblerFigure.ts';
import { TEMPLATES } from '../src/mob/templates.ts';
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

/** The lowest voxel surface among the bones a set of cuts leaves behind. */
const survivingSurface = (
  realized: ReturnType<typeof realize>,
  pose: ReturnType<typeof dogPose>,
  hidden: ReadonlySet<string>,
): number => {
  const survivors = realized.body.bones.map((bone) => bone.id).filter((id) => !hidden.has(id));
  return Math.min(...posedVoxelSurfaceBoundsForBones(realized, pose, survivors).values());
};

const ALL_LEG_CUTS = ['foreUpper.L', 'foreUpper.R', 'hindUpper.L', 'hindUpper.R'] as const;

/** The longest run of samples whose values stay within `tolerance` of each other. */
const longestStillRun = (values: readonly number[], tolerance: number): readonly [number, number] => {
  let bestStart = 0;
  let bestEnd = 0;
  for (let start = 0; start < values.length; start++) {
    let lo = values[start]!;
    let hi = lo;
    for (let end = start; end < values.length; end++) {
      lo = Math.min(lo, values[end]!);
      hi = Math.max(hi, values[end]!);
      if (hi - lo > tolerance) {
        break;
      }
      if (end - start > bestEnd - bestStart) {
        bestStart = start;
        bestEnd = end;
      }
    }
  }
  return [bestStart, bestEnd];
};

describe('dog shambler', () => {
  it('is its own body plan, outside the templates Deadvox spawns', () => {
    expect(dogTemplate.bodyPlan).toBe('dog');
    expect(TEMPLATES.some((template) => template.name === 'dog')).toBe(false);
  });

  it('is refused by the consumer that hands figures to deadvox', () => {
    // The tag is what refuses it, not the model name: `zombieFigure` is deadvox's selection boundary.
    expect(() => zombieFigure('dog', 1)).toThrowError('comparison-only');
  });

  it('is refused by the export CLI before it can write a genome', () => {
    let stderr = '';
    try {
      execFileSync(
        process.execPath,
        [join(import.meta.dirname, '../src/cli/generate.ts'), '--template', 'dog', '--seed', '1'],
        { cwd: join(import.meta.dirname, '..'), encoding: 'utf8', stdio: 'pipe' },
      );
    } catch (error) {
      stderr = (error as { stderr?: string }).stderr ?? '';
    }
    expect(stderr).toContain('comparison-only');
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
      const stance = { limp: 0.3, headTilt: 4 };
      const tolerance = realized.voxels.size;
      const stride = dogStrideLength(realized, stance);
      const rest = dogPose(realized, stance);
      expect(dogGaitPose(realized, 0.5, 0, stance)).toEqual(rest);

      for (const [fraction, speed] of [
        [0.1, 1],
        [0.35, 1],
        [0.6, 1],
        [0.85, 0.6],
        [0.99, 1],
      ] as const) {
        const gait = dogGaitPose(realized, stride * fraction, speed, stance);
        const surfaces = dogPawBones.map((paw) => pawSurface(realized, gait, paw));
        expect(Math.min(...surfaces)).toBeGreaterThanOrEqual(-tolerance);
        // At least one paw is planted on the ground at every phase.
        expect(surfaces.some((surface) => Math.abs(surface) <= tolerance)).toBe(true);

        const flinch = dogHitPose(realized, gait, 0.08, { side: 0.5 });
        expect(flinch.rotations.head).not.toEqual(gait.rotations.head);
        const flinchSurfaces = dogPawBones.map((paw) => pawSurface(realized, flinch, paw));
        expect(Math.min(...flinchSurfaces)).toBeGreaterThanOrEqual(-tolerance);
        expect(flinchSurfaces.some((surface) => Math.abs(surface) <= tolerance)).toBe(true);
        expect(dogHitPose(realized, gait, HIT_FLINCH.duration)).toEqual(gait);
      }
    }
  });

  it('walks with opposite-corner diagonal pairs and a real stride', () => {
    const realized = realizedFor(1);
    const stride = dogStrideLength(realized);
    const tolerance = realized.voxels.size;
    const firstPair = ['forePaw.L', 'hindPaw.R'] as const;
    const secondPair = ['forePaw.R', 'hindPaw.L'] as const;
    const surfacesAt = (distance: number): Record<string, number> =>
      Object.fromEntries(
        dogPawBones.map((paw) => [paw, pawSurface(realized, dogGaitPose(realized, distance, 1), paw)]),
      );

    // Mid first step the fore-left/hind-right diagonal is planted while the other is lifted; mid second
    // step the roles swap. Same-side legs are never planted (or lifted) together.
    const first = surfacesAt(stride / 4);
    for (const paw of firstPair) {
      expect(Math.abs(first[paw]!)).toBeLessThanOrEqual(tolerance);
    }
    for (const paw of secondPair) {
      expect(first[paw]!).toBeGreaterThan(tolerance);
    }

    const second = surfacesAt((3 * stride) / 4);
    for (const paw of secondPair) {
      expect(Math.abs(second[paw]!)).toBeLessThanOrEqual(tolerance);
    }
    for (const paw of firstPair) {
      expect(second[paw]!).toBeGreaterThan(tolerance);
    }

    // The gait moves: at its stance end a planted paw sits a clear voxel behind its rest position.
    const restTransforms = boneTransforms(realized.body.bones, dogPose(realized));
    const stanceEnd = boneTransforms(realized.body.bones, dogGaitPose(realized, stride / 2 - tolerance, 1));
    const toeZ = (transforms: ReturnType<typeof boneTransforms>, paw: string): number => {
      const bone = realized.body.bones.find((candidate) => candidate.id === paw)!;
      return applyPoint(transforms.get(paw)!, bone.tail)[2];
    };
    expect(Math.abs(toeZ(stanceEnd, 'forePaw.L') - toeZ(restTransforms, 'forePaw.L'))).toBeGreaterThan(tolerance);
  });

  it('keeps each planted paw fixed in the ground frame while the body advances', () => {
    const realized = realizedFor(1);
    const stance = { limp: 0.4 };
    const stride = dogStrideLength(realized, stance);
    const tolerance = realized.voxels.size / 2;
    // A stride that covers real ground, so a standing pose or a pinned phase cannot pass this test.
    expect(stride).toBeGreaterThan(tolerance);
    const samples = 120;
    const distance = Array.from({ length: samples + 1 }, (_, i) => (stride * i) / samples);
    const toeZ = (paw: string, pose: ReturnType<typeof dogPose>): number => {
      const bone = realized.body.bones.find((candidate) => candidate.id === paw)!;
      return applyPoint(boneTransforms(realized.body.bones, pose).get(paw)!, bone.tail)[2];
    };

    for (const paw of dogPawBones) {
      const poses = distance.map((d) => dogGaitPose(realized, d, 1, stance));
      // The dog walks forward (-Z), so its root drops by `d`; a planted paw's ground-frame Z
      // (`local Z - d`) must stay put. A planted paw is fixed exactly, so a tenth-of-a-voxel run finds the
      // true stance half and rejects the slow tail of the swing, whose Z creeps too much to qualify.
      const groundZ = poses.map((pose, i) => toeZ(paw, pose) - distance[i]!);
      const surfaces = poses.map((pose) => pawSurface(realized, pose, paw));
      const [start, end] = longestStillRun(groundZ, tolerance / 10);

      // Stance is about half a cycle, so the still interval must be substantial, not a momentary tie.
      expect(end - start).toBeGreaterThan(samples * 0.3);
      // The body genuinely advanced under that paw: its local Z swept the ground distance it covered.
      expect(distance[end]! - distance[start]!).toBeGreaterThan(tolerance);
      expect(Math.abs(toeZ(paw, poses[end]!) - toeZ(paw, poses[start]!))).toBeGreaterThan(tolerance);
      // It was planted on the ground through the whole interval, and lifts during the swing (so the test
      // is not vacuous). Contact is the absolute surface height, not the lowest sample: a paw that sinks
      // or one that hovers above the ground must both fail.
      expect(Math.max(...surfaces.slice(start, end + 1).map(Math.abs))).toBeLessThanOrEqual(tolerance);
      expect(Math.max(...surfaces)).toBeGreaterThan(tolerance);
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

  it('grounds the production pose on surviving geometry when legs are severed', () => {
    const realized = realizedFor(1);
    const tolerance = realized.voxels.size;

    // One leg gone: the surviving three paws at least keep the body planted and nothing dips below ground.
    const stride = dogStrideLength(realized);
    for (const cut of ALL_LEG_CUTS) {
      const hidden = severedBoneSet(realized.body.bones, [cut]);
      const remainingPaws = dogPawBones.filter((paw) => !hidden.has(paw));
      expect(remainingPaws.length).toBe(3);
      for (const fraction of [0.25, 0.75]) {
        const pose = dogGaitPose(realized, stride * fraction, 1, { severed: hidden });
        const surfaces = remainingPaws.map((paw) => pawSurface(realized, pose, paw));
        expect(Math.min(...surfaces)).toBeGreaterThanOrEqual(-tolerance);
        expect(surfaces.some((surface) => Math.abs(surface) <= tolerance)).toBe(true);
        expect(Math.abs(survivingSurface(realized, pose, hidden))).toBeLessThanOrEqual(tolerance);
      }
    }

    // All four paws gone: grounding must ignore the hidden legs and rest the body on its lowest surviving
    // geometry, rather than hovering on an invisible paw.
    const allLegsHidden = severedBoneSet(realized.body.bones, ALL_LEG_CUTS);
    for (const paw of dogPawBones) {
      expect(allLegsHidden.has(paw)).toBe(true);
    }
    for (const fraction of [0.25, 0.75]) {
      const pose = dogGaitPose(realized, stride * fraction, 1, { severed: allLegsHidden });
      expect(Math.abs(survivingSurface(realized, pose, allLegsHidden))).toBeLessThanOrEqual(tolerance);
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
