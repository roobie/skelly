import { describe, expect, it } from 'vitest';
import { parseSpawnTime, SECONDS_PER_DAY, SPAWN_TIMES, spawnWindowOpen } from '../src/core/clock.ts';

describe('spawn time windows', () => {
  it('parses named and clock-formatted game times', () => {
    expect(parseSpawnTime('dusk')).toBe(SPAWN_TIMES.dusk);
    expect(parseSpawnTime('06:30')).toBeDefined();
    expect(parseSpawnTime('sunset')).toBeUndefined();
    expect(parseSpawnTime('24:00')).toBeUndefined();
  });

  it('treats bounded windows as daily half-open intervals, including overnight ranges', () => {
    const window = { from: 'dusk', to: 'dawn' };
    expect(spawnWindowOpen(SPAWN_TIMES.dusk - 1, window)).toBe(false);
    expect(spawnWindowOpen(SPAWN_TIMES.dusk, window)).toBe(true);
    expect(spawnWindowOpen(SPAWN_TIMES.dusk + 1, window)).toBe(true);
    expect(spawnWindowOpen(SPAWN_TIMES.dawn, window)).toBe(false);
    expect(spawnWindowOpen(SECONDS_PER_DAY + SPAWN_TIMES.dusk, window)).toBe(true);
  });

  it('keeps an open-ended window eligible after its first opening', () => {
    const window = { from: 'dusk' };
    expect(spawnWindowOpen(SPAWN_TIMES.dusk - 1, window)).toBe(false);
    expect(spawnWindowOpen(SPAWN_TIMES.dusk, window)).toBe(true);
    expect(spawnWindowOpen(SECONDS_PER_DAY + SPAWN_TIMES.dawn, window)).toBe(true);
  });
});
