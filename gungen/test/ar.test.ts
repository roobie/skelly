import { describe, expect, it } from 'vitest';
import type { MetallicCartridge } from '../src/ammo/cartridge.ts';
import { GRID } from '../src/core/conventions.ts';
import { validateExtrudedPolygon, worldSolid } from '../src/core/geometry.ts';
import { applyPoint } from '../src/core/math.ts';
import { resolve } from '../src/core/resolve.ts';
import { validate } from '../src/core/validate.ts';
import { AR_ACTION_LAYOUT } from '../src/gun/arLayout.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { magazineRoundColumn } from '../src/gun/magazineGeometry.ts';
import { BOLT_CARRIER_ENVELOPES, FAMILIES } from '../src/gun/parts.ts';
import type { GunPortDef } from '../src/gun/portData.ts';
import { loadCartridgeFile } from './ammoHelpers.ts';
import { loadFixture, variant } from './helpers.ts';

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
    const arMagazinePort = lower.ports.find(({ id }) => id === 'magazine');
    const conventionalMagazinePort = conventional.ports.find(({ id }) => id === 'magazine');
    expect(arMagazinePort?.pos[0]).toBe(conventionalMagazinePort?.pos[0]);
    expect(arMagazinePort?.pos[1]).toBeGreaterThan(conventionalMagazinePort?.pos[1] ?? 0);
    expect(arMagazinePort?.normal).toEqual(conventionalMagazinePort?.normal);
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

  it.each([
    ['STANAG 20', { length: 'M', profile: 'stanag-straight' }],
    ['STANAG 30', { length: 'L', profile: 'stanag-curved' }],
  ])('seats the %s feed lips below the AR bolt path', (_label, params) => {
    const assembly = variant('archetype-ar', (draft) => {
      draft.parts.magazine!.params = params;
    });
    const resolved = resolve(assembly, gunDomain);
    expect(validate(assembly, gunDomain).ok).toBe(true);
    const magazineTransform = resolved.placed.get('magazine');
    const magazineDef = resolved.defs.get('magazine');
    const receiverTransform = resolved.placed.get('receiver');
    if (!(magazineTransform && magazineDef && receiverTransform)) {
      throw new Error('Expected a placed AR magazine and receiver.');
    }
    const bodyWorld = magazineDef.solids.map((solid) => worldSolid(magazineTransform, solid));
    const bodyVertices = bodyWorld.flatMap((shape) => ('vertices' in shape ? shape.vertices : []));
    expect(bodyVertices.length).toBeGreaterThan(0);
    const bodyTopY = Math.max(...bodyVertices.map(([, y]) => y));
    const [, boltPathBottomY] = applyPoint(receiverTransform, [0, BOLT_CARRIER_ENVELOPES.ar.y[0], 0]);
    const lipClearance = boltPathBottomY - bodyTopY;
    expect(lipClearance).toBeGreaterThan(0);
    expect(lipClearance).toBeLessThan(AR_ACTION_LAYOUT.barrelExtensionDiameterU / 2 + GRID);

    const cartridge = loadCartridgeFile('5.56x45.json') as MetallicCartridge;
    const { column } = magazineRoundColumn(magazineDef.solids, cartridge, params);
    expect(column.rounds.length).toBeGreaterThan(0);
    const topRound = column.rounds[0]!;
    const topRoundWorld = applyPoint(magazineTransform, [topRound.position[0], topRound.position[1], topRound.z]);
    expect(boltPathBottomY - topRoundWorld[1]).toBeGreaterThan(0);
    expect(boltPathBottomY - topRoundWorld[1]).toBeLessThan(AR_ACTION_LAYOUT.barrelExtensionDiameterU / 2 + GRID);
  });

  it('places the fixed AR front sight at the barrel gas-port station', () => {
    const barrel = FAMILIES.barrel!.build({ bore: 'M', length: 'M', profile: 'standard', frontSightStyle: 'ar' });
    const frontSight = barrel.ports.find(({ id }) => id === 'front-sight');
    const gasPort = barrel.ports.find(({ id }) => id === 'gas-port');
    expect(frontSight?.pos).toEqual(gasPort?.pos);
  });
});
