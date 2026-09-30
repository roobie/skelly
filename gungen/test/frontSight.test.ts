import { describe, expect, it } from 'vitest';
import { generate } from '../src/core/generate.ts';
import { localSolidBounds, validateExtrudedPolygon } from '../src/core/geometry.ts';
import { applyPoint } from '../src/core/math.ts';
import type { Solid } from '../src/core/schema.ts';
import { validate } from '../src/core/validate.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { FAMILIES } from '../src/gun/parts.ts';
import { ar } from '../src/gun/templates.ts';
import { loadFixture } from './helpers.ts';

const fixedSight = (design: string, sightId: string) => {
  const report = validate(loadFixture(design), gunDomain);
  if (!report.ok) {
    throw new Error(`${design} must validate: ${report.issues.map(({ message }) => message).join('; ')}`);
  }
  return { report, sight: report.resolved.defs.get(sightId)!, placed: report.resolved.placed.get(sightId)! };
};

const polygon = (solid: Solid): Extract<Solid, { kind: 'extruded-polygon' }> => {
  if (solid.kind !== 'extruded-polygon') {
    throw new Error(`Expected ${solid.id} to be an extruded polygon.`);
  }
  return solid;
};

const equalPoint = (a: readonly number[], b: readonly number[]) => a.every((value, index) => value === b[index]);

