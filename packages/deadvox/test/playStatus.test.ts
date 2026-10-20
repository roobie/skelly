import { describe, expect, it } from 'vitest';
import { bodyRegionLabel } from '../src/core/body.ts';
import { bleedingStatusRows } from '../src/game/playStatus.ts';

describe('play status projection', () => {
  it('keeps bleeding tier labels and localized region names', () => {
    const rows = bleedingStatusRows((region) =>
      region === 'leftArm' ? { label: 'Fixture serious', warn: true } : undefined,
    );

    expect(rows).not.toHaveLength(0);
    expect(rows).toEqual([{ region: bodyRegionLabel('leftArm'), label: 'Fixture serious', warn: true }]);
  });
});
