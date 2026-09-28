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
  it('builds a pistol lower with a trigger guard and no magazine well', () => {
    const lower = FAMILIES.lower!.build({ layout: 'pistol' });
    expect(lower.ports.map((port) => port.id)).toEqual(['top', 'grip']);
    expect(lower.solids.map((solid) => solid.id)).toContain('trigger-guard-bottom');
    expect(lower.ports.some((port) => port.mount === 'magazine')).toBe(false);
  });

  it('adds slide travel to the slide-action receiver', () => {
    const receiver = FAMILIES.receiver!.build({ action: 'slide', feed: 'box', bore: 'S' });
    expect(receiver.keepOuts.map((keepOut) => keepOut.id)).toEqual(['ejection', 'slide-travel']);
  });

  it('keeps the pistol barrel short within the existing size-S family', () => {
    const barrel = FAMILIES.barrel!.build({ bore: 'S', length: 'S', profile: 'pistol' });
    const tube = barrel.solids[0]!;
    expect(tube.kind).toBe('box');
    if (tube.kind === 'box') {
      expect(tube.box.center[0] + tube.box.half[0]).toBeCloseTo(8);
    }
  });

  it('builds a revolver frame with a cylinder window and the required clearance volumes', () => {
    const frame = FAMILIES.receiver!.build({ action: 'revolver', feed: 'cylinder', bore: 'S' });
    expect(frame.solids.map((part) => part.id)).toContain('top-strap');
    expect(frame.solids.map((part) => part.id)).toContain('cylinder-side-near');
    expect(frame.ports.map((port) => port.id)).toContain('cylinder');
    expect(frame.keepOuts.map((keepOut) => keepOut.id)).toEqual(['cylinder-gap', 'cylinder-swing', 'hammer-travel']);
  });

  it('adds the barrel-to-cylinder loop port to the revolver barrel profile', () => {
    const barrel = FAMILIES.barrel!.build({ bore: 'S', length: 'S', profile: 'revolver' });
    expect(barrel.ports.map((port) => port.id)).toContain('cylinder');
    const tube = barrel.solids[0]!;
    expect(tube.kind).toBe('box');
    if (tube.kind === 'box') {
      expect(tube.box.center[0] + tube.box.half[0]).toBeCloseTo(12);
    }
  });

  it('builds six- or eight-sided revolver cylinders with an aligned chamber axis', () => {
    const six = FAMILIES.cylinder!.build({ chambers: 'six', chamber: 'aligned' });
    const eight = FAMILIES.cylinder!.build({ chambers: 'eight', chamber: 'aligned' });
    expect(six.solids[0]!.kind).toBe('extruded-polygon');
    expect(eight.solids[0]!.kind).toBe('extruded-polygon');
    if (six.solids[0]!.kind === 'extruded-polygon' && eight.solids[0]!.kind === 'extruded-polygon') {
      expect(six.solids[0]!.profile).toHaveLength(6);
      expect(eight.solids[0]!.profile).toHaveLength(8);
    }
    expect(six.axes[0]!.origin[0]).toBeCloseTo(0);
    expect(six.axes[0]!.origin[1]).toBeCloseTo(3);
    expect(eight.axes[0]!.origin[0]).toBeCloseTo(0);
    expect(eight.axes[0]!.origin[1]).toBeCloseTo(3);
  });

  it('models the grip as one beveled prism matching its mount face', () => {
    const { solids } = FAMILIES.grip!.build({ length: 'M' });
    expect(solids).toHaveLength(1);
    const [body] = solids;
    expect(body?.kind).toBe('extruded-polygon');
    if (body?.kind === 'extruded-polygon') {
      expect(body.profile).toHaveLength(5);
      expect(body.profile[3]![1]).toBeCloseTo(Math.tan((18 * Math.PI) / 180) * body.profile[3]![0]);
      expect(body.profile[4]![1]).toBeCloseTo(Math.tan((18 * Math.PI) / 180) * body.profile[4]![0]);
    }
  });

  it('builds a magazine well into the pistol grip', () => {
    const grip = FAMILIES.grip!.build({ length: 'S', well: 'magazine' });
    expect(grip.ports.map((port) => port.id)).toEqual(['top', 'magazine']);
    expect(grip.keepOuts).toHaveLength(1);
    expect(grip.keepOuts[0]!.allowPort).toBe('magazine');
    expect(grip.solids.map((solid) => solid.id)).toEqual([
      'body-upper',
      'well-wall-left',
      'well-wall-right',
      'well-wall-near',
      'well-wall-far',
    ]);
    const magazine = FAMILIES.magazine!.build({ length: 'S', profile: 'pistol' }).solids[0]!;
    expect(magazine.kind).toBe('box');
    if (magazine.kind === 'box') {
      expect(magazine.box.half[0] * 2).toBeCloseTo(3.5);
      expect(magazine.box.half[1] * 2).toBeCloseTo(6);
      expect(magazine.box.center[1] + magazine.box.half[1]).toBeCloseTo(5.75);
      expect(magazine.box.half[2] * 2).toBeCloseTo(2);
    }
  });

  it('scales the SMG magazine section by 0.6 in X and 0.8 in Z', () => {
    const body = FAMILIES.magazine!.build({ length: 'L', profile: 'smg' }).solids[0]!;
    expect(body.kind).toBe('box');
    if (body.kind === 'box') {
      expect(body.box.half[0] * 2).toBeCloseTo(5.5 * 0.6);
      expect(body.box.half[2] * 2).toBeCloseTo(2.5 * 0.8);
    }
  });

  for (const family of Object.values(FAMILIES)) {
    describe(family.name, () => {
      for (const params of variants(family)) {
        const def = family.build(params);
        const tag = JSON.stringify(params);

        it(`${tag}: positions and extents are on the ${GRID}u grid`, () => {
          const bounds = (box: { center: readonly number[]; half: readonly number[] }) =>
            box.center.flatMap((center, axis) => [center - box.half[axis]!, center + box.half[axis]!]);
          const numbers = [
            ...def.solids.flatMap((s) =>
              s.kind === 'box' && !(family.name === 'magazine' && params.profile === 'smg') ? bounds(s.box) : [],
            ),
            ...def.keepOuts.flatMap((k) => bounds(k.box)),
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
          expect(def.solids.every((s) => s.kind !== 'box' || s.box.half.every((h) => h > 0))).toBe(true);
        });
      }
    });
  }
});
