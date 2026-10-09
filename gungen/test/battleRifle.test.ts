import { generate } from '@skelly/engine/core/generate.ts';
import { validateExtrudedPolygon } from '@skelly/engine/core/geometry.ts';
import { applyDir } from '@skelly/engine/core/math.ts';
import { validate } from '@skelly/engine/core/validate.ts';
import { describe, expect, it } from 'vitest';
import { gunDomain } from '../src/gun/domain.ts';
import { FAMILIES, G3_MAGAZINE_WELL_TILT } from '../src/gun/parts.ts';
import { battleRifle } from '../src/gun/templates.ts';
import { loadFixture } from './helpers.ts';
import { sweepGroup } from './sweeps.ts';

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
  it('derives a slight magazine tilt from the longer rear plate while keeping the well blocks upright', () => {
    const report = validate(oriented('tilt'), gunDomain);
    expect(report.ok).toBe(true);
    const lower = report.resolved.defs.get('lower')!;
    const wellPort = lower.ports.find(({ id }) => id === 'magazine')!;
    const angle = G3_MAGAZINE_WELL_TILT;
    expect(angleOf(wellPort.normal[0], wellPort.normal[1])).toBeCloseTo(-90 + (angle * 180) / Math.PI, 5);
    expect(lower.solids.find(({ id }) => id === 'frame-rear')?.kind).toBe('box');
    expect(lower.solids.find(({ id }) => id === 'frame-front')?.kind).toBe('box');
    const housing = lower.solids.filter(({ id }) => id.startsWith('tilt-housing-'));
    expect(housing.map(({ id }) => id)).toEqual([
      'tilt-housing-rear',
      'tilt-housing-front',
      'tilt-housing-left',
      'tilt-housing-right',
    ]);
    const rearPlate = housing[0]!;
    const frontPlate = housing[1]!;
    expect(rearPlate.kind).toBe('extruded-polygon');
    expect(frontPlate.kind).toBe('extruded-polygon');
    if (rearPlate.kind !== 'extruded-polygon' || frontPlate.kind !== 'extruded-polygon') {
      throw new Error('Expected upright housing plates.');
    }
    const verticalLength = (profile: readonly (readonly [number, number])[]) =>
      Math.max(...profile.map(([, y]) => y)) - Math.min(...profile.map(([, y]) => y));
    const rearHeight = verticalLength(rearPlate.profile);
    const frontHeight = verticalLength(frontPlate.profile);
    expect(rearHeight).toBeGreaterThan(frontHeight);
    const rearX = rearPlate.profile.map(([x]) => x);
    const frontX = frontPlate.profile.map(([x]) => x);
    const plateRun = Math.abs(
      (Math.min(...rearX) + Math.max(...rearX) - Math.min(...frontX) - Math.max(...frontX)) / 2,
    );
    expect(angle).toBeCloseTo(Math.atan2(rearHeight - frontHeight, plateRun));
    const path = lower.keepOuts.find(({ id }) => id === 'magazine-path')!;
    const wellPath = lower.keepOuts.find(({ id }) => id === 'magazine-well-path')!;
    expect(path.profile).toBeDefined();
    expect(path.z).toEqual([-1.5, 1.5]);
    expect(validateExtrudedPolygon(path.profile!, path.z!)).toBeUndefined();
    expect(wellPath.profile).toBeUndefined();
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

  // Fixed seeds 0–5 exercise every generated style (slant-8, tilt, straight, slant-10, slant-5).
  // The direct geometry cases above cover each style; this sweep guards template selection and inheritance.
  sweepGroup('generates every magazine orientation and inherits it into the lower', () => {
    it('passes', () => {
      const styles = new Set<string>();
      for (const seed of [0, 1, 2, 3, 4, 5]) {
        const assembly = generate(battleRifle, gunDomain, seed);
        const style = assembly.parts.magazine!.params!.orientation!;
        styles.add(style);
        const report = validate(assembly, gunDomain);
        expect(report.ok, `seed ${seed}`).toBe(true);
        expect(report.resolved.params.get('lower')?.magazineOrientation?.value).toBe(style);
      }
      expect(styles).toEqual(new Set(['slant-8', 'tilt', 'straight', 'slant-10', 'slant-5']));
    });
  });

  it('keeps straight magazine geometry and the well as the zero-angle reference', () => {
    const report = validate(oriented('straight'), gunDomain);
    expect(report.ok).toBe(true);
    expect(report.resolved.defs.get('magazine')!.solids[0]!.kind).toBe('box');
    expect(report.resolved.defs.get('lower')!.solids.find(({ id }) => id === 'frame-rear')?.kind).toBe('box');
  });
});
