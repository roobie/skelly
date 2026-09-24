import { describe, expect, it } from 'vitest';
import { GRID } from '../src/core/conventions.ts';
import { cross, dot, length } from '../src/core/math.ts';
import type { PartFamily } from '../src/core/schema.ts';
import { FAMILIES } from '../src/gun/parts.ts';

/** Every combination of a family's parameter values. */
const variants = (family: PartFamily): Record<string, string>[] =>
  Object.entries(family.params).reduce<Record<string, string>[]>(
    (acc, [name, spec]) => acc.flatMap((p) => spec.values.map((v) => ({ ...p, [name]: v }))),
    [{}],
  );

const onGrid = (n: number) => Math.abs(n / GRID - Math.round(n / GRID)) < 1e-9;

describe('part library', () => {
  for (const family of Object.values(FAMILIES)) {
    describe(family.name, () => {
      for (const params of variants(family)) {
        const def = family.build(params);
        const tag = JSON.stringify(params);

        it(`${tag}: positions and extents are on the ${GRID}u grid`, () => {
          const numbers = [
            ...def.solids.flatMap((s) => [...s.box.center, ...s.box.half]),
            ...def.keepOuts.flatMap((k) => [...k.box.center, ...k.box.half]),
            ...def.ports.flatMap((p) => [...p.pos, p.slots?.pitch ?? 0]),
            ...def.axes.flatMap((a) => [...a.origin]),
          ];
          expect(numbers.filter((n) => !onGrid(n))).toEqual([]);
        });

        it(`${tag}: port frames are orthonormal and ids unique`, () => {
          for (const p of def.ports) {
            expect(length(p.normal)).toBeCloseTo(1);
            expect(length(p.up)).toBeCloseTo(1);
            expect(dot(p.normal, p.up)).toBeCloseTo(0);
            expect(length(cross(p.normal, p.up))).toBeCloseTo(1);
          }
          expect(new Set(def.ports.map((p) => p.id)).size).toBe(def.ports.length);
          expect(def.solids.every((s) => s.box.half.every((h) => h > 0))).toBe(true);
        });
      }
    });
  }
});
