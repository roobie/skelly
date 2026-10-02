import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { displayItems } from '../src/core/display.ts';
import { distanceWorld, localSolidBounds, worldSolid } from '../src/core/geometry.ts';
import { applyDir, applyPoint } from '../src/core/math.ts';
import { meshForSolid, meshForSolidGroup } from '../src/core/mesh.ts';
import { resolve } from '../src/core/resolve.ts';
import type { Domain, Solid } from '../src/core/schema.ts';
import { validate } from '../src/core/validate.ts';
import { BOLT_RECEIVER, cartridgeLoadingPath } from '../src/gun/boltReceiver.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { FAMILIES } from '../src/gun/parts.ts';
import { GUN_UNITS } from '../src/gun/units.ts';
import { expectWatertightMesh, type MutableAssembly } from './helpers.ts';

const rifle = (): MutableAssembly =>
  JSON.parse(readFileSync(new URL('../designs/archetype-bolt-rifle.json', import.meta.url), 'utf8')).assembly;
const altered = (family: string, mutate: (solids: readonly Solid[]) => readonly Solid[]): Domain => {
  const original = FAMILIES[family]!;
  return {
    ...gunDomain,
    families: {
      ...FAMILIES,
      [family]: {
        ...original,
        build(params) {
          const def = original.build(params);
          return { ...def, solids: mutate(def.solids) };
        },
      },
    },
  };
};

