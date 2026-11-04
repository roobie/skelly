import { describe, expect, it } from 'vitest';
import { ragdollGroups } from '../../deadvox/src/render/ragdoll.ts';
import type { Realized } from '../src/core/generate.ts';
import { planOf } from '../src/core/generate.ts';
import { posedVoxelSurfaceBoundsForBones } from '../src/core/voxelBounds.ts';
import { crowdTextureLayout, isSeveredInMask, packSeveredMask } from '../src/mob/crowd.ts';
import { severableParts, severedBoneSet } from '../src/mob/dismember.ts';
import {
  clipAngles,
  LEAPER_CLIPS,
  leaperClip,
  leaperFrame,
  locomotionFor,
  supportsFor,
} from '../src/mob/leaper/motion.ts';
import { jointCracks } from '../src/mob/leaper/seams.ts';
import { generateValidLeaper } from '../src/mob/leaper/search.ts';
import ragdoll from '../src/mob/ragdoll.json' with { type: 'json' };
import { sweepGroup } from './sweeps.ts';

const TRUNK = ['spine', 'chest', 'head'];
/** A crack narrower than half a voxel stays hidden behind the neighbouring cells' faces. */
const OPEN_CRACK = 0.5;
const FRAMES = 24;
const UNKNOWN_CLIP = /unknown leaper clip/;
const CRIPPLE_GAIT = /limp|drag/;

/** Each clip on the body it is authored for: the cripple gaits play on bodies that lost their springs. */
const CASES: readonly { readonly clip: string; readonly cuts: readonly string[]; readonly mirrored: boolean }[] = [
  ...LEAPER_CLIPS.filter((clip) => clip !== 'limp' && clip !== 'drag').map((clip) => ({
    clip,
    cuts: [],
    mirrored: false,
  })),
  { clip: 'limp', cuts: ['thigh.L'], mirrored: false },
  { clip: 'limp', cuts: ['thigh.R'], mirrored: true },
  { clip: 'drag', cuts: ['thigh.L', 'thigh.R'], mirrored: false },
];

const searched = (seed: number) => {
  const found = generateValidLeaper(seed);
  if (!found) {
    throw new Error(`no valid leaper from seed ${seed}`);
  }
  return found;
};
const leaper = searched(0).full.realized;
const { bones } = leaper.body;
const regions = planOf('leaper').regionBones!;

const frames = (realized: Realized, { clip, cuts, mirrored }: (typeof CASES)[number]) =>
  Array.from({ length: FRAMES + 1 }, (_, i) => ({
    u: i / FRAMES,
    ...leaperFrame(realized, clip, i / FRAMES, { cuts, mirrored }),
  }));

const lowestBone = (
  realized: Realized,
  pose: Parameters<typeof posedVoxelSurfaceBoundsForBones>[1],
  hidden: ReadonlySet<string>,
) => {
  const visible = realized.body.bones.filter((bone) => !hidden.has(bone.id)).map((bone) => bone.id);
  const bounds = [...posedVoxelSurfaceBoundsForBones(realized, pose, visible)];
  return bounds.reduce((low, entry) => (entry[1] < low[1] ? entry : low));
};

/** What one frame breaks: resting on a non-support, touching ground in the air, or an open trunk crack. */
const frameFailures = (
  realized: Realized,
  current: (typeof CASES)[number],
  { u, pose, airborne }: ReturnType<typeof frames>[number],
): string[] => {
  const hidden = severedBoneSet(realized.body.bones, current.cuts);
  const at = `${current.clip}${current.mirrored ? ' mirrored' : ''} at ${u.toFixed(3)}`;
  const [bone, height] = lowestBone(realized, pose, hidden);
  const failures: string[] = [];
  if (!(airborne || supportsFor(realized.body.bones, hidden).has(bone))) {
    failures.push(`${at}: rests on ${bone}`);
  }
  if (airborne && height <= 0) {
    failures.push(`${at}: airborne yet ${bone} reaches the ground`);
  }
  for (const [joint, crack] of jointCracks(realized, pose, TRUNK, hidden)) {
    if (crack > OPEN_CRACK) {
      failures.push(`${at}: ${joint} cracks ${crack.toFixed(2)} voxels open`);
    }
  }
  return failures;
};

/** Every property a clip must keep on one realized body, reported as readable failures. */
const clipFailures = (realized: Realized): string[] =>
  CASES.flatMap((current) => frames(realized, current).flatMap((frame) => frameFailures(realized, current, frame)));

