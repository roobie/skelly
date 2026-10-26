import { describe, expect, it } from 'vitest';
import { fullProduct, tWiseCases } from './coveringArray.ts';

const specs = {
  a: { values: ['a0', 'a1', 'a2'] },
  b: { values: ['b0', 'b1'] },
  c: { values: ['c0', 'c1', 'c2', 'c3'] },
  d: { values: ['d0', 'd1'] },
  e: { values: ['e0', 'e1', 'e2'] },
} as const;

const names = Object.keys(specs) as (keyof typeof specs)[];

const tuples = (t: number): string[] => {
  const out: string[] = [];
  const pick = (start: number, chosen: (keyof typeof specs)[]): void => {
    if (chosen.length === t) {
      const expand = (i: number, prefix: string[]): void => {
        if (i === chosen.length) {
          out.push(prefix.join('|'));
          return;
        }
        for (const v of specs[chosen[i]!].values) {
          expand(i + 1, [...prefix, `${chosen[i]}=${v}`]);
        }
      };
      expand(0, []);
      return;
    }
    for (let i = start; i < names.length; i++) {
      pick(i + 1, [...chosen, names[i]!]);
    }
  };
  pick(0, []);
  return out;
};

const covered = (rows: Record<string, string>[], t: number): Set<string> => {
  const out = new Set<string>();
  const pick = (start: number, chosen: string[], row: Record<string, string>): void => {
    if (chosen.length === t) {
      out.add(chosen.map((n) => `${n}=${row[n]}`).join('|'));
      return;
    }
    for (let i = start; i < names.length; i++) {
      pick(i + 1, [...chosen, names[i]!], row);
    }
  };
  for (const row of rows) {
    pick(0, [], row);
  }
  return out;
};

describe('t-wise covering arrays for the part sweep', () => {
  for (const t of [1, 2, 3]) {
    it(`${t}-wise: every ${t}-tuple of parameter values appears, in fewer rows than the full product`, () => {
      const rows = tWiseCases(specs, t);
      const seen = covered(rows, t);
      const missing = tuples(t).filter((tuple) => !seen.has(tuple));
      expect(missing).toEqual([]);
      expect(rows.length).toBeLessThan(fullProduct(specs).length);
      for (const row of rows) {
        expect(Object.keys(row)).toEqual(names);
      }
    });
  }

  it('is deterministic', () => {
    expect(tWiseCases(specs, 3)).toEqual(tWiseCases(specs, 3));
  });

  it('returns the full product when t is at least the number of parameters', () => {
    expect(tWiseCases(specs, names.length)).toEqual(fullProduct(specs));
    expect(tWiseCases(specs, names.length + 1)).toEqual(fullProduct(specs));
  });
});
