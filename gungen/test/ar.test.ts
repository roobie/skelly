import { describe, expect, it } from 'vitest';
import { validateExtrudedPolygon } from '../src/core/geometry.ts';
import { validate } from '../src/core/validate.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { FAMILIES } from '../src/gun/parts.ts';
import type { GunPortDef } from '../src/gun/portData.ts';
import { loadFixture } from './helpers.ts';

describe('AR-pattern parts', () => {
  it('places a rear-top charging handle behind the flat-top rail', () => {
    const receiver = FAMILIES.receiver!.build({
      action: 'auto',
      feed: 'box',
      bore: 'M',
      chargingHandle: 'rear-top',
      rail: 'full',
      section: 'ar',
    });
    const mount = receiver.ports.find(({ id }) => id === 'charging-handle');
    const rail = receiver.ports.find(({ id }) => id === 'rail');
    const handle = FAMILIES['ar-charging-handle']!.build({});
    const bar = handle.solids.find(({ id }) => id === 'ar-handle-crossbar');
    expect(mount?.pos).toEqual([0, 0, 0]);
    expect(receiver.solids.some(({ id }) => id === 'charging-handle')).toBe(false);
    if (bar?.kind !== 'box') {
      throw new Error('T-bar is missing');
    }
    expect(bar.box.center[0] + bar.box.half[0]).toBeLessThan(-16);
    expect(rail?.slots).toEqual({ count: 7, pitch: 2 });
  });

  it('gives the AR housing a longer rear plate and sloped side walls without changing insertion clearance', () => {
    const lower = FAMILIES.lower!.build({ layout: 'ar' });
    const conventional = FAMILIES.lower!.build({ layout: 'conventional' });
    const housing = lower.solids.filter(({ id }) => id.startsWith('magazine-housing-'));
    expect(housing.length).toBeGreaterThan(0);
    expect(housing.every(({ kind }) => kind === 'extruded-polygon')).toBe(true);
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
    expect(yRange(rear.profile)).toBeGreaterThan(yRange(front.profile));
    for (const plate of [rear, front, left]) {
      expect(validateExtrudedPolygon(plate.profile, plate.z)).toBeUndefined();
    }
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
    expect(magazine.solids.length).toBeGreaterThan(0);
    expect(magazine.displaySolids?.length).toBeGreaterThan(0);
    for (const solid of magazine.solids) {
      expect(solid.kind).toBe('extruded-polygon');
      if (solid.kind === 'extruded-polygon') {
        expect(validateExtrudedPolygon(solid.profile, solid.z)).toBeUndefined();
      }
    }
    expect((magazine.ports.find(({ id }) => id === 'top') as GunPortDef | undefined)?.seat).toBe('well');
    expect(validate(loadFixture('archetype-ar'), gunDomain).ok).toBe(true);
  });

  it('places the fixed AR front sight at the barrel gas-port station', () => {
    const barrel = FAMILIES.barrel!.build({ bore: 'M', length: 'M', profile: 'standard', frontSightStyle: 'ar' });
    const frontSight = barrel.ports.find(({ id }) => id === 'front-sight');
    const gasPort = barrel.ports.find(({ id }) => id === 'gas-port');
    expect(frontSight?.pos).toEqual(gasPort?.pos);
  });
});
