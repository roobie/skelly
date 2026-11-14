import { describe, expect, it } from 'vitest';
import { type CrackPattern, type CrackSite, crackReach, crackStrokes } from '../src/render/terrainCracks.ts';

const pattern: CrackPattern = {
  color: '#000000',
  opacity: 1,
  widthBlocks: 0.05,
  strands: 3,
  segments: 4,
  jitterRadians: 0.8,
  branchChance: 0.5,
  rootSpreadBlocks: 0.1,
  strandLengthBlocks: 0.5,
  branchSwingRadians: 0.8,
  branchStepFactor: 0.5,
  tipWidthFactor: 0.5,
  steps: [
    { from: 0.2, reach: 0.25 },
    { from: 0.5, reach: 0.5 },
    { from: 0.8, reach: 1 },
  ],
};

const site: CrackSite = { seed: 11, cell: [3, 7, -2], face: 'e' };

describe('terrain cracks', () => {
  it('shows no crack without damage or below the first step', () => {
    expect(crackReach(0, pattern.steps)).toBe(0);
    expect(crackReach(pattern.steps[0]!.from / 2, pattern.steps)).toBe(0);
    expect(crackStrokes(site, 0, pattern)).toEqual([]);
  });

  it('reaches as far as the highest step the damage fraction has met', () => {
    expect(crackReach(pattern.steps[1]!.from, pattern.steps)).toBe(pattern.steps[1]!.reach);
    expect(crackReach(1, pattern.steps)).toBe(pattern.steps.at(-1)!.reach);
  });

  it('draws the same crack for the same seed, cell and face', () => {
    expect(crackStrokes(site, 1, pattern)).toEqual(crackStrokes({ ...site, cell: [...site.cell] }, 1, pattern));
  });

  it('only grows as reach rises: each lower reach shows a strictly smaller part of the higher crack', () => {
    const reaches = pattern.steps.map(({ reach }) => reach);
    for (const [at, reach] of reaches.entries()) {
      const lower = crackStrokes(site, reach, pattern);
      const higher = crackStrokes(site, reaches[at + 1] ?? reach, pattern);
      for (const stroke of lower) {
        expect(higher).toContainEqual(stroke);
      }
    }
    expect(crackStrokes(site, reaches[0]!, pattern).length).toBeGreaterThan(0);
    expect(crackStrokes(site, reaches[0]!, pattern).length).toBeLessThan(crackStrokes(site, 1, pattern).length);
  });

  it('cracks different cells differently', () => {
    expect(crackStrokes({ ...site, cell: [4, 7, -2] }, 1, pattern)).not.toEqual(crackStrokes(site, 1, pattern));
  });

  it('keeps every stroke on its face', () => {
    const wild = { ...pattern, jitterRadians: Math.PI, branchChance: 1 };
    const points = (['e', 'w', 'up', 'down', 's', 'n'] as const).flatMap((face) =>
      [0, 1, 2, 3].flatMap((x) =>
        crackStrokes({ seed: 5, cell: [x, 0, 0], face }, 1, wild).flatMap((stroke) => stroke.slice(0, 4)),
      ),
    );
    expect(points.length).toBeGreaterThan(0);
    expect(points.every((value) => value >= 0 && value <= 1)).toBe(true);
  });
});
