import { describe, expect, it } from 'vitest';
import {
  gameHours,
  gameMinutes,
  gameToSimSeconds,
  gameToSimTimestamp,
  simMinutes,
  simTimestamp,
  simToGameSeconds,
  simToGameTimestamp,
} from '../src/core/time.ts';

describe('clock-branded time values', () => {
  it('normalizes declared units to canonical seconds while retaining the clock brand', () => {
    expect(gameMinutes(2)).toBe(120);
    expect(gameHours(0.5)).toBe(1800);
    expect(simMinutes(0.25)).toBe(15);
  });

  it('converts spans and instants through explicit clock operations', () => {
    const clock = { ratio: 4, start: 1000 };
    const gameSpan = simToGameSeconds(clock, simMinutes(2));
    expect(gameSpan).toBe(480);
    expect(gameToSimSeconds(clock, gameSpan)).toBe(120);

    const gameInstant = simToGameTimestamp(clock, simTimestamp(3));
    expect(gameInstant).toBe(1012);
    expect(gameToSimTimestamp(clock, gameInstant)).toBe(3);
  });
});
