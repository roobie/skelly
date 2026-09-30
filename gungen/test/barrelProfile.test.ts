import validator from 'gltf-validator';
import { describe, expect, it } from 'vitest';
import { localSolidBounds } from '../src/core/geometry.ts';
import type { Assembly } from '../src/core/schema.ts';
import { validate } from '../src/core/validate.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { exportGunGlb } from '../src/gun/exportGlb.ts';
import { FAMILIES } from '../src/gun/parts.ts';
import { loadCorpus, loadDesigns, loadFixture, variant } from './helpers.ts';

const withOctagonalBarrel = (assembly: Assembly): Assembly => {
  const { barrel } = assembly.parts;
  if (!barrel) {
    return assembly;
  }
  return {
    ...assembly,
    parts: {
      ...assembly.parts,
      barrel: {
        ...barrel,
        params: { ...barrel.params, crossSection: 'octagonal' },
      },
    },
  };
};

describe('octagonal barrel cross-section', () => {
  it('keeps an X-axis octagon the square barrel flat-to-flat width with unchanged ports', () => {
    const family = FAMILIES.barrel!;
    expect(family.params.crossSection?.default).toBe('square');
    const input = { bore: 'M', length: 'M', profile: 'standard' };
    const square = family.build(input);
    const explicitSquare = family.build({ ...input, crossSection: 'square' });
    const octagonal = family.build({ ...input, crossSection: 'octagonal' });
    const squareTube = square.solids.find(({ id }) => id === 'tube')!;
    const octagonalTube = octagonal.solids.find(({ id }) => id === 'tube')!;
    expect(explicitSquare.solids).toEqual(square.solids);
    expect(octagonalTube.kind).toBe('extruded-polygon');
    if (squareTube.kind !== 'box' || octagonalTube.kind !== 'extruded-polygon') {
      throw new Error('Expected a square box and an octagonal extrusion.');
    }
    expect(octagonalTube.axis).toBe('x');
    expect(octagonalTube.profile).toHaveLength(8);
    const edgeLengths = octagonalTube.profile.map((point, index) => {
      const next = octagonalTube.profile[(index + 1) % octagonalTube.profile.length]!;
      return Math.hypot(next[0] - point[0], next[1] - point[1]);
    });
    for (const length of edgeLengths) {
      expect(length).toBeCloseTo(edgeLengths[0]!);
    }
    const squareBounds = localSolidBounds(squareTube);
    const octagonalBounds = localSolidBounds(octagonalTube);
    expect(octagonalBounds[0][0]).toBeCloseTo(squareBounds[0][0]);
    expect(octagonalBounds[1][0]).toBeCloseTo(squareBounds[1][0]);
    expect(octagonalBounds[0][1]).toBeCloseTo(squareBounds[0][1]);
    expect(octagonalBounds[1][1]).toBeCloseTo(squareBounds[1][1]);
    expect(octagonalBounds[0][2]).toBeCloseTo(squareBounds[0][2]);
    expect(octagonalBounds[1][2]).toBeCloseTo(squareBounds[1][2]);
    expect(octagonal.ports).toEqual(square.ports);
    expect(octagonal.keepOuts).toEqual(square.keepOuts);
  });

  it('inherits the pump tube and lug sections from the barrel without moving ports or bounds', () => {
    const pump = (crossSection: 'square' | 'octagonal') =>
      variant('archetype-pump-shotgun', (draft) => {
        const barrel = draft.parts.barrel!;
        barrel.params = { ...barrel.params, crossSection };
      });
    const square = validate(pump('square'), gunDomain);
    const octagonal = validate(pump('octagonal'), gunDomain);
    expect(square.issues).toEqual([]);
    expect(octagonal.issues).toEqual([]);
    expect(octagonal.resolved.params.get('tube')?.crossSection).toEqual({
      value: 'octagonal',
      source: 'inherited',
      from: 'barrel.crossSection',
    });
    const squareBarrel = square.resolved.defs.get('barrel')!;
    const octagonalBarrel = octagonal.resolved.defs.get('barrel')!;
    const squareTube = square.resolved.defs.get('tube')!;
    const octagonalTube = octagonal.resolved.defs.get('tube')!;
    expect(octagonalBarrel.ports).toEqual(squareBarrel.ports);
    expect(octagonalTube.ports).toEqual(squareTube.ports);
    for (const id of ['tube', 'cap-lug', 'support-band']) {
      const squareSolid = squareTube.solids.find((solid) => solid.id === id)!;
      const octagonalSolid = octagonalTube.solids.find((solid) => solid.id === id)!;
      expect(squareSolid.kind, id).toBe('box');
      expect(octagonalSolid.kind, id).toBe('extruded-polygon');
      expect(localSolidBounds(octagonalSolid), id).toEqual(localSolidBounds(squareSolid));
    }
  });

  it('rejects an explicitly mismatched pump tube cross-section', () => {
    const report = validate(loadFixture('broken-pump-tube-cross-section'), gunDomain);
    expect(report.issues.filter(({ rule }) => rule === 'tube-cross-section-match')).toEqual([
      expect.objectContaining({ parts: ['tube', 'barrel'] }),
    ]);
  });

  it('keeps cross-section implicit in existing designs and non-broken fixtures', () => {
    for (const { label, assembly } of loadCorpus()) {
      expect(assembly.parts.barrel?.params ?? {}, label).not.toHaveProperty('crossSection');
      expect(assembly.parts.tube?.params ?? {}, label).not.toHaveProperty('crossSection');
    }
  });

  it('passes every existing rule on every corpus design and fixture with an octagonal barrel', () => {
    let checked = 0;
    for (const { label, assembly } of loadCorpus()) {
      if (!assembly.parts.barrel) {
        continue;
      }
      checked += 1;
      const report = validate(withOctagonalBarrel(assembly), gunDomain);
      expect(report.issues, label).toEqual([]);
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('keeps a free-float handguard clear and clamped contact valid around the octagonal barrel', () => {
    const freeFloat = variant('archetype-ar-free-float', (draft) => {
      const barrel = draft.parts.barrel!;
      barrel.params = { ...barrel.params, crossSection: 'octagonal' };
    });
    const freeFloatReport = validate(freeFloat, gunDomain);
    expect(
      freeFloatReport.issues.filter(({ rule }) => ['free-float-clearance', 'connection-contact'].includes(rule)),
    ).toEqual([]);

    const clamped = variant('archetype-ar-free-float', (draft) => {
      const barrel = draft.parts.barrel!;
      barrel.params = { ...barrel.params, crossSection: 'octagonal' };
      const handguard = draft.parts.handguard!;
      handguard.params = { ...handguard.params, mount: 'clamped' };
      draft.connections.push({ from: 'handguard.front', to: 'barrel.clamp' });
    });
    const clampedReport = validate(clamped, gunDomain);
    expect(clampedReport.issues.filter(({ rule }) => ['connection-contact', 'loop-closure'].includes(rule))).toEqual(
      [],
    );
  });

  it('exports an octagonal bolt-rifle barrel with no glTF errors or warnings', async () => {
    const design = loadDesigns().find(({ label }) => label === 'design archetype-bolt-rifle.json');
    if (!design) {
      throw new Error('Missing published bolt-rifle design.');
    }
    const assembly = withOctagonalBarrel(design.assembly);
    const exported = exportGunGlb(assembly, {
      id: 'bolt_rifle_octagonal',
      file: 'assets/models/bolt_rifle_octagonal.glb',
    });
    if (!exported.ok) {
      throw new Error(`Export failed: ${JSON.stringify(exported.error)}`);
    }
    const report = await validator.validateBytes(exported.glb, { uri: 'bolt_rifle_octagonal.glb' });
    expect(report.issues.numErrors).toBe(0);
    expect(report.issues.numWarnings).toBe(0);
  });

  it('exports the octagonal pump tube, cap, and support lug with no glTF errors or warnings', async () => {
    const design = loadDesigns().find(({ label }) => label === 'design archetype-pump-shotgun.json');
    if (!design) {
      throw new Error('Missing published pump-shotgun design.');
    }
    const assembly = withOctagonalBarrel(design.assembly);
    const exported = exportGunGlb(assembly, {
      id: 'pump_shotgun_octagonal',
      file: 'assets/models/pump_shotgun_octagonal.glb',
    });
    if (!exported.ok) {
      throw new Error(`Export failed: ${JSON.stringify(exported.error)}`);
    }
    const report = await validator.validateBytes(exported.glb, { uri: 'pump_shotgun_octagonal.glb' });
    expect(report.issues.numErrors).toBe(0);
    expect(report.issues.numWarnings).toBe(0);
  });
});