describe('front-sight families', () => {
  it('places the AR at the gas-port station and the AK 2.5u behind the muzzle by barrel length', () => {
    const expected = [
      { length: 'S', muzzle: 26, arDistance: 6.25 },
      { length: 'M', muzzle: 36, arDistance: 9.25 },
      { length: 'L', muzzle: 46, arDistance: 12 },
    ] as const;
    for (const { length, muzzle, arDistance } of expected) {
      const arBarrel = FAMILIES.barrel!.build({ bore: 'M', length, profile: 'standard', frontSightStyle: 'ar' });
      const akBarrel = FAMILIES.barrel!.build({ bore: 'M', length, profile: 'standard', frontSightStyle: 'ak' });
      const arSight = arBarrel.ports.find(({ id }) => id === 'front-sight')!;
      const gasPort = arBarrel.ports.find(({ id }) => id === 'gas-port')!;
      const akSight = akBarrel.ports.find(({ id }) => id === 'front-sight')!;
      expect(arSight.pos).toEqual(gasPort.pos);
      expect(muzzle - arSight.pos[0]).toBe(arDistance);
      expect(muzzle - akSight.pos[0]).toBe(2.5);
    }
  });

  it('has a regular octagonal collar whose inner faces contact the barrel', () => {
    for (const design of ['archetype-ar', 'archetype-ak']) {
      const { report, sight } = fixedSight(design, 'front-sight');
      const barrel = report.resolved.defs.get('barrel')!;
      const tube = polygon(barrel.solids.find(({ id }) => id === 'tube')!);
      const collar = sight.solids.filter(({ id }) => id.startsWith('collar-')).map(polygon);
      expect(collar).toHaveLength(8);
      for (const segment of collar) {
        expect(segment.axis).toBe('x');
        expect(validateExtrudedPolygon(segment.profile, segment.z)).toBeUndefined();
        expect(
          tube.profile.some((point, index) => {
            const next = tube.profile[(index + 1) % tube.profile.length]!;
            return equalPoint(segment.profile[0]!, point) && equalPoint(segment.profile[3]!, next);
          }),
        ).toBe(true);
      }
      expect(
        report.resolved.connections.some(
          ({ conn }) => conn.from === 'barrel.front-sight' && conn.to === 'front-sight.base',
        ),
      ).toBe(true);
    }
  });

  it('keeps the AR stem tapered without ears and gives the AK block two ears around its post', () => {
    const { sight: arSight } = fixedSight('archetype-ar', 'front-sight');
    const { sight: akSight } = fixedSight('archetype-ak', 'front-sight');
    const arPost = localSolidBounds(arSight.solids.find(({ id }) => id === 'post')!);
    const arStem = polygon(arSight.solids.find(({ id }) => id === 'stem')!);
    expect(arSight.solids.map(({ id }) => id)).not.toContain('ear-left');
    expect(arSight.solids.map(({ id }) => id)).not.toContain('ear-right');
    expect(arStem.profile).toHaveLength(4);
    expect(arStem.profile[1]![0] - arStem.profile[0]![0]).toBeGreaterThan(
      arStem.profile[2]![0] - arStem.profile[3]![0],
    );
    expect(arPost[1][1]).toBe(5);

    const akPost = localSolidBounds(akSight.solids.find(({ id }) => id === 'post')!);
    const leftEar = localSolidBounds(akSight.solids.find(({ id }) => id === 'ear-left')!);
    const rightEar = localSolidBounds(akSight.solids.find(({ id }) => id === 'ear-right')!);
    expect(akPost[1][1]).toBe(5);
    expect(leftEar[1][2]).toBeLessThan(akPost[0][2]);
    expect(rightEar[0][2]).toBeGreaterThan(akPost[1][2]);
    expect(leftEar[1][1]).toBe(5.5);
    expect(rightEar[1][1]).toBe(5.5);
  });

  it('halves AR upright depth while retaining collar contact and matching the rail post', () => {
    for (const [bore, radius] of [
      ['S', 0.75],
      ['M', 1],
      ['L', 1.25],
    ] as const) {
      const fixed = FAMILIES['front-sight']!.build({ bore, style: 'ar' });
      const stem = polygon(fixed.solids.find(({ id }) => id === 'stem')!);
      const fixedPost = localSolidBounds(fixed.solids.find(({ id }) => id === 'post')!);
      const rail = FAMILIES['rail-front-sight']!.build({ bore, clearance: bore });
      const railPost = localSolidBounds(rail.solids.find(({ id }) => id === 'post')!);
      expect(stem.z).toEqual([-radius / 2, radius / 2]);
      expect(stem.z[1]).toBeGreaterThan(radius * (Math.SQRT2 - 1));
      expect(fixedPost[1][2] - fixedPost[0][2]).toBe(0.25);
      expect(railPost[1][2] - railPost[0][2]).toBe(0.25);
    }
  });

  it('mounts the detachable AR post at the forward rail slot and matches the rear sight axis', () => {
    const { report, sight, placed } = fixedSight('archetype-ar-free-float', 'rail-front-sight');
    expect(report.resolved.defs.has('front-sight')).toBe(false);
    const connection = report.resolved.connections.find(
      ({ conn }) => conn.from === 'handguard.rail' && conn.to === 'rail-front-sight.base',
    )!;
    expect(connection.conn.slot).toBe(10);
    const handguard = report.resolved.defs.get('handguard')!;
    const rail = handguard.ports.find(({ id }) => id === 'rail')!;
    const handguardTop = localSolidBounds(handguard.solids.find(({ id }) => id === 'top')!);
    expect(rail.pos[1]).toBe(handguardTop[1][1]);
    const localSlot = rail.pos.map((value, axis) => value + rail.up[axis]! * connection.conn.slot! * rail.slots!.pitch);
    const slotWorld = applyPoint(report.resolved.placed.get('handguard')!, localSlot as [number, number, number]);
    const base = sight.ports.find(({ id }) => id === 'base')!;
    const baseWorld = applyPoint(placed, base.pos);
    expect(baseWorld).toEqual(slotWorld);

    const baseSolid = sight.solids.find(({ id }) => id === 'base')!;
    expect(localSolidBounds(baseSolid)[0][1]).toBe(0);
    expect(baseWorld[1]).toBe(slotWorld[1]);
    const postBounds = localSolidBounds(sight.solids.find(({ id }) => id === 'post')!);
    expect(postBounds[1][1]).toBe(sight.axes.find(({ kind }) => kind === 'sight')!.origin[1]);
    const frontAxis = applyPoint(placed, sight.axes.find(({ kind }) => kind === 'sight')!.origin);
    const rearSight = report.resolved.defs.get('sight')!;
    const rearAxis = applyPoint(
      report.resolved.placed.get('sight')!,
      rearSight.axes.find(({ kind }) => kind === 'sight')!.origin,
    );
    expect(frontAxis[1]).toBeCloseTo(rearAxis[1], 8);
  });

  it('fits the clamped AR handguard against the fixed block and keeps the free-float handguard clear', () => {
    const classic = fixedSight('archetype-ar', 'front-sight');
    const handguard = classic.report.resolved.defs.get('handguard')!;
    const frontPort = handguard.ports.find(({ id }) => id === 'front')!;
    const handguardFront = applyPoint(classic.report.resolved.placed.get('handguard')!, frontPort.pos);
    const collarRear = applyPoint(classic.placed, [-1, 0, 0]);
    expect(handguardFront[0]).toBe(collarRear[0]);
    expect(classic.report.issues.filter(({ rule }) => rule === 'handguard-fit')).toEqual([]);

    const floating = validate(loadFixture('archetype-ar-free-float'), gunDomain);
    expect(floating.issues.filter(({ rule }) => rule === 'free-float-clearance')).toEqual([]);
  });

  it('offers the rail-mounted front sight only for free-floating AR generation', () => {
    for (let seed = 0; seed < 300; seed++) {
      const assembly = generate(ar, gunDomain, seed);
      const mount = assembly.parts.handguard?.params?.mount;
      if (mount === 'clamped') {
        expect(assembly.parts['front-sight']?.params?.style).toBe('ar');
        expect(assembly.parts['rail-front-sight']).toBeUndefined();
      } else {
        expect(assembly.parts['front-sight']).toBeUndefined();
        if (assembly.parts['rail-front-sight']) {
          expect(assembly.parts['rail-front-sight']?.family).toBe('rail-front-sight');
        }
      }
    }
  });
});
