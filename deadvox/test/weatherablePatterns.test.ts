import { describe, expect, it } from 'vitest';
import { BLOCK_PATTERNS } from '../src/core/schema.ts';
import { WEATHERABLE_PATTERN_IDS, weatherablePatternGlsl } from '../src/render/weatherablePatterns.ts';

describe('weatherable surface patterns', () => {
  it('keeps the shader predicate iff a pattern is weatherable', () => {
    const predicate = weatherablePatternGlsl('patId');
    BLOCK_PATTERNS.forEach((pattern, id) => {
      const weatherable = pattern !== 'none' && pattern !== 'corrugated';
      expect(WEATHERABLE_PATTERN_IDS.includes(id)).toBe(weatherable);
      expect(predicate.includes(`abs(patId - ${id}.0) < 0.5`)).toBe(weatherable);
    });
  });
});
