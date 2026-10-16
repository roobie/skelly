import { describe, expect, it } from 'vitest';
import { acidGlowLevel } from '../src/render/zombieGlow.ts';

describe('acidGlowLevel', () => {
  it('rises from the idle level to the wind-up level as the spit winds up', () => {
    const acid = { idle: 0.25, windup: 2 };
    const levels = [0, 0.25, 0.5, 0.75, 1].map((progress) => acidGlowLevel(acid, progress));
    expect(levels[0]).toBe(acid.idle);
    expect(levels.at(-1)).toBe(acid.windup);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]).toBeGreaterThan(levels[i - 1]!);
    }
  });
});
