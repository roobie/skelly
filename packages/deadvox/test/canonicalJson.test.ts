import { describe, expect, it } from 'vitest';
import {
  canonicalJson,
  canonicalJsonBytes,
  decodeCanonicalNumbers,
  NEGATIVE_ZERO_TAG,
} from '../src/core/canonicalJson.ts';

describe('canonical JSON', () => {
  it('sorts object keys and preserves ECMAScript number representations', () => {
    const value = { z: 0.1 + 0.2, a: -0, b: Number.MIN_VALUE };
    expect(canonicalJson(value)).toBe(`{"a":{"\\u0000deadvox-number":"-0"},"b":5e-324,"z":0.30000000000000004}`);
    expect(new TextDecoder().decode(canonicalJsonBytes(value))).toBe(canonicalJson(value));
  });

  it('rejects non-finite numbers and user objects carrying the reserved tag', () => {
    expect(() => canonicalJson({ nested: Number.POSITIVE_INFINITY })).toThrow('Non-finite number at $.nested');
    expect(() => canonicalJson({ [NEGATIVE_ZERO_TAG]: '-0' })).toThrow('Reserved number tag');
  });

  it('accepts only the wire tag in decode mode and restores negative zero', () => {
    const tagged: unknown = { [NEGATIVE_ZERO_TAG]: '-0' };
    expect(canonicalJson(tagged, { acceptTaggedNegativeZero: true })).toBe(`{"\\u0000deadvox-number":"-0"}`);
    expect(Object.is(decodeCanonicalNumbers(tagged), -0)).toBe(true);
    expect(() => canonicalJson({ [NEGATIVE_ZERO_TAG]: '-1' }, { acceptTaggedNegativeZero: true })).toThrow(
      'Reserved number tag',
    );
  });
});
