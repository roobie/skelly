import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../src/core/coords.ts';
import { soundOcclusion } from '../src/core/soundOcclusion.ts';

const listener: Vec3 = [0.5, 1.5, 0.5];
const source: Vec3 = [5.5, 1.5, 0.5];

describe('positional sound occlusion', () => {
  it('applies one coarse muffling step for any solid on the source ray', () => {
    const clear = soundOcclusion(listener, source, () => false);
    const thinWall = soundOcclusion(listener, source, (x, y) => x === 2 && y === 1);
    const thickWall = soundOcclusion(listener, source, (x, y) => x >= 2 && x <= 3 && y === 1);
    const separatedWalls = soundOcclusion(listener, source, (x, y) => (x === 1 || x === 3) && y === 1);

    expect(clear.occluded).toBe(false);
    expect(thinWall.occluded).toBe(true);
    expect(thinWall).toEqual(thickWall);
    expect(thinWall).toEqual(separatedWalls);
    expect(thinWall.gain).toBeLessThan(clear.gain);
    expect(thinWall.cutoffHz).toBeLessThan(clear.cutoffHz);
  });

  it('does not muffle around a doorway or window gap outside the source ray', () => {
    const openGap = soundOcclusion(listener, source, (_x, y) => y === 2);

    expect(openGap.occluded).toBe(false);
    expect(openGap.gain).toBe(1);
  });
});
