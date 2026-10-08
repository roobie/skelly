import { describe, expect, it } from 'vitest';
import { BLOCK_PATTERNS } from '../src/core/schema.ts';
import {
  isWeatherablePattern,
  WEATHERABLE_PATTERN_IDS,
  weatherablePatternGlsl,
} from '../src/render/weatherablePatterns.ts';

describe('weatherable surface patterns', () => {
  it('includes every patterned surface except none and corrugated', () => {
    BLOCK_PATTERNS.forEach((pattern, id) => {
      const expected = pattern !== 'none' && pattern !== 'corrugated';
      expect(isWeatherablePattern(pattern)).toBe(expected);
      expect(WEATHERABLE_PATTERN_IDS.includes(id)).toBe(expected);
    });
  });

  it('builds the shader predicate from the same weatherable IDs', () => {
    const predicate = weatherablePatternGlsl('patId');
    expect(WEATHERABLE_PATTERN_IDS.every((id) => predicate.includes(`abs(patId - ${id}.0) < 0.5`))).toBe(true);
    expect(predicate.includes('PAT_CORRUGATED')).toBe(false);
  });
});
