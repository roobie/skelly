import { describe, expect, it } from 'vitest';
import { GRID } from '../src/core/conventions.ts';
import { validateExtrudedPolygon } from '../src/core/geometry.ts';
import { cross, dot, length } from '../src/core/math.ts';
import type { PartFamily } from '../src/core/schema.ts';
import { validate } from '../src/core/validate.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { FAMILIES } from '../src/gun/parts.ts';
import { variant } from './helpers.ts';

/** Every combination of a family's parameter values. */
const variants = (family: PartFamily): Record<string, string>[] =>
  Object.entries(family.params).reduce<Record<string, string>[]>(
    (acc, [name, spec]) => acc.flatMap((p) => spec.values.map((v) => ({ ...p, [name]: v }))),
    [{}],
  );

const onGrid = (n: number, step = GRID) => Math.abs(n / step - Math.round(n / step)) < 1e-9;

describe('part library', () => {
  it('integrates the rear grip, magazine well, dust cover, and trigger guard into the pistol frame', () => {
    const frame = FAMILIES.frame!.build({ bore: 'S', gripLength: 'M', slideLength: 'S' });
    expect(frame.tags).toContain('firing-grip');
    expect(frame.ports.map((port) => port.id)).toEqual(['slide', 'barrel', 'magazine']);
    expect(frame.solids.map((part) => part.id)).toContain('dust-cover');
    expect(frame.solids.map((part) => part.id)).toContain('trigger-guard-bottom');
    expect(frame.keepOuts.map((keepOut) => keepOut.id)).toContain('trigger-finger');
    expect(frame.ports.find((port) => port.id === 'magazine')!.pos[0]).toBeLessThan(-6);
    const guardTop = frame.solids.find(({ id }) => id === 'trigger-guard-top')!;
    expect(guardTop.kind).toBe('box');
    if (guardTop.kind === 'box') {
      expect(guardTop.box.half[0] * 2).toBeCloseTo(4);
      expect(guardTop.box.half[2] * 2).toBeCloseTo(1.25);
    }
  });

  it('scales the pistol bore channel, slide walls, and dust cover with bore size', () => {
    for (const [bore, radius] of [
      ['S', 0.75],
      ['M', 1],
    ] as const) {
      const slide = FAMILIES.slide!.build({ bore, length: 'S' });
      const frame = FAMILIES.frame!.build({ bore, gripLength: 'M', slideLength: 'S' });
      const left = slide.solids.find(({ id }) => id === 'side-left')!;
      const right = slide.solids.find(({ id }) => id === 'forward-side-right')!;
      const roof = slide.solids.find(({ id }) => id === 'top')!;
      const dustCover = frame.solids.find(({ id }) => id === 'dust-cover')!;
      const barrel = FAMILIES.barrel!.build({ bore, length: 'S', profile: 'pistol' }).solids[0]!;
      expect(left.kind).toBe('box');
      expect(right.kind).toBe('box');
      expect(roof.kind).toBe('box');
      expect(dustCover.kind).toBe('box');
      expect(barrel.kind).toBe('box');
      if (
        left.kind !== 'box' ||
        right.kind !== 'box' ||
        roof.kind !== 'box' ||
        dustCover.kind !== 'box' ||
        barrel.kind !== 'box'
      ) {
        throw new Error('Expected pistol solids to use boxes.');
      }
      const barrelMinZ = barrel.box.center[2] - barrel.box.half[2];
      const barrelMaxZ = barrel.box.center[2] + barrel.box.half[2];
      const leftInnerZ = left.box.center[2] + left.box.half[2];
      const leftClearance = barrelMinZ - leftInnerZ;
      const rightClearance = right.box.center[2] - right.box.half[2] - barrelMaxZ;
      expect(leftClearance).toBeCloseTo(0.125);
      expect(rightClearance).toBeCloseTo(0.125);
      expect(leftClearance).toBeLessThan(radius / 2);
      expect(dustCover.box.half[2]).toBeLessThanOrEqual(roof.box.half[2]);
    }
  });

  it('adds a beavertail grip-safety tang to both handgun frame styles', () => {
    const pistol = FAMILIES.frame!.build({ bore: 'S', gripLength: 'M', slideLength: 'S' });
    const revolver = FAMILIES.receiver!.build({ action: 'revolver', feed: 'cylinder', bore: 'S' });
    const pistolSafety = pistol.solids.find(({ id }) => id === 'beavertail-grip-safety');
    const revolverSafety = revolver.solids.find(({ id }) => id === 'beavertail-grip-safety');
    expect(pistolSafety?.kind).toBe('extruded-polygon');
    expect(revolverSafety?.kind).toBe('extruded-polygon');
    if (pistolSafety?.kind === 'extruded-polygon' && revolverSafety?.kind === 'extruded-polygon') {
      expect(pistolSafety.profile).toHaveLength(4);
      expect(revolverSafety.profile).toHaveLength(5);
      expect(pistolSafety.z).toEqual([-0.75, 0.75]);
      expect(revolverSafety.z).toEqual([-1.25, 1.25]);
    }
  });

  it('builds a hollow pistol slide with ejection port and sight rail', () => {
    const slide = FAMILIES.slide!.build({ bore: 'S', length: 'S' });
    expect(slide.ports.map((port) => port.id)).toEqual(['frame', 'barrel', 'rail']);
    expect(slide.solids.map((part) => part.id)).toContain('ejection-port-upper');
    const barrelChannelOccupied = slide.solids.some((part) => {
      if (part.kind !== 'box') {
        return false;
      }
      const { center, half } = part.box;
      const xRange = [center[0] - half[0], center[0] + half[0]];
      const yRange = [center[1] - half[1], center[1] + half[1]];
      const zRange = [center[2] - half[2], center[2] + half[2]];
      return (
        xRange[1]! > 0 && xRange[0]! < 11 && yRange[1]! > -3.5 && yRange[0]! < -1.5 && zRange[1]! > -1 && zRange[0]! < 1
      );
    });
    expect(barrelChannelOccupied).toBe(false);
  });

  it('limits the pistol barrel crown and offers a muzzle attachment port', () => {
    const barrel = FAMILIES.barrel!.build({ bore: 'S', length: 'S', profile: 'pistol' });
    const tube = barrel.solids[0]!;
    expect(tube.kind).toBe('box');
    if (tube.kind === 'box') {
      expect(tube.box.center[0] + tube.box.half[0]).toBeCloseTo(12);
    }
    expect(barrel.ports.find((port) => port.id === 'muzzle')?.pos[0]).toBe(12);
    expect(barrel.ports.find((port) => port.id === 'frame')?.required).toBe(true);
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

  it('uses the measured grip length bands for detached and integrated pistol grips', () => {
    const expected = { S: 7.5, M: 8.5, L: 9.5 };
    for (const size of ['S', 'M', 'L'] as const) {
      const body = FAMILIES.grip!.build({ length: size }).solids[0]!;
      expect(body.kind).toBe('extruded-polygon');
      if (body.kind === 'extruded-polygon') {
        expect(-Math.min(...body.profile.map(([, y]) => y))).toBe(expected[size]);
      }
      const frame = FAMILIES.frame!.build({ bore: 'M', gripLength: size, slideLength: 'M' });
      expect(frame.solids.some(({ id }) => id === 'well-wall-right')).toBe(true);
    }
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

  it('adds a bore-fitted clamp ring only when the handguard is joined to the barrel', () => {
    const clamped = FAMILIES.handguard!.build({ length: 'M', inner: 'M', bore: 'M' });
    const floating = FAMILIES.handguard!.build({ length: 'M', inner: 'M', bore: 'none' });
    expect(clamped.solids.map(({ id }) => id)).toContain('clamp-top');
    expect(clamped.solids.map(({ id }) => id)).toContain('clamp-right');
    expect(floating.solids.map(({ id }) => id)).not.toContain('clamp-top');
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
    const upper = grip.solids.find(({ id }) => id === 'body-upper');
    const frontWall = grip.solids.find(({ id }) => id === 'well-wall-right');
    expect(upper?.kind).toBe('extruded-polygon');
    expect(frontWall?.kind).toBe('box');
    if (upper?.kind !== 'extruded-polygon' || frontWall?.kind !== 'box') {
      throw new Error('Expected the integrated pistol-grip front panel and well wall.');
    }
    const gripFrontX = Math.max(...upper.profile.map(([x]) => x));
    const wellFrontX = frontWall.box.center[0] + frontWall.box.half[0];
    expect(wellFrontX).toBe(gripFrontX);
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

        const gridStep = family.name === 'frame' || family.name === 'slide' ? GRID / 2 : GRID;

        it(`${tag}: positions and extents are on the ${gridStep}u grid`, () => {
          const bounds = (box: { center: readonly number[]; half: readonly number[] }) =>
            box.center.flatMap((center, axis) => [center - box.half[axis]!, center + box.half[axis]!]);
          // Guard geometry preserves the pistol golden and exact contact with angled grips; it has its own geometry tests.
          const numbers = [
            ...def.solids.flatMap((s) =>
              s.kind === 'box' &&
              !s.id.startsWith('trigger-guard-') &&
              !(family.name === 'magazine' && params.profile === 'smg')
                ? bounds(s.box)
                : [],
            ),
            ...def.keepOuts.flatMap((k) => bounds(k.box)),
            ...def.ports.flatMap((p) => [...p.pos, p.slots?.pitch ?? 0]),
            ...def.axes.flatMap((a) => [...a.origin]),
          ];
          expect(numbers.filter((n) => !onGrid(n, gridStep))).toEqual([]);
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

describe('tapered stock profile', () => {
  it('widens from wrist to butt with a level comb and a downward-sloping belly', () => {
    const tapered = FAMILIES.stock!.build({ length: 'L', style: 'tapered' });
    const profiles = tapered.solids.filter((solid) => solid.kind === 'extruded-polygon');
    expect(profiles.length).toBeGreaterThan(0);
    for (const solid of profiles) {
      if (solid.kind === 'extruded-polygon') {
        expect(validateExtrudedPolygon(solid.profile, solid.z)).toBeUndefined();
      }
    }

    const vertices = profiles.flatMap((solid) => (solid.kind === 'extruded-polygon' ? solid.profile : []));
    const buttToeX = Math.min(...vertices.map(([x]) => x));
    const buttTopX = buttToeX + 0.25;
    const wristX = Math.max(...vertices.map(([x]) => x));
    const heightAt = (x: number) => {
      const ys = vertices.filter(([vx]) => Math.abs(vx - x) < 1e-6).map(([, y]) => y);
      return Math.max(...ys) - Math.min(...ys);
    };
    const extremeAt = (x: number, direction: 'min' | 'max') => {
      const ys = vertices.filter(([vx]) => Math.abs(vx - x) < 1e-6).map(([, y]) => y);
      return direction === 'min' ? Math.min(...ys) : Math.max(...ys);
    };
    const buttHeight = extremeAt(buttTopX, 'max') - extremeAt(buttToeX, 'min');
    const combAngle =
      (Math.atan2(Math.abs(extremeAt(buttTopX, 'max') - extremeAt(wristX, 'max')), Math.abs(buttTopX - wristX)) * 180) /
      Math.PI;
    const bellyAngle =
      (Math.atan2(Math.abs(extremeAt(buttToeX, 'min') - extremeAt(wristX, 'min')), Math.abs(buttToeX - wristX)) * 180) /
      Math.PI;

    expect(buttHeight).toBeGreaterThanOrEqual(heightAt(wristX) * 1.3);
    expect(extremeAt(buttTopX, 'max')).toBeLessThan(extremeAt(wristX, 'max'));
    expect(combAngle).toBeLessThanOrEqual(5);
    expect(extremeAt(buttToeX, 'min')).toBeLessThan(extremeAt(wristX, 'min'));
    expect(bellyAngle).toBeGreaterThanOrEqual(10);
  });
});

describe('pump shotgun tube and barrel contact', () => {
  for (const bore of ['S', 'M', 'L']) {
    it(`bore ${bore}: the tube reaches the barrel lug without a contact gap`, () => {
      const assembly = variant('archetype-pump-shotgun', (draft) => {
        draft.parts.receiver!.params!.bore = bore;
      });
      const report = validate(assembly, gunDomain);
      expect(report.issues).toEqual([]);
      expect(report.ok).toBe(true);
    });
  }
});
