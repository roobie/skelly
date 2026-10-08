import { describe, expect, it } from 'vitest';
import { localSolidBounds, validateExtrudedPolygon } from '../src/core/geometry.ts';
import { applyPoint } from '../src/core/math.ts';
import type { Solid } from '../src/core/schema.ts';
import { validate } from '../src/core/validate.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { FAMILIES } from '../src/gun/parts.ts';
import { loadCorpus, loadFixture, variant } from './helpers.ts';

const requireOctagon = (solid: Solid) => {
  if (solid.kind !== 'extruded-polygon') {
    throw new Error(`Expected an X-axis octagonal extrusion, got ${solid.kind}.`);
  }
  // biome-ignore lint/suspicious/noMisplacedAssertion: helper is called only by tests
  expect(solid.axis).toBe('x');
  // biome-ignore lint/suspicious/noMisplacedAssertion: helper is called only by tests
  expect(solid.profile).toHaveLength(8);
  // biome-ignore lint/suspicious/noMisplacedAssertion: helper is called only by tests
  expect(validateExtrudedPolygon(solid.profile, solid.z)).toBeUndefined();
  const edgeLengths = solid.profile.map((point, index) => {
    const next = solid.profile[(index + 1) % solid.profile.length]!;
    return Math.hypot(next[0] - point[0], next[1] - point[1]);
  });
  for (const length of edgeLengths) {
    // biome-ignore lint/suspicious/noMisplacedAssertion: helper is called only by tests
    expect(length).toBeCloseTo(edgeLengths[0]!);
  }
  return solid;
};

describe('octagonal barrel and gas-system geometry', () => {
  it('makes every barrel profile a centred regular octagon that encloses its bore axis', () => {
    const family = FAMILIES.barrel!;
    expect(family.params).not.toHaveProperty('crossSection');
    for (const bore of ['S', 'M', 'L'] as const) {
      const standard = family.build({ profile: 'standard', bore, length: bore });
      const standardBarrel = requireOctagon(standard.solids.find(({ id }) => id === 'tube')!);
      const [min, max] = localSolidBounds(standardBarrel);
      const boreAxis = standard.axes.find(({ kind }) => kind === 'bore')!.origin;
      expect(min[1] + max[1]).toBeCloseTo(2 * boreAxis[1]);
      expect(min[2] + max[2]).toBeCloseTo(2 * boreAxis[2]);
      expect(min[1]).toBeLessThan(boreAxis[1]);
      expect(max[1]).toBeGreaterThan(boreAxis[1]);
      expect(min[2]).toBeLessThan(boreAxis[2]);
      expect(max[2]).toBeGreaterThan(boreAxis[2]);
      const heavy = family.build({ profile: 'heavy', bore, length: bore });
      const heavyBarrel = requireOctagon(heavy.solids.find(({ id }) => id === 'tube')!);
      const [heavyMin, heavyMax] = localSolidBounds(heavyBarrel);
      expect(heavyMax[1] - heavyMin[1]).toBeGreaterThan(max[1] - min[1]);
    }
  });

  it('keeps the AK gas cylinder a regular octagon centred on its axis', () => {
    const definition = FAMILIES['gas-cylinder']!.build({ barrelLength: 'M' });
    const cylinder = requireOctagon(definition.solids[0]!);
    const [[, minY, minZ], [, maxY, maxZ]] = localSolidBounds(cylinder);
    expect(maxY - minY).toBeCloseTo(maxZ - minZ);
    expect(minY + maxY).toBeCloseTo(0);
    expect(minZ + maxZ).toBeCloseTo(0);
  });

  // Rebuilds and validates the published designs and passing fixtures.
  it('keeps every curated design and passing fixture valid with octagonal barrels', { timeout: 25_000 }, () => {
    for (const { label, assembly } of loadCorpus()) {
      const report = validate(assembly, gunDomain);
      expect(report.issues, label).toEqual([]);
    }
  });

  it('keeps free-float clearance and clamped contact valid around the octagonal barrel', () => {
    const freeFloat = validate(loadFixture('archetype-ar-free-float'), gunDomain);
    expect(freeFloat.issues).toEqual([]);

    const clamped = variant('archetype-ar-free-float', (draft) => {
      const handguard = draft.parts.handguard!;
      handguard.params = { ...handguard.params, mount: 'clamped' };
      draft.connections.push({ from: 'handguard.front', to: 'barrel.clamp' });
    });
    expect(validate(clamped, gunDomain).issues).toEqual([]);
  });

  it('keeps the pump tube, cap and support lug octagonal with #87 bounds and contacts', () => {
    const report = validate(loadFixture('archetype-pump-shotgun'), gunDomain);
    expect(report.issues).toEqual([]);
    const tube = report.resolved.defs.get('tube')!;
    const barrel = report.resolved.defs.get('barrel')!;
    const body = requireOctagon(tube.solids.find(({ id }) => id === 'tube')!);
    const cap = requireOctagon(tube.solids.find(({ id }) => id === 'cap-lug')!);
    const support = tube.solids.find(({ id }) => id === 'support-band')!;
    expect(support.kind).toBe('extruded-polygon');
    if (support.kind === 'extruded-polygon') {
      expect(support.axis).toBe('x');
      expect(support.profile.length).toBeGreaterThan(0);
      const supportBounds = localSolidBounds(support);
      const [supportX] = tube.ports.find(({ id }) => id === 'support')!.pos;
      expect(supportBounds[0][0]).toBeLessThan(supportX);
      expect(supportBounds[1][0]).toBeCloseTo(supportX);
    }
    const [capX] = tube.ports.find(({ id }) => id === 'cap')!.pos;
    const bodyBounds = localSolidBounds(body);
    const capBounds = localSolidBounds(cap);
    expect(capBounds[0][1]).toBeLessThan(bodyBounds[0][1]);
    expect(capBounds[1][1]).toBeGreaterThan(bodyBounds[1][1]);
    expect(capBounds[0][2]).toBeLessThan(bodyBounds[0][2]);
    expect(capBounds[1][2]).toBeGreaterThan(bodyBounds[1][2]);
    expect(capBounds[0][0]).toBeLessThan(capX);
    expect(capBounds[1][0]).toBeCloseTo(capX);
    expect(bodyBounds[1][0]).toBeLessThan(capX);
    const tubeCap = applyPoint(report.resolved.placed.get('tube')!, tube.ports.find(({ id }) => id === 'cap')!.pos);
    const barrelLug = applyPoint(
      report.resolved.placed.get('barrel')!,
      barrel.ports.find(({ id }) => id === 'lug')!.pos,
    );
    for (const axis of [0, 1, 2] as const) {
      expect(tubeCap[axis]).toBeCloseTo(barrelLug[axis]);
    }
    const supportPort = tube.ports.find(({ id }) => id === 'support')!;
    const barrelSupport = barrel.ports.find(({ id }) => id === 'support-lug')!;
    expect(applyPoint(report.resolved.placed.get('tube')!, supportPort.pos)).toEqual(
      applyPoint(report.resolved.placed.get('barrel')!, barrelSupport.pos),
    );
  });
});
