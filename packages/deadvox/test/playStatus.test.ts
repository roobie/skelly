import { bodyRegionLabel } from '@skelly/engine/sim';
import { describe, expect, it } from 'vitest';
import { bleedingStatusRows } from '../../presentation/src/presentation/playStatus.ts';

describe('play status projection', () => {
  it('keeps bleeding tier labels and localized region names', () => {
    const rows = bleedingStatusRows((region) =>
      region === 'leftArm' ? { label: 'Fixture serious', warn: true } : undefined,
    );

    expect(rows).not.toHaveLength(0);
    expect(rows).toEqual([{ region: bodyRegionLabel('leftArm'), label: 'Fixture serious', warn: true }]);
  });
});
