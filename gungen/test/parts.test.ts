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
  const profile = (stockSize: 'M' | 'L') => {
    const def = FAMILIES.stock!.build({ length: stockSize, style: 'tapered' });
    const solids = def.solids.filter((solid) => solid.kind === 'extruded-polygon');
    const byId = (id: string) => {
      const solid = solids.find((candidate) => candidate.id === id);
      if (solid?.kind !== 'extruded-polygon') {
        throw new Error(`missing profile ${id}`);
      }
      return solid;
    };
    const [jointX] = def.ports.find((port) => port.id === 'front')!.pos;
    const stockLength = jointX - Math.min(...byId('butt-pad').profile.map(([x]) => x));
    return { def, solids, byId, jointX, stockLength };
  };
  const segmentSection = (profilePoints: readonly (readonly [number, number])[], x: number): number[] => {
    const ys: number[] = [];
    for (let i = 0; i < profilePoints.length; i++) {
      const a = profilePoints[i]!;
      const b = profilePoints[(i + 1) % profilePoints.length]!;
      if (x < Math.min(a[0], b[0]) - 1e-8 || x > Math.max(a[0], b[0]) + 1e-8) {
        continue;
      }
      if (Math.abs(a[0] - b[0]) < 1e-8) {
        if (Math.abs(x - a[0]) < 1e-8) {
          ys.push(a[1], b[1]);
        }
        continue;
      }
      const t = (x - a[0]) / (b[0] - a[0]);
      ys.push(a[1] + t * (b[1] - a[1]));
    }
    return ys;
  };
  const section = (solids: ReturnType<typeof profile>['solids'], x: number) => {
    const ys = solids.flatMap((solid) => segmentSection(solid.profile, x));
    return { min: Math.min(...ys), max: Math.max(...ys), height: Math.max(...ys) - Math.min(...ys) };
  };
  const degrees = (dx: number, dy: number) => (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI;

  for (const size of ['M', 'L'] as const) {
    it(`${size}: extruded stock profiles are valid`, () => {
      for (const solid of profile(size).solids) {
        expect(validateExtrudedPolygon(solid.profile, solid.z)).toBeUndefined();
      }
    });

    it(`${size}: comb starts at the built receiver rear-face centre`, () => {
      const { def, solids, jointX } = profile(size);
      const receiver = FAMILIES.receiver!.build({ action: 'pump', feed: 'tube', bore: 'L', rail: 'full' });
      const body = receiver.solids.find((solid) => solid.id === 'body')!;
      if (body.kind !== 'box') {
        throw new Error('pump receiver body is not a box');
      }
      const [, centerY] = body.box.center;
      const [, halfY] = body.box.half;
      const [, stockPortY] = receiver.ports.find((port) => port.id === 'stock')!.pos;
      const rearFaceTopY = centerY + halfY;
      const combAtJoint = section(solids, jointX).max + stockPortY;
      expect(Math.abs(combAtJoint - centerY)).toBeLessThanOrEqual(0.25);
      expect(def.ports.find((port) => port.id === 'front')?.pos).toEqual([0, 0, 0]);
      expect(rearFaceTopY - combAtJoint).toBeCloseTo(halfY, 5);
    });

    it(`${size}: wrist, grip station/depth, and comb slope stay in their landmark bounds`, () => {
      const { byId, solids, jointX, stockLength } = profile(size);
      const grip = byId('grip');
      const wristX = Math.max(...grip.profile.map(([x]) => x));
      const wrist = section(solids, wristX);
      expect((jointX - wristX) / stockLength).toBeGreaterThanOrEqual(0.1);
      expect((jointX - wristX) / stockLength).toBeLessThanOrEqual(0.25);
      expect(wrist.height / stockLength).toBeGreaterThanOrEqual(0.15);
      expect(wrist.height / stockLength).toBeLessThanOrEqual(0.22);

      const lowest = grip.profile.reduce((best, point) => (point[1] < best[1] ? point : best));
      const depth = section(solids, lowest[0]).max - lowest[1];
      expect((jointX - lowest[0]) / stockLength).toBeGreaterThanOrEqual(0.18);
      expect((jointX - lowest[0]) / stockLength).toBeLessThanOrEqual(0.3);
      expect(depth / stockLength).toBeGreaterThanOrEqual(0.24);
      expect(depth / stockLength).toBeLessThanOrEqual(0.32);
    });

    it(`${size}: belly, butt and recoil pad meet their bounds`, () => {
      const { byId, stockLength } = profile(size);
      const belly = byId('belly');
      const pad = byId('butt-pad');
      const toe = belly.profile[0]!;
      const bellyRear = belly.profile[1]!;
      const bellyAngle = degrees(toe[0] - bellyRear[0], toe[1] - bellyRear[1]);
      expect(bellyAngle).toBeGreaterThanOrEqual(10);
      expect(bellyAngle).toBeLessThanOrEqual(16);

      const padYs = pad.profile.map(([, y]) => y);
      const padMinY = Math.min(...padYs);
      const padMaxY = Math.max(...padYs);
      expect((padMaxY - padMinY) / stockLength).toBeGreaterThanOrEqual(0.3);
      expect((padMaxY - padMinY) / stockLength).toBeLessThanOrEqual(0.38);
      const rearBottom = pad.profile.filter(([, y]) => y === padMinY).sort((a, b) => a[0] - b[0])[0]!;
      const rearTop = pad.profile.filter(([, y]) => y === padMaxY).sort((a, b) => a[0] - b[0])[0]!;
      const rake =
        (Math.atan2(Math.abs(rearTop[0] - rearBottom[0]), Math.abs(rearTop[1] - rearBottom[1])) * 180) / Math.PI;
      expect(rake).toBeLessThanOrEqual(8);
      const bottomXs = pad.profile
        .filter(([, y]) => y === padMinY)
        .map(([x]) => x)
        .sort((a, b) => a - b);
      const topXs = pad.profile
        .filter(([, y]) => y === padMaxY)
        .map(([x]) => x)
        .sort((a, b) => a - b);
      const padThickness = Math.min(bottomXs[1]! - bottomXs[0]!, topXs[1]! - topXs[0]!) / stockLength;
      expect(padThickness).toBeGreaterThanOrEqual(0.05);
      expect(padThickness).toBeLessThanOrEqual(0.08);
    });
  }
});

