import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileJsonnetFile } from '../../../tools/jsonnet/index.mjs';

const fixture = (name: string) => resolve(import.meta.dirname, 'fixtures', `${name}.jsonnet`);
const resolved = JSON.parse(compileJsonnetFile(fixture('grain-of'))) as Record<
  'class' | 'plain' | 'own',
  { grain: number; detailGrain?: number }
>;

describe('a source definition grain', () => {
  it('leaves a definition without one on its class grains', () => {
    expect(resolved.plain).toEqual(resolved.class);
  });

  it('replaces the class grain with the one the definition names, keeping detail parts nested', () => {
    expect(resolved.own.grain).toBe(0.004);
    expect(Number.isInteger(resolved.own.grain / resolved.own.detailGrain!)).toBe(true);
  });

  it.each(['grain-unnested', 'grain-zero'])('refuses %s', (name) => {
    expect(() => compileJsonnetFile(fixture(name))).toThrow('positive whole multiple');
  });
});