describe('leaper body', () => {
  it('a seed search finds a body that validates at the template grid and at far LOD', () => {
    const { full, far } = searched(0);
    expect(full.realized.report.issues).toEqual([]);
    expect(far.realized.report.issues).toEqual([]);
    expect(far.realized.profile).toBe('silhouette');
  });

  it('maps every bone to exactly one hit region', () => {
    const owners = bones.map((bone) => Object.entries(regions).filter(([, members]) => members.includes(bone.id)));
    expect(owners.map((owner) => owner.length)).toEqual(bones.map(() => 1));
  });

  it('cuts only at limb roots and the head, each cut staying inside its region, never the trunk', () => {
    const parts = severableParts(bones);
    expect(parts.length).toBeGreaterThan(0);
    for (const part of parts) {
      const root = bones.find((bone) => bone.id === part)!;
      expect(regions.torso).toContain(root.parent);
      const region = Object.values(regions).find((members) => members.includes(part))!;
      expect([...severedBoneSet(bones, [part])].every((id) => region.includes(id))).toBe(true);
    }
    expect(severedBoneSet(bones, parts).size).toBe(bones.length - regions.torso.length);
  });

  it('keeps every bone index through the crowd gore-mask handoff', () => {
    const layout = crowdTextureLayout(bones.length, 1);
    const data = new Float32Array(layout.width * layout.height * 4);
    packSeveredMask(
      data,
      layout,
      0,
      bones.map((_, index) => index),
    );
    expect(bones.every((_, index) => isSeveredInMask(data, layout, 0, index))).toBe(true);
  });

  it('gives the corpse solver ragdoll groups covering the whole skeleton', () => {
    const groups = ragdollGroups(bones, new Set(), ragdoll.modelGroups.leaper);
    expect(groups.flatMap((group) => group.indices).sort((a, b) => a - b)).toEqual(bones.map((_, index) => index));
  });
});

describe('leaper motion', () => {
  it('rests on supports, clears the ground in the air and keeps the trunk closed in every clip', () => {
    expect(clipFailures(leaper)).toEqual([]);
  });

  it('actually leaves the ground in the pounce', () => {
    expect(frames(leaper, { clip: 'pounce', cuts: [], mirrored: false }).some((frame) => frame.airborne)).toBe(true);
  });

  it('keeps every clip inside the rig joint ranges', () => {
    const outside: string[] = [];
    for (const clip of LEAPER_CLIPS) {
      for (let i = 0; i <= FRAMES; i++) {
        for (const [id, [flex, twist, abduct]] of Object.entries(clipAngles(clip, i / FRAMES))) {
          const limits = bones.find((bone) => bone.id === id)!.limits!;
          const inside = (value: number, [lo, hi]: readonly [number, number]) => value >= lo && value <= hi;
          if (!(inside(flex, limits.flex) && inside(twist, limits.twist) && inside(abduct, limits.abduct))) {
            outside.push(`${clip} ${id} at ${(i / FRAMES).toFixed(3)}`);
          }
        }
      }
    }
    expect(outside).toEqual([]);
  });

  it('moves on whatever hind springs a cut leaves', () => {
    expect(locomotionFor(severedBoneSet(bones, ['thigh.L']))).toEqual({ clip: 'limp', mirrored: false });
    expect(locomotionFor(severedBoneSet(bones, ['thigh.R']))).toEqual({ clip: 'limp', mirrored: true });
    expect(locomotionFor(severedBoneSet(bones, ['thigh.L', 'thigh.R'])).clip).toBe('drag');
    expect(locomotionFor(severedBoneSet(bones, ['upperArm.L'])).clip).not.toMatch(CRIPPLE_GAIT);
  });

  it('peaks the eye telegraph before takeoff and settles after landing', () => {
    const { air } = leaperClip('pounce');
    const charges = frames(leaper, { clip: 'pounce', cuts: [], mirrored: false });
    const peak = charges.reduce((best, frame) => (frame.charge > best.charge ? frame : best));
    expect(peak.charge).toBeGreaterThan(1);
    expect(peak.u).toBeLessThanOrEqual(air!.from);
    expect(charges.at(-1)!.charge).toBe(1);
  });

  it('refuses an unknown clip rather than playing another', () => {
    expect(() => leaperFrame(leaper, 'no-such-clip', 0)).toThrow(UNKNOWN_CLIP);
  });
});

sweepGroup('leaper sweeps', () => {
  it('finds valid bodies and keeps every clip property across start seeds', () => {
    for (let seed = 1; seed < 48; seed++) {
      expect(clipFailures(searched(seed).full.realized), `seed ${seed}`).toEqual([]);
    }
  });
});
