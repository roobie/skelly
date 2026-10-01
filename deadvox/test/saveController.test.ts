import { describe, expect, it } from 'vitest';
import { defaultClock } from '../src/core/clock.ts';
import { saveCheckpointInterval } from '../src/ui/saveController.ts';

describe('save checkpoint cadence', () => {
  it('uses two game hours in simulation seconds at the active clock ratio', () => {
    expect(saveCheckpointInterval(defaultClock)).toBe(900);
    expect(saveCheckpointInterval({ ratio: 4, start: 0 })).toBe(1800);
  });
});
