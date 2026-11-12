import { safeParse } from 'valibot';
import { describe, expect, it } from 'vitest';
import { NonNegative, Positive } from '../src/core/schema/primitives.ts';

describe('shared number primitives', () => {
  it.each([
    ['NonNegative', NonNegative],
    ['Positive', Positive],
  ])('%s rejects infinity, which look blending would turn into NaN', (_name, schema) => {
    expect(safeParse(schema, Number.POSITIVE_INFINITY).success).toBe(false);
    expect(safeParse(schema, 1).success).toBe(true);
  });
});