describe('pump stock raised butt heel', () => {
  const baselineToeY = { M: -7.518_598_945_248, L: -10.351_249_252_97 } as const;
  const measure = (size: 'M' | 'L') => {
    const def = FAMILIES.stock!.build({ length: size, style: 'tapered' });
    const prism = def.solids.find((solid) => solid.id === 'belly');
    const pad = def.solids.find((solid) => solid.id === 'butt-pad');
    if (prism?.kind !== 'extruded-polygon' || pad?.kind !== 'extruded-polygon') {
      throw new Error('tapered stock must have a belly prism and recoil pad');
    }
    const padYs = pad.profile.map(([, y]) => y);
    const toeY = Math.min(...padYs);
    const topY = Math.max(...padYs);
    const rearBottom = prism.profile.find(([, y]) => y === toeY)!;
    const rearTop = prism.profile.find(([, y]) => y === topY)!;
    const [jointX] = def.ports.find((port) => port.id === 'front')!.pos;
    const stockLength = jointX - Math.min(...pad.profile.map(([x]) => x));
    return { pad, rearBottom, rearTop, stockLength, toeY, topY };
  };

  for (const size of ['M', 'L'] as const) {
    it(`${size}: raises only the rear top by 5% and preserves the rear toe`, () => {
      const result = measure(size);
      const oldHeight = 0.34 * result.stockLength;
      const newHeight = result.rearTop[1] - result.rearBottom[1];
      const ratio = newHeight / oldHeight;
      expect(ratio).toBeGreaterThanOrEqual(1.045);
      expect(ratio).toBeLessThanOrEqual(1.055);
      expect(Math.abs(result.rearBottom[1] - baselineToeY[size])).toBeLessThanOrEqual(1e-9);
      expect(result.topY).toBe(result.rearTop[1]);
      expect(result.toeY).toBe(result.rearBottom[1]);
    });
  }
});

describe('pump shotgun tube and barrel contact', () => {
  it('keeps the bore centered while the receiver edges closely contain the barrel and tube', () => {
    const receiver = FAMILIES.receiver!.build({ action: 'pump', feed: 'tube', bore: 'L', rail: 'full' });
    const body = receiver.solids.find((solid) => solid.id === 'body');
    if (body?.kind !== 'box') {
      throw new Error('pump receiver body is not a box');
    }
    const [bodyBottom, bodyTop] = [body.box.center[1] - body.box.half[1], body.box.center[1] + body.box.half[1]];
    const barrelPort = receiver.ports.find((port) => port.id === 'barrel')!;
    const tubePort = receiver.ports.find((port) => port.id === 'tube')!;
    const lowerPort = receiver.ports.find((port) => port.id === 'lower')!;
    expect(barrelPort.pos[1]).toBe(0);
    expect(receiver.axes[0]?.origin[1]).toBe(0);
    expect(bodyTop - (barrelPort.pos[1] + 1.25)).toBeCloseTo(0.25);
    expect(tubePort.pos[1] - 1 - bodyBottom).toBeCloseTo(0.25);
    expect(lowerPort.pos[1]).toBe(bodyBottom);
  });

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
