import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../src/core/coords.ts';
import { soundOcclusion } from '../src/core/soundOcclusion.ts';

const listener: Vec3 = [0.5, 1.5, 0.5];
const source: Vec3 = [5.5, 1.5, 0.5];
const wallTuning = { hearingRangeScale: 0.6, gain: 0.5, cutoffHz: 1200, clearGain: 1, clearCutoffHz: 18_000 };

describe('positional sound occlusion', () => {
  it('applies one coarse muffling step for any solid on the source ray', () => {
    const clear = soundOcclusion({ listener, source, isSolid: () => false, globalWall: wallTuning });
    const thinWall = soundOcclusion({
      listener,
      source,
      isSolid: (x, y) => x === 2 && y === 1,
      globalWall: wallTuning,
    });
    const thickWall = soundOcclusion({
      listener,
      source,
      isSolid: (x, y) => x >= 2 && x <= 3 && y === 1,
      globalWall: wallTuning,
    });
    const separatedWalls = soundOcclusion({
      listener,
      source,
      isSolid: (x, y) => (x === 1 || x === 3) && y === 1,
      globalWall: wallTuning,
    });

    expect(clear.occluded).toBe(false);
    expect(thinWall.occluded).toBe(true);
    expect(thinWall).toEqual(thickWall);
    expect(thinWall).toEqual(separatedWalls);
    expect(thinWall.gain).toBeLessThan(clear.gain);
    expect(thinWall.cutoffHz).toBeLessThan(clear.cutoffHz);
  });

  it('uses per-sound wall tuning only when the shared ray is occluded', () => {
    const tunedSound = { id: 'fixture_tuned_sound', wall: { gain: 0.23, cutoffHz: 850 } };
    const untunedSound: { id: string; wall?: typeof tunedSound.wall } = { id: 'fixture_default_sound' };
    const wallAt = (x: number, y: number) => x === 2 && y === 1;
    const tuned = soundOcclusion({
      listener,
      source,
      isSolid: wallAt,
      globalWall: wallTuning,
      soundWall: tunedSound.wall,
    });
    const global = soundOcclusion({
      listener,
      source,
      isSolid: wallAt,
      globalWall: wallTuning,
      soundWall: untunedSound.wall,
    });
    const clearTuned = soundOcclusion({
      listener,
      source,
      isSolid: () => false,
      globalWall: wallTuning,
      soundWall: tunedSound.wall,
    });
    const clearGlobal = soundOcclusion({ listener, source, isSolid: () => false, globalWall: wallTuning });

    expect(tuned).toMatchObject({ occluded: true, gain: tunedSound.wall.gain, cutoffHz: tunedSound.wall.cutoffHz });
    expect(global.occluded).toBe(true);
    expect(global).not.toEqual(tuned);
    expect(clearTuned.occluded).toBe(false);
    expect(clearTuned.gain).toBe(clearGlobal.gain);
    expect(clearTuned.cutoffHz).toBe(clearGlobal.cutoffHz);
  });

  it('does not muffle around a doorway or window gap outside the source ray', () => {
    const openGap = soundOcclusion({ listener, source, isSolid: (_x, y) => y === 2, globalWall: wallTuning });

    expect(openGap.occluded).toBe(false);
    expect(openGap.gain).toBe(wallTuning.clearGain);
  });
});
