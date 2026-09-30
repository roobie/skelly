import validator from 'gltf-validator';
import { describe, expect, it } from 'vitest';
import { localSolidBounds } from '../src/core/geometry.ts';
import type { Assembly } from '../src/core/schema.ts';
import { validate } from '../src/core/validate.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { exportGunGlb } from '../src/gun/exportGlb.ts';
import { FAMILIES } from '../src/gun/parts.ts';
import { loadCorpus, loadDesigns, variant } from './helpers.ts';

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
  it('is a regular X-axis octagon with the round barrel flat-to-flat diameter and unchanged ports', () => {
    const family = FAMILIES.barrel!;
    expect(family.params.crossSection?.default).toBe('round');
    const input = { bore: 'M', length: 'M', profile: 'standard' };
    const round = family.build(input);
    const defaultRound = family.build({ ...input, crossSection: 'round' });
    const octagonal = family.build({ ...input, crossSection: 'octagonal' });
    const roundTube = round.solids.find(({ id }) => id === 'tube')!;
    const octagonalTube = octagonal.solids.find(({ id }) => id === 'tube')!;
    expect(defaultRound.solids).toEqual(round.solids);
    expect(octagonalTube.kind).toBe('extruded-polygon');
    if (roundTube.kind !== 'box' || octagonalTube.kind !== 'extruded-polygon') {
      throw new Error('Expected a round box and an octagonal extrusion.');
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
    const roundBounds = localSolidBounds(roundTube);
    const octagonalBounds = localSolidBounds(octagonalTube);
    expect(octagonalBounds[0][0]).toBeCloseTo(roundBounds[0][0]);
    expect(octagonalBounds[1][0]).toBeCloseTo(roundBounds[1][0]);
    expect(octagonalBounds[0][1]).toBeCloseTo(roundBounds[0][1]);
    expect(octagonalBounds[1][1]).toBeCloseTo(roundBounds[1][1]);
    expect(octagonalBounds[0][2]).toBeCloseTo(roundBounds[0][2]);
    expect(octagonalBounds[1][2]).toBeCloseTo(roundBounds[1][2]);
    expect(octagonal.ports).toEqual(round.ports);
    expect(octagonal.keepOuts).toEqual(round.keepOuts);
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
});
