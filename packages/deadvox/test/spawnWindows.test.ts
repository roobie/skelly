import { describe, expect, it } from 'vitest';
import { resolveSpawnTime, SECONDS_PER_DAY, type SpawnTimeCycle, spawnWindowOpen } from '../src/core/clock.ts';
import { dayPhaseAt } from '../src/core/dayPhase.ts';
import { gameTimeOfDay } from '../src/core/time.ts';

// A cycle that differs from core content in every named time, so a test passes only by reading the cycle it is given.
const cycle: SpawnTimeCycle = {
  latitudeDegrees: 55,
  date: { month: 12, day: 1 },
  twilight: 'nautical',
  midnightGameTimeOfDay: 1800,
  noonGameTimeOfDay: 13 * 3600,
};
const sun = dayPhaseAt(cycle, 0);
const { sunset: dusk, dawn } = sun;

describe('spawn time windows', () => {
  it('resolves names against the day cycle: the sun for dawn and dusk, content for midnight and noon', () => {
    expect(resolveSpawnTime(cycle, 'dawn')).toBe(dawn);
    expect(resolveSpawnTime(cycle, 'dusk')).toBe(dusk);
    expect(resolveSpawnTime(cycle, 'midnight')).toBe(cycle.midnightGameTimeOfDay);
    expect(resolveSpawnTime(cycle, 'noon')).toBe(cycle.noonGameTimeOfDay);
    expect(resolveSpawnTime(cycle, gameTimeOfDay(5000))).toBe(5000);
  });

  it('treats bounded windows as daily half-open intervals, including overnight ranges', () => {
    const window = { fromGameTimeOfDay: 'dusk', toGameTimeOfDay: 'dawn' } as const;
    expect(spawnWindowOpen(dusk - 1, window, cycle)).toBe(false);
    expect(spawnWindowOpen(dusk, window, cycle)).toBe(true);
    expect(spawnWindowOpen(dusk + 1, window, cycle)).toBe(true);
    expect(spawnWindowOpen(dawn, window, cycle)).toBe(false);
    expect(spawnWindowOpen(SECONDS_PER_DAY + dusk, window, cycle)).toBe(true);
  });

  it('keeps an open-ended window eligible after its first opening', () => {
    const window = { fromGameTimeOfDay: 'dusk' } as const;
    expect(spawnWindowOpen(dusk - 1, window, cycle)).toBe(false);
    expect(spawnWindowOpen(dusk, window, cycle)).toBe(true);
    expect(spawnWindowOpen(SECONDS_PER_DAY + dawn, window, cycle)).toBe(true);
  });
});
