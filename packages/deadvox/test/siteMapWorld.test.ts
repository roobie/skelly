import { describe, expect, it } from 'vitest';
import { mapWorldShape } from '../src/siteMapWorld.ts';

const shape = (query: string) => mapWorldShape(new URLSearchParams(query));

describe('review map world shape', () => {
  it('draws one storey and the site density when the query names neither', () => {
    expect(shape('')).toEqual({ storeys: 1, density: null });
  });

  it('takes whole storeys within bounds and falls back to one outside them', () => {
    expect(shape('storeys=6').storeys).toBe(6);
    for (const storeys of ['0', '99', '2.5', 'NaN']) {
      expect(shape(`storeys=${storeys}`).storeys, storeys).toBe(1);
    }
  });

  it('takes a density from zero to one inclusive and the site density otherwise', () => {
    for (const density of ['0', '0.25', '1']) {
      expect(shape(`density=${density}`).density).toBe(Number(density));
    }
    for (const density of ['', '-1', '2', 'NaN']) {
      expect(shape(`density=${density}`).density, density).toBeNull();
    }
  });
});
