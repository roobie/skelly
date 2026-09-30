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
  it('makes every barrel profile a regular octagon at the former square bounds', () => {
    const family = FAMILIES.barrel!;
    expect(family.params).not.toHaveProperty('crossSection');
    const boreRadius = { S: 0.75, M: 1, L: 1.25 } as const;
    for (const profile of ['standard', 'heavy', 'pistol', 'revolver'] as const) {
      for (const bore of ['S', 'M', 'L'] as const) {
        const definition = family.build({ profile, bore, length: bore });
        const barrel = requireOctagon(definition.solids.find(({ id }) => id === 'tube')!);
        const radius = Math.ceil((boreRadius[bore] * (profile === 'heavy' ? 1.5 : 1)) / 0.25) * 0.25;
        const muzzle = definition.ports.find(({ id }) => id === 'muzzle')!;
        expect(localSolidBounds(barrel)).toEqual([
          [0, -radius, -radius],
          [muzzle.pos[0], radius, radius],
        ]);
      }
    }
  });

  it('keeps the AK gas cylinder a regular octagon with equal 0.5u width and height', () => {
    const definition = FAMILIES['gas-cylinder']!.build({
      barrelLength: 'M',
      handguardLayout: 'ak',
      handguardLength: 'M',
    });
    const cylinder = requireOctagon(definition.solids[0]!);
    const bounds = localSolidBounds(cylinder);
    expect(bounds).toEqual([
      [0, -0.25, -0.25],
      [cylinder.z[1], 0.25, 0.25],
    ]);
    expect(bounds[1][1] - bounds[0][1]).toBeCloseTo(bounds[1][2] - bounds[0][2]);
    // With a 0.25u apothem, the regular-octagon vertex is 0.10355u from either centreline.
    expect(cylinder.profile[0]![1]).toBeCloseTo(0.25 * (Math.SQRT2 - 1));
  });

  it('keeps every curated design and passing fixture valid with octagonal barrels', () => {
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
      expect(support.profile).toHaveLength(8);
      const [supportX] = tube.ports.find(({ id }) => id === 'support')!.pos;
      expect(localSolidBounds(support)).toEqual([
        [supportX - 1, 1, -0.5],
        [supportX, 1.5, 0.5],
      ]);
    }
    const [capX] = tube.ports.find(({ id }) => id === 'cap')!.pos;
    expect(localSolidBounds(body)).toEqual([
      [0, -1, -1],
      [capX - 0.5, 1, 1],
    ]);
    expect(localSolidBounds(cap)).toEqual([
      [capX - 2.5, -1.25, -1.25],
      [capX, 1.25, 1.25],
    ]);
    const tubeCap = applyPoint(report.resolved.placed.get('tube')!, tube.ports.find(({ id }) => id === 'cap')!.pos);
    const barrelLug = applyPoint(
      report.resolved.placed.get('barrel')!,
      barrel.ports.find(({ id }) => id === 'lug')!.pos,
    );
    for (const axis of [0, 1, 2] as const) {
      expect(tubeCap[axis]).toBeCloseTo(barrelLug[axis]);
    }
    expect(
      report.resolved.connections.some(({ conn }) => conn.from === 'tube.support' || conn.to === 'tube.support'),
    ).toBe(true);
  });
});
