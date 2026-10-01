import { describe, expect, it } from 'vitest';
import { validateExtrudedPolygon } from '../src/core/geometry.ts';
import { validate } from '../src/core/validate.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { FAMILIES } from '../src/gun/parts.ts';
import { loadFixture } from './helpers.ts';

describe('AR-pattern parts', () => {
  it('places a rear-top charging handle behind the flat-top rail', () => {
    const receiver = FAMILIES.receiver!.build({
      action: 'auto',
      feed: 'box',
      bore: 'M',
      chargingHandle: 'rear-top',
      rail: 'full',
    });
    const handle = receiver.keepOuts.find(({ id }) => id === 'charging-handle');
    const rail = receiver.ports.find(({ id }) => id === 'rail');

    expect(handle?.box.center).toEqual([-17, 2.25, 0]);
    expect(handle?.box.half).toEqual([1, 0.5, 1.5]);
    expect(rail?.slots).toEqual({ count: 7, pitch: 2 });
  });

  it('gives the AR housing a longer rear plate and sloped side walls without changing insertion clearance', () => {
    const lower = FAMILIES.lower!.build({ layout: 'ar' });
    const conventional = FAMILIES.lower!.build({ layout: 'conventional' });
    const housing = lower.solids.filter(({ id }) => id.startsWith('magazine-housing-'));
    expect(housing.map(({ id }) => id)).toEqual([
      'magazine-housing-rear',
      'magazine-housing-front',
      'magazine-housing-left',
      'magazine-housing-right',
    ]);
    expect(housing.map(({ kind }) => kind)).toEqual([
      'extruded-polygon',
      'extruded-polygon',
      'extruded-polygon',
      'extruded-polygon',
    ]);
    const rear = housing[0]!;
    const front = housing[1]!;
    const left = housing[2]!;
    if (rear.kind !== 'extruded-polygon' || front.kind !== 'extruded-polygon' || left.kind !== 'extruded-polygon') {
      throw new Error('Expected convex AR magazine-housing plates.');
    }
    const yRange = (profile: readonly (readonly [number, number])[]) => {
      const ys = profile.map(([, y]) => y);
      return Math.max(...ys) - Math.min(...ys);
    };
    expect(yRange(rear.profile)).toBe(2);
    expect(yRange(front.profile)).toBe(1.5);
    expect(yRange(rear.profile)).toBeGreaterThan(yRange(front.profile));
    expect(validateExtrudedPolygon(left.profile, left.z)).toBeUndefined();
    expect(left.profile.some(([, y]) => y === -3.5)).toBe(true);
    expect(left.profile.some(([, y]) => y === -3)).toBe(true);
    expect(lower.ports.find(({ id }) => id === 'magazine')).toEqual(
      conventional.ports.find(({ id }) => id === 'magazine'),
    );
    expect(lower.keepOuts).toEqual(conventional.keepOuts);
  });

  it('keeps magazine-well front walls within their front panels in every well layout', () => {
    for (const layout of ['conventional', 'bullpup', 'ar']) {
      const lower = FAMILIES.lower!.build({ layout });
      const panel = lower.solids.find(({ id }) => id === 'frame-front');
      expect(panel?.kind, `${layout} front panel`).toBe('box');
      if (panel?.kind !== 'box') {
        throw new Error(`Expected a box-shaped ${layout} magazine-well front panel.`);
      }
      const housingFront = lower.solids.find(({ id }) => id === 'magazine-housing-front');
      if (layout !== 'ar') {
        expect(housingFront, `${layout} has no detached front housing`).toBeUndefined();
        continue;
      }
      expect(housingFront?.kind).toBe('extruded-polygon');
      if (housingFront?.kind !== 'extruded-polygon') {
        throw new Error('Expected the AR magazine-housing front wall.');
      }
      const panelThickness = panel.box.half[0] * 2;
      const xCoordinates = housingFront.profile.map(([x]) => x);
      const housingThickness = Math.max(...xCoordinates) - Math.min(...xCoordinates);
      const panelFrontX = panel.box.center[0] + panel.box.half[0];
      const housingFrontX = Math.max(...xCoordinates);
      expect(housingThickness).toBeLessThanOrEqual(panelThickness);
      expect(housingFrontX).toBe(panelFrontX);
    }
  });

  it('fits the curved STANAG 30 profile and derives convex collision sectors and a finer display arc', () => {
    const magazine = FAMILIES.magazine!.build({ length: 'L', profile: 'stanag-curved' });
    expect(magazine.solids.map(({ id }) => id)).toEqual([
      'upper-body',
      'curve-sector-1',
      'curve-sector-2',
      'curve-sector-3',
      'curve-sector-4',
      'curve-sector-straight-bottom',
    ]);
    expect(magazine.displaySolids?.length).toBe(18);
    for (const solid of magazine.solids) {
      expect(solid.kind).toBe('extruded-polygon');
      if (solid.kind === 'extruded-polygon') {
        expect(validateExtrudedPolygon(solid.profile, solid.z)).toBeUndefined();
      }
    }
    const edgeLength = (a: readonly [number, number], b: readonly [number, number]) =>
      Math.hypot(b[0] - a[0], b[1] - a[1]);
    const upper = magazine.solids[0]!;
    const bottom = magazine.solids.at(-1)!;
    if (upper.kind !== 'extruded-polygon' || bottom.kind !== 'extruded-polygon') {
      throw new Error('Expected curved-magazine prisms.');
    }
    const totalLength = magazine.solids.reduce((sum, solid) => {
      if (solid.kind !== 'extruded-polygon') {
        throw new Error('Expected a convex prism.');
      }
      return (
        sum + (edgeLength(solid.profile[0]!, solid.profile[3]!) + edgeLength(solid.profile[1]!, solid.profile[2]!)) / 2
      );
    }, 0);
    const measurements = {
      bend:
        (Math.atan2(bottom.profile[1]![1] - bottom.profile[0]![1], bottom.profile[1]![0] - bottom.profile[0]![0]) *
          180) /
        Math.PI,
      straight: edgeLength(upper.profile[0]!, upper.profile[3]!) / totalLength,
      lengthDepth: totalLength / 5.5,
      offsetDepth: (bottom.profile[0]![0] + bottom.profile[1]![0] - upper.profile[2]![0] - upper.profile[3]![0]) / 11,
    };
    expect(measurements.bend).toBeCloseTo(10, 8);
    expect(Math.abs(measurements.straight - 0.45)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(measurements.lengthDepth - 2.87)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(measurements.offsetDepth - 0.32)).toBeLessThanOrEqual(0.15);
    expect(magazine.ports.find(({ id }) => id === 'top')?.seat).toBe('well');
    expect(validate(loadFixture('archetype-ar'), gunDomain).ok).toBe(true);
  });

  it('places the fixed AR front sight at the barrel gas-port station', () => {
    const barrel = FAMILIES.barrel!.build({ bore: 'M', length: 'M', profile: 'standard', frontSightStyle: 'ar' });
    const frontSight = barrel.ports.find(({ id }) => id === 'front-sight');
    const gasPort = barrel.ports.find(({ id }) => id === 'gas-port');
    const muzzle = barrel.ports.find(({ id }) => id === 'muzzle');

    expect(frontSight?.pos).toEqual(gasPort?.pos);
    expect(muzzle?.pos[0]).toBe(36);
  });
});
