import { generate } from '@skelly/engine/assembly/generate.ts';
import { validate } from '@skelly/engine/assembly/validate.ts';
import { applyDir } from '@skelly/engine/foundation/math.ts';
import { validateExtrudedPolygon } from '@skelly/engine/shapes/geometry.ts';
import { describe, expect, it } from 'vitest';
import { gunDomain } from '../src/gun/domain.ts';
import { FAMILIES, G3_MAGAZINE_WELL_TILT } from '../src/gun/parts.ts';
import { battleRifle } from '../src/gun/templates.ts';
import { loadFixture } from './helpers.ts';
import { sweepGroup } from './sweeps.ts';

const SEED_SCAN_BOUND = 64;
const rifle = loadFixture('archetype-battle-rifle');
const oriented = (orientation: string) => ({
  ...rifle,
  parts: {
    ...rifle.parts,
    magazine: { family: 'magazine', params: { length: 'M', orientation } },
  },
});

const angleOf = (x: number, y: number): number => (Math.atan2(y, x) * 180) / Math.PI;
describe('battle-rifle magazine orientations', () => {
  it('aligns the tilted magazine and its well at the shared tilt angle', () => {
    const report = validate(oriented('tilt'), gunDomain);
    expect(report.ok).toBe(true);
    const lower = report.resolved.defs.get('lower')!;
    const wellPort = lower.ports.find(({ id }) => id === 'magazine')!;
    const angle = G3_MAGAZINE_WELL_TILT;
    expect(angleOf(wellPort.normal[0], wellPort.normal[1])).toBeCloseTo(-90 + (angle * 180) / Math.PI, 5);
    const path = lower.keepOuts.find(({ id }) => id === 'magazine-path')!;
    expect(path.profile).toBeDefined();
    expect(validateExtrudedPolygon(path.profile!, path.z!)).toBeUndefined();
    const magazine = report.resolved.defs.get('magazine')!;
    expect(magazine.solids).toEqual(FAMILIES.magazine!.build({ length: 'M', profile: 'standard' }).solids);
    const topNormal = applyDir(report.resolved.placed.get('magazine')!, [0, 1, 0]);
    expect(topNormal[0]).toBeCloseTo(-Math.sin(angle), 5);
    expect(topNormal[1]).toBeCloseTo(Math.cos(angle), 5);
  });

  it.each(['slant-5', 'slant-8', 'slant-10'])(
    'slants only the magazine bottom while keeping the well straight (%s)',
    (style) => {
      const report = validate(oriented(style), gunDomain);
      expect(report.ok).toBe(true);
      const lower = report.resolved.defs.get('lower')!;
      const straightLower = FAMILIES.lower!.build({ layout: 'conventional' });
      expect(lower.ports.find(({ id }) => id === 'magazine')!.normal).toEqual([0, -1, 0]);
      expect(lower.keepOuts).toEqual(straightLower.keepOuts);
      expect(lower.solids.find(({ id }) => id === 'frame-rear')?.kind).toBe('box');

      const magazine = report.resolved.defs.get('magazine')!;
      expect(magazine.solids).toHaveLength(1);
      const body = magazine.solids[0]!;
      expect(body.kind).toBe('extruded-polygon');
      if (body.kind !== 'extruded-polygon') {
        throw new Error('Expected one convex trapezoid for a slanted magazine.');
      }
      const [rearBottom, frontBottom, frontTop, rearTop] = body.profile;
      expect(frontTop![1]).toBe(rearTop![1]);
      expect(frontBottom![0]).toBe(frontTop![0]);
      expect(rearBottom![0]).toBe(rearTop![0]);
      expect(frontBottom![1]).toBeGreaterThan(rearBottom![1]);
      const rearLength = rearTop![1] - rearBottom![1];
      const frontLength = frontTop![1] - frontBottom![1];
      expect(rearLength).toBeGreaterThan(frontLength);
      const bottomDegrees = angleOf(frontBottom![0] - rearBottom![0], frontBottom![1] - rearBottom![1]);
      expect(bottomDegrees).toBeGreaterThan(0);
      expect(bottomDegrees).toBeCloseTo(Number(style.split('-')[1]), 0);
    },
  );

  // The direct geometry cases above cover each style; this sweep guards template selection and inheritance.
  // It scans seeds until every orientation the template offers has been generated.
  sweepGroup('generates every magazine orientation and inherits it into the lower', () => {
    it('passes', () => {
      const offered = battleRifle.slots.find(({ id }) => id === 'magazine')?.params?.orientation;
      const wanted = new Set(Array.isArray(offered) ? offered : [offered]);
      expect(wanted.size).toBeGreaterThan(1);
      const styles = new Set<string>();
      for (let seed = 0; seed < SEED_SCAN_BOUND && styles.size < wanted.size; seed++) {
        const assembly = generate(battleRifle, gunDomain, seed);
        const style = assembly.parts.magazine!.params!.orientation!;
        styles.add(style);
        const report = validate(assembly, gunDomain);
        expect(report.ok, `seed ${seed}`).toBe(true);
        expect(report.resolved.params.get('lower')?.magazineOrientation?.value).toBe(style);
      }
      expect(styles).toEqual(wanted);
    });
  });

  it('keeps straight magazine geometry and the well as the zero-angle reference', () => {
    const report = validate(oriented('straight'), gunDomain);
    expect(report.ok).toBe(true);
    expect(report.resolved.defs.get('magazine')!.solids[0]!.kind).toBe('box');
    expect(report.resolved.defs.get('lower')!.solids.find(({ id }) => id === 'frame-rear')?.kind).toBe('box');
  });
});
