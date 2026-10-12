import { describe, expect, it } from 'vitest';
import { bleedingStatusRows } from '../src/game/playStatus.ts';

describe('play status projection', () => {
  it('keeps bleeding tier labels and localized region names', () => {
    const rows = bleedingStatusRows((region) =>
      region === 'leftArm' ? { label: 'Fixture serious', warn: true } : undefined,
    );

    expect(rows).toEqual([{ region: 'Left Arm', label: 'Fixture serious', warn: true }]);
  });
});
