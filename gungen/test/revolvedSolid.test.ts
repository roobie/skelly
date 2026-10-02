import { describe, expect, it } from 'vitest';
import type { GlbAssetIdentity, Palette, SelectedAnchors } from '../src/core/design.ts';
import { distanceWorld, localSolidBounds, penetrationWorld, worldSolid } from '../src/core/geometry.ts';
import { exportGlb } from '../src/core/glb.ts';
import { type ExtrusionAxis, extrusionPoint, IDENTITY } from '../src/core/math.ts';
import { meshForSolid } from '../src/core/mesh.ts';
import { resolve } from '../src/core/resolve.ts';
import type { Domain, DomainUnits, PartDef, RevolvedSolid, Solid } from '../src/core/schema.ts';
import { validate } from '../src/core/validate.ts';
import { readGlb } from './glbReader.ts';

const AXES: readonly ExtrusionAxis[] = ['x', 'y', 'z'];

// Radius 2 over axial 0..3, with a groove (radius 1) between axial 1 and 2.
const grooved = (axis: ExtrusionAxis): RevolvedSolid => ({
  id: 'grooved',
  kind: 'revolved',
  axis,
  profile: [
    [0, 0],
    [0, 2],
    [1, 2],
    [1, 1],
    [2, 1],
    [2, 2],
    [3, 2],
    [3, 0],
  ],
});

/** A box centred `axial` along `axis` and `across` off it on that axis's first transverse direction. */
const probe = (
  axis: ExtrusionAxis,
  at: { axial: number; across: number; axialHalf: number; acrossHalf: number },
): Solid => ({
  id: 'probe',
  kind: 'box',
  box: {
    center: extrusionPoint(axis, [at.across, 0], at.axial),
    half: extrusionPoint(axis, [at.acrossHalf, at.acrossHalf], at.axialHalf),
  },
});

const bounds = (positions: Float32Array): [number[], number[]] => {
  const min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (let i = 0; i < positions.length; i += 3) {
    for (const k of [0, 1, 2] as const) {
      min[k] = Math.min(min[k]!, positions[i + k]!);
      max[k] = Math.max(max[k]!, positions[i + k]!);
    }
  }
  return [min, max];
};

describe('revolved solid collision', () => {
  // The hull stands in for the solid, so what matters is that it lands where the drawn solid does on each axis.
  it.each(AXES)('measures distance to the hull and ignores a groove, turned about %s', (axis) => {
    const solid = grooved(axis);
    const hull = worldSolid(IDENTITY, solid);
    // Half a unit past the flat end, centred on the axis: exact distance, since the end disc is flat and wide.
    const pastEnd = probe(axis, { axial: 4, across: 0, axialHalf: 0.5, acrossHalf: 1 });
    expect(distanceWorld(hull, worldSolid(IDENTITY, pastEnd))).toBeCloseTo(0.5, 9);
    // A box lying inside the groove, clear of the real solid, still penetrates the hull.
    const inGroove = probe(axis, { axial: 1.5, across: 1.5, axialHalf: 0.2, acrossHalf: 0.2 });
    expect(penetrationWorld(hull, worldSolid(IDENTITY, inGroove))).toBeGreaterThan(0);
  });

  it.each(AXES)(
    'keeps the hull bounds equal to the drawn mesh at 24 facets and around it at lower ones, about %s',
    (axis) => {
      const solid = grooved(axis);
      const [hullMin, hullMax] = localSolidBounds(solid);
      const [closeMin, closeMax] = bounds(meshForSolid(solid, 0, 24).positions);
      for (const k of [0, 1, 2] as const) {
        expect(closeMin[k]).toBeCloseTo(hullMin[k], 5);
        expect(closeMax[k]).toBeCloseTo(hullMax[k], 5);
      }
      for (const facets of [5, 6]) {
        const [min, max] = bounds(meshForSolid(solid, 0, facets).positions);
        for (const k of [0, 1, 2] as const) {
          expect(min[k]).toBeGreaterThanOrEqual(hullMin[k] - 1e-5);
          expect(max[k]).toBeLessThanOrEqual(hullMax[k] + 1e-5);
        }
      }
    },
  );
});

const MILLIMETRES: DomainUnits = { metresPerUnit: 0.001, grid: 0.05, bevel: 0.025 };

const revolvedDomain = (solids: readonly Solid[]): Domain => ({
  name: 'revolved-test',
  units: MILLIMETRES,
  axisRules: [],
  families: {
    thing: {
      name: 'thing',
      params: {},
      build: (): PartDef => ({ family: 'thing', solids, ports: [], keepOuts: [], axes: [] }),
    },
  },
});

const thing = { name: 'thing', root: 'thing', parts: { thing: { family: 'thing' } }, connections: [] };

describe('revolved solid in an assembly', () => {
  it('reports an invalid profile as a structure issue instead of crashing a rule', () => {
    const bad: RevolvedSolid = {
      id: 'bad',
      kind: 'revolved',
      profile: [
        [0, -1],
        [1, 1],
      ],
    };
    const good: Solid = { id: 'good', kind: 'box', box: { center: [0, 0, 0], half: [1, 1, 1] } };
    const { issues } = validate(thing, revolvedDomain([bad, good]));
    expect(issues.map(({ rule }) => rule)).toEqual(['structure']);
    expect(issues[0]!.message).toContain('solid "bad" is invalid');
  });

  it('exports a revolved part in the domain unit with unit-length normals', () => {
    const cylinder: RevolvedSolid = {
      id: 'barrel',
      kind: 'revolved',
      axis: 'x',
      profile: [
        [0, 0],
        [0, 2],
        [3, 2],
        [3, 0],
      ],
    };
    const resolved = resolve(thing, revolvedDomain([cylinder]));
    const asset: GlbAssetIdentity = { id: 'thing', file: 'assets/models/thing.glb' };
    const anchors: SelectedAnchors = { hold: { position: [0, 0, 0], forward: [1, 0, 0], up: [0, 1, 0] }, others: {} };
    const palette: Palette = {
      familyColors: { thing: [0.5, 0.5, 0.5] },
      specialColors: {},
      fallbackColor: [0.5, 0.5, 0.5],
    };
    const result = exportGlb({ resolved, anchors, palette, asset, revolveFacets: 24 });
    if (!result.ok) {
      throw new Error(JSON.stringify(result.error));
    }
    const glb = readGlb(result.glb);
    const part = glb.json.nodes.find((node) => node.extras?.part === 'thing')!;
    const primitive = glb.json.meshes[part.mesh!]!.primitives[0]!;
    const { min, max } = glb.json.accessors[primitive.attributes.POSITION]!;
    // Axial 0..3 u along X and radius 2 u on Y (a vertex sits on +Y), in metres at 1 u = 1 mm.
    expect(min![0]).toBeCloseTo(0, 7);
    expect(max![0]).toBeCloseTo(0.003, 7);
    expect(max![1]).toBeCloseTo(0.002, 7);
    // At the 24 facets asked for a vertex also sits on +Z; the default 6 would stop at 2 sin 60 degrees.
    expect(max![2]).toBeCloseTo(0.002, 7);
    const normals = glb.floats(primitive.attributes.NORMAL);
    for (let i = 0; i < normals.length; i += 3) {
      expect(Math.hypot(normals[i]!, normals[i + 1]!, normals[i + 2]!)).toBeCloseTo(1, 5);
    }
  });
});
