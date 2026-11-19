import process from 'node:process';
import { buildRegistry, wieldMotionFileIssues } from '@skelly/engine/content';
import { admitPacks } from '@skelly/engine/packs';
import { describe, expect, it } from 'vitest';
import { declaredFileReader, readBundledPacks } from '../tools/readBundledPacks.ts';

interface Clip {
  durationSimSeconds?: number;
  hitAtSimSeconds?: number;
  phases?: { phase: string; endsAtSimSeconds: number }[];
  strideMetres?: number;
  held?: { bone: string };
}

interface Motions {
  rig: { id: string; revision: number };
  clips: Record<string, Clip>;
}

const packs = readBundledPacks(process.cwd(), 'skelly.deadvox');
const admitted = admitPacks(packs);
const { registry } = buildRegistry(admitted.sources);
const read = declaredFileReader(process.cwd(), admitted.packs, packs);
const [row] = registry.wieldMotions.values();
const { source } = registry.contentOrigins.get(`wieldMotions:${row!.id}`)!;
const parse = (file: string): unknown => JSON.parse(read(source, file).toString('utf8'));
const rig = parse(row!.rig);
const motions = parse(row!.clips) as Motions;

/** A copy of the pinned clips with one change made to it. */
const changed = (change: (copy: Motions) => void): Motions => {
  const copy = structuredClone(motions);
  change(copy);
  return copy;
};
const clips = Object.entries(motions.clips);
const [strike] = clips.find(([, clip]) => clip.phases !== undefined)!;
const [seated] = clips.find(([, clip]) => clip.held !== undefined)!;

describe('wield motions', () => {
  it('admits every clip of the pinned pack: strikes with phases, stances with held and walk holds', () => {
    expect(admitted.issues).toEqual([]);
    expect(clips.some(([, clip]) => clip.phases === undefined && clip.held !== undefined)).toBe(true);
    expect(clips.some(([, clip]) => clip.strideMetres !== undefined && clip.held !== undefined)).toBe(true);
    expect(wieldMotionFileIssues(rig, motions)).toEqual([]);
  });

  it.each([
    [
      'phases out of order',
      (copy: Motions) => {
        const phases = copy.clips[strike]!.phases!;
        [phases[0], phases[1]] = [phases[1]!, phases[0]!];
      },
      `.clips.clips.${strike}`,
      'phases must be windup, strike, follow, recovery in that order, each ending after the one before',
    ],
    [
      'a hit outside its strike',
      (copy: Motions) => {
        const clip = copy.clips[strike]!;
        clip.hitAtSimSeconds = clip.phases![0]!.endsAtSimSeconds;
      },
      `.clips.clips.${strike}`,
      'hitAtSimSeconds must be where the strike phase ends',
    ],
    [
      'a held seat naming an unknown bone',
      (copy: Motions) => {
        copy.clips[seated]!.held!.bone = 'tentacle';
      },
      `.clips.clips.${seated}.held.bone`,
      'seats the weapon on bone tentacle, which the rig lacks',
    ],
    [
      'a weapon class clip without its seat',
      (copy: Motions) => {
        const { held: _, ...unseated } = copy.clips[seated]!;
        copy.clips[seated] = unseated;
      },
      '.clips.clips',
      `class ${seated.split('_')[0]!} must seat its weapon by held in every clip or in none`,
    ],
    [
      'clips posing another rig revision',
      (copy: Motions) => {
        copy.rig.revision += 1;
      },
      '.clips.rig',
      `must name the rig the row loads, ${motions.rig.id} revision ${motions.rig.revision}`,
    ],
  ])('refuses %s', (_, change, path, message) => {
    expect(wieldMotionFileIssues(rig, changed(change))).toEqual([{ path, message }]);
  });

  it('admits a row only from a pack that declares its files as json', () => {
    const inputs = structuredClone(packs);
    const body = inputs.find(({ manifest }) => manifest.files.some(({ path }) => path === row!.clips))!;
    body.manifest.files = body.manifest.files.map((file) =>
      file.path === row!.clips ? { ...file, kind: 'asset' } : file,
    );
    expect(admitPacks(inputs).issues.map(({ message }) => message)).toContain(
      `Pack ${body.manifest.id}: wield motions ${row!.id} clips must be a file the pack declares as json`,
    );
  });
});
