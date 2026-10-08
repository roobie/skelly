import { BLOCK_PATTERNS } from '../core/schema.ts';

const EXCLUDED_WEATHERING_PATTERNS = new Set(['none', 'corrugated']);

/** Pattern names whose surfaces can receive the render-only weathering layer. */
export const WEATHERABLE_PATTERN_IDS = BLOCK_PATTERNS.flatMap((pattern, id) =>
  EXCLUDED_WEATHERING_PATTERNS.has(pattern) ? [] : [id],
);

export const isWeatherablePattern = (pattern: (typeof BLOCK_PATTERNS)[number]): boolean =>
  !EXCLUDED_WEATHERING_PATTERNS.has(pattern);

/** GLSL predicate derived from the same pattern IDs used by the pixel mask. */
export const weatherablePatternGlsl = (patternExpression: string): string =>
  WEATHERABLE_PATTERN_IDS.map((id) => `abs(${patternExpression} - ${id}.0) < 0.5`).join(' || ');