describe('tubular bolt receiver', () => {
  // Eight rows cover every pair of bore × handle profile × stock style × long optic; not their full product.
  it.each([
    ['M', 'standard', 'sporting', 'lpvo-1-6x'],
    ['L', 'awm', 'thumbhole', 'lpvo-1-6x'],
    ['M', 'awm', 'thumbhole', 'high-mag-5-25x'],
    ['L', 'standard', 'sporting', 'high-mag-5-25x'],
    ['M', 'standard', 'thumbhole', 'fixed-prism-4x'],
    ['L', 'awm', 'sporting', 'fixed-prism-4x'],
    ['M', 'awm', 'sporting', 'digital-thermal'],
    ['L', 'standard', 'thumbhole', 'digital-thermal'],
  ] as const)('clears the complete cycle and side loading path: %s/%s/%s/%s', (bore, profile, stock, optic) => {
    const a = rifle();
    a.parts.receiver!.params = { bore };
    a.parts['bolt-carrier']!.params = { pattern: 'bolt', handleProfile: profile };
    a.parts.stock!.params = { style: stock };
    a.parts.lower!.params = { layout: stock === 'thumbhole' ? 'thumbhole' : 'conventional' };
    a.parts.sight!.params = { type: optic };
    const report = validate(a, gunDomain);
    expect(report.issues).toEqual([]);
    expect(report.resolved.placed.get('bolt-carrier')!.t).toEqual([-6, 0, 0]);
    // The new frame changes attachment, not the BR-approved human-scale local meshes.
    for (const family of ['bolt-handle-arm', 'bolt-handle-knob']) {
      expect(report.resolved.defs.get(family)!.solids).toEqual(
        FAMILIES[family]!.build({ handleProfile: profile, section: 'standard' }).solids,
      );
      const displacement = applyDir(report.resolved.placed.get(family)!, report.resolved.defs.get(family)!.motion!.end);
      for (const axis of [0, 1, 2]) {
        expect(displacement[axis]).toBeCloseTo([-7, 0, 0][axis]!, 6);
      }
    }
  });

  it('retains structural and optical datums with contact on actual tube/socket/bearing solids', () => {
    const a = rifle();
    const r = resolve(a, gunDomain);
    const standard = FAMILIES.receiver!.build({ action: 'bolt', feed: 'top', bore: 'M' });
    const tube = r.defs.get('receiver')!;
    const sightAxis = r.defs.get('sight')!.axes.find((axis) => axis.kind === 'sight')!;
    expect(applyPoint(r.placed.get('sight')!, sightAxis.origin)[1]).toBeCloseTo(4.5);
    for (const id of ['barrel', 'stock', 'lower', 'handguard', 'rail']) {
      expect(tube.ports.find((p) => p.id === id)).toEqual(standard.ports.find((p) => p.id === id));
    }
    for (const part of ['barrel', 'stock', 'lower']) {
      const minimum = Math.min(
        ...tube.solids.flatMap((s) =>
          r.defs
            .get(part)!
            .solids.map((t) =>
              distanceWorld(worldSolid(r.placed.get('receiver')!, s), worldSolid(r.placed.get(part)!, t)),
            ),
        ),
      );
      expect(minimum, part).toBeLessThanOrEqual(1e-6);
    }
  });

  it('models an open cartridge-sized port within the requested 34.5 × 215.625 mm tube', () => {
    const mm = GUN_UNITS.metresPerUnit * 1000;
    const r = resolve(rifle(), gunDomain);
    const tubeCells = r.defs
      .get('receiver')!
      .solids.filter((s) => s.kind === 'extruded-polygon' && !s.id.includes('deck'));
    const bounds = tubeCells.map(localSolidBounds);
    const size = [0, 1, 2].map(
      (axis) => Math.max(...bounds.map((b) => b[1][axis]!)) - Math.min(...bounds.map((b) => b[0][axis]!)),
    );
    expect(size[0]! * mm).toBeCloseTo(215.625);
    expect(size[1]! * mm).toBeCloseTo(34.5);
    expect(size[2]! * mm).toBeCloseTo(34.5);
    expect((BOLT_RECEIVER.portX[1] - BOLT_RECEIVER.portX[0]) * mm).toBeGreaterThanOrEqual(
      BOLT_RECEIVER.referenceRound.overallMm + GUN_UNITS.grid * mm,
    );
    expect(cartridgeLoadingPath().box.half[1] * 2 * mm).toBeGreaterThanOrEqual(
      BOLT_RECEIVER.referenceRound.headMm + GUN_UNITS.grid * mm,
    );
  });

  it('keeps each complete round or merged cut-wall display group watertight', () => {
    const def = resolve(rifle(), gunDomain).defs.get('receiver')!;
    for (const item of displayItems(def.displaySolids!)) {
      expectWatertightMesh(
        item.merged ? meshForSolidGroup(item.solids) : meshForSolid(item.solids[0]!, 0, 16),
        item.id,
      );
    }
  });

  it('rejects a plug in the actual receiver opening even though an owner is exempt from its own core keep-out', () => {
    const a = rifle();
    expect(validate(a, gunDomain).issues).toEqual([]);
    const domain = altered('bolt-receiver', (solids) => [
      ...solids,
      { id: 'port-plug', kind: 'box', box: { center: [-6.5, 0, 1.5], half: [0.5, 0.25, 0.25] } },
    ]);
    expect(validate(a, domain).issues.some((i) => i.rule === 'cartridge-loading-clearance')).toBe(true);
  });

  it('rejects an actual catalog body protrusion even if its host forgot the optional keep-out annotation', () => {
    const a = rifle();
    expect(validate(a, gunDomain).issues).toEqual([]);
    const domain = altered('sight', (solids) => [
      ...solids,
      { id: 'tube-with-flared-bells', kind: 'box', box: { center: [0, -2.5, 2.5], half: [0.5, 0.25, 0.25] } },
    ]);
    const tube = domain.families['bolt-receiver']!;
    const requiredPathDomain = {
      ...domain,
      families: {
        ...domain.families,
        'bolt-receiver': {
          ...tube,
          build(params: Readonly<Record<string, string>>) {
            const def = tube.build(params);
            return { ...def, keepOuts: def.keepOuts.filter((ko) => ko.id !== 'cartridge-loading-path') };
          },
        },
      },
    };
    expect(validate(a, requiredPathDomain).issues.some((i) => i.rule === 'cartridge-loading-clearance')).toBe(true);
  });

  it('rejects a real carrier extension that still blocks loading after full retraction', () => {
    const a = rifle();
    expect(validate(a, gunDomain).issues).toEqual([]);
    const domain = altered('bolt-carrier', (solids) => [
      ...solids,
      { id: 'overlong-bolt-tip', kind: 'box', box: { center: [-4.25, 0, 0], half: [0.25, 0.25, 0.25] } },
    ]);
    expect(validate(a, domain).issues.some((i) => i.rule === 'cartridge-loading-clearance')).toBe(true);
  });

  it('rejects material in the lifted stem raceway despite a clear locked pose', () => {
    const a = rifle();
    expect(validate(a, gunDomain).issues).toEqual([]);
    const domain = altered('bolt-receiver', (solids) => [
      ...solids,
      { id: 'raceway-plug', kind: 'box', box: { center: [-14, 1.5, 0.5], half: [0.25, 0.25, 0.25] } },
    ]);
    expect(validate(a, domain).issues.some((i) => i.rule === 'bolt-receiver-motion')).toBe(true);
  });
});
