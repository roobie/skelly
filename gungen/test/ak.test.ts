import { describe, expect, it } from 'vitest';
import { validateExtrudedPolygon } from '../src/core/geometry.ts';
import { applyDir, applyPoint } from '../src/core/math.ts';
import type { Domain } from '../src/core/schema.ts';
import { validate } from '../src/core/validate.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { FAMILIES } from '../src/gun/parts.ts';
import { loadFixture } from './helpers.ts';

const akFixture = loadFixture('archetype-ak');

describe('AK-pattern archetype', () => {
  it('has a dust-cover receiver without a receiver rail and a rear sight on its sight-block port', () => {
    const receiver = FAMILIES['ak-receiver']!.build({ bore: 'S' });
    expect(receiver.solids.map(({ id }) => id)).toContain('dust-cover');
    expect(receiver.ports.map(({ id }) => id)).not.toContain('rail');
    expect(receiver.ports.map(({ id }) => id)).toContain('rear-sight');
  });

  it('keeps the gas tube parallel to and above the bore axis', () => {
    const report = validate(akFixture, gunDomain);
    expect(report.ok).toBe(true);
    const placed = report.resolved.placed.get('gas-tube')!;
    const axis = report.resolved.defs.get('gas-tube')!.axes[0]!;
    expect(applyPoint(placed, axis.origin)).toEqual([0, 2.5, 0]);
    const direction = applyDir(placed, axis.dir);
    expect(direction[0]).toBeCloseTo(1);
    expect(direction[1]).toBeCloseTo(0);
    expect(direction[2]).toBeCloseTo(0);
  });

  it('rejects a misaligned gas-system axis', () => {
    const gasTube = FAMILIES['gas-tube']!;
    const domain: Domain = {
      ...gunDomain,
      families: {
        ...gunDomain.families,
        'gas-tube': {
          ...gasTube,
          build: () => {
            const def = gasTube.build({});
            return { ...def, axes: [{ kind: 'gas-system', origin: [0, 0, 0], dir: [0, 1, 0] }] };
          },
        },
      },
    };
    expect(
      validate(akFixture, domain)
        .issues.filter(({ rule }) => rule === 'axis-alignment')
        .map(({ message }) => message),
    ).toEqual(['The gas-system axis of gas-tube is 90° off the main axis.']);
  });

  it('builds a three-prism magazine with parallel unequal front/back faces and exact joints', () => {
    const expectedAngles = { S: 10, M: 12, L: 15 } as const;
    for (const [length, angleDegrees] of Object.entries(expectedAngles) as [keyof typeof expectedAngles, number][]) {
      const magazine = FAMILIES.magazine!.build({ length, profile: 'ak-curved' });
      const [upper, middle, bottom] = magazine.solids;
      expect(magazine.solids.map(({ id }) => id)).toEqual(['upper-body', 'curve-middle', 'curve-bottom']);
      expect(upper?.kind).toBe('extruded-polygon');
      expect(middle?.kind).toBe('extruded-polygon');
      expect(bottom?.kind).toBe('extruded-polygon');
      if (
        upper?.kind !== 'extruded-polygon' ||
        middle?.kind !== 'extruded-polygon' ||
        bottom?.kind !== 'extruded-polygon'
      ) {
        throw new Error('Expected three extruded AK magazine prisms.');
      }
      expect(validateExtrudedPolygon(upper.profile, upper.z)).toBeUndefined();
      expect(validateExtrudedPolygon(middle.profile, middle.z)).toBeUndefined();
      expect(validateExtrudedPolygon(bottom.profile, bottom.z)).toBeUndefined();
      expect(upper.profile.slice(0, 2)).toEqual([...middle.profile.slice(2)].reverse());
      expect(bottom.profile.slice(2)).toEqual([...middle.profile.slice(0, 2)].reverse());
      expect(upper.profile[2]![1]).toBe(upper.profile[3]![1]);
      expect(upper.profile[0]![1]).not.toBe(upper.profile[1]![1]);
      const middleCenter: [number, number] = [
        (middle.profile[0]![0] + middle.profile[1]![0]) / 2,
        (middle.profile[0]![1] + middle.profile[1]![1]) / 2,
      ];
      const bottomCenter: [number, number] = [
        (bottom.profile[0]![0] + bottom.profile[1]![0]) / 2,
        (bottom.profile[0]![1] + bottom.profile[1]![1]) / 2,
      ];
      const actualAngle =
        (Math.atan2(bottomCenter[0] - middleCenter[0], middleCenter[1] - bottomCenter[1]) * 180) / Math.PI;
      expect(Math.abs(actualAngle - angleDegrees)).toBeLessThan(1);
      const trapezoidAngle =
        (Math.atan2(middle.profile[1]![1] - middle.profile[0]![1], middle.profile[1]![0] - middle.profile[0]![0]) *
          180) /
        Math.PI;
      expect(Math.abs(trapezoidAngle - angleDegrees)).toBeLessThan(1);
      const edgeLength = (profile: readonly (readonly [number, number])[], a: number, b: number) =>
        Math.hypot(profile[a]![0] - profile[b]![0], profile[a]![1] - profile[b]![1]);
      expect(middle.profile[0]![0]).toBe(middle.profile[3]![0]);
      expect(middle.profile[1]![0]).toBe(middle.profile[2]![0]);
      expect(edgeLength(middle.profile, 0, 3)).not.toBeCloseTo(edgeLength(middle.profile, 1, 2));
      const upperXExtent = upper.profile[1]![0] - upper.profile[0]![0];
      expect(Math.abs(edgeLength(middle.profile, 0, 1) - upperXExtent)).toBeLessThanOrEqual(0.25);
      expect(Math.abs(edgeLength(middle.profile, 2, 3) - upperXExtent)).toBeLessThanOrEqual(0.25);
      expect(Math.abs(bottom.profile[2]![0] - bottom.profile[3]![0] - upperXExtent)).toBeLessThanOrEqual(0.25);
    }
    expect(FAMILIES.lower!.build({ layout: 'ak' }).keepOuts.map(({ id }) => id)).toContain('magazine-rock-in-sweep');
    expect(validate(akFixture, gunDomain).ok).toBe(true);
  });

  it('adds an intermediate dropped stock distinct from straight and sporting styles', () => {
    const dropped = FAMILIES.stock!.build({ length: 'M', style: 'dropped' });
    const straight = FAMILIES.stock!.build({ length: 'M', style: 'straight' });
    expect(dropped.solids.map(({ id }) => id)).toEqual(['comb', 'wrist', 'butt']);
    expect(dropped.solids[0]?.kind).toBe('box');
    if (dropped.solids[0]?.kind === 'box') {
      expect(dropped.solids[0].box.center[1] + dropped.solids[0].box.half[1]).toBe(-1.5);
    }
    expect(straight.solids.find(({ id }) => id === 'comb')?.kind).toBe('box');
  });

  it('passes the complete fixture and reports missing gas-tube interfaces clearly', () => {
    expect(validate(akFixture, gunDomain).issues).toEqual([]);
    const { issues } = validate(loadFixture('broken-ak-gas-tube'), gunDomain);
    expect(issues.filter(({ rule }) => rule === 'required-ports').map(({ message }) => message)).toContain(
      'receiver.gas-tube (gas-tube mount on receiver) is required but empty.',
    );
  });
});
