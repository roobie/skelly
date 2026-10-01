import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { generate } from '../src/core/generate.ts';
import { validateExtrudedPolygon } from '../src/core/geometry.ts';
import { BEVEL, meshForSolid, meshForSolidGroup } from '../src/core/mesh.ts';
import { resolve } from '../src/core/resolve.ts';
import type { BoxSolid, ExtrudedPolygonSolid, Solid, Vec2 } from '../src/core/schema.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { TEMPLATES } from '../src/gun/templates.ts';
import { expectWatertightMesh, loadCorpus } from './helpers.ts';

const THIN_SOLID_ERROR = /thinner than the mesh-group weld contract/;

// A stated per-assembly triangle budget (PROJECT.md §7). `npm run mesh-stats`
// over 1000 seeds/template puts the largest single build (ak) at 2312
// triangles; this budget leaves more than 2x headroom without letting the
// beveled mesh balloon unnoticed.
const TRIANGLE_BUDGET = 5000;

const box: BoxSolid = { id: 'b', kind: 'box', box: { center: [1, 2, 3], half: [2, 1, 1.5] } };

const prism: ExtrudedPolygonSolid = {
  id: 'p',
  kind: 'extruded-polygon',
  profile: [
    [0, 0],
    [4, 0],
    [4, 2],
    [2, 3],
    [0, 2],
  ],
  z: [-1, 1],
};

/** Axis-aligned min/max of a mesh's vertex positions. */
const bounds = (positions: Float32Array): { min: [number, number, number]; max: [number, number, number] } => {
  const min: [number, number, number] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max: [number, number, number] = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (let i = 0; i < positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis]!, positions[i + axis]!);
      max[axis] = Math.max(max[axis]!, positions[i + axis]!);
    }
  }
  return { min, max };
};

/**
 * Vertex indices whose normal does not point away from `centroid` (the sign
 * test): for each, the normal · (vertex - centroid) dot product, which
 * should be positive everywhere on a convex, centroid-containing solid.
 */
const inwardNormals = (
  mesh: ReturnType<typeof meshForSolid>,
  centroid: readonly [number, number, number],
): { vertex: number; dot: number }[] => {
  const offenders: { vertex: number; dot: number }[] = [];
  for (let v = 0; v < mesh.positions.length / 3; v++) {
    const px = mesh.positions[v * 3]! - centroid[0];
    const py = mesh.positions[v * 3 + 1]! - centroid[1];
    const pz = mesh.positions[v * 3 + 2]! - centroid[2];
    const nx = mesh.normals[v * 3]!;
    const ny = mesh.normals[v * 3 + 1]!;
    const nz = mesh.normals[v * 3 + 2]!;
    const dot = px * nx + py * ny + pz * nz;
    if (dot <= 0) {
      offenders.push({ vertex: v, dot });
    }
  }
  return offenders;
};

describe('meshForSolid', () => {
  it('keeps the bounding box exactly the box solid’s own extent', () => {
    const mesh = meshForSolid(box);
    const { min, max } = bounds(mesh.positions);
    expect(min).toEqual([-1, 1, 1.5]);
    expect(max).toEqual([3, 3, 4.5]);
  });

  it('keeps the bounding box exactly the extruded-polygon solid’s extent, everywhere the outline attains it along a flat edge', () => {
    // Every axis but +Y here is bounded by a full profile edge (or, for Z, the flat caps),
    // so the chamfer touches nothing that defines the extent: it stays exact.
    const mesh = meshForSolid(prism);
    const { min, max } = bounds(mesh.positions);
    expect(min).toEqual([0, 0, -1]);
    expect(max[0]).toBe(4);
    expect(max[2]).toBe(1);
  });

  it('never exceeds the outline, even at a lone vertex apex (+Y here, touched only at (2, 3))', () => {
    const mesh = meshForSolid(prism);
    const { max } = bounds(mesh.positions);
    expect(max[1]).toBeLessThanOrEqual(3);
    expect(max[1]).toBeGreaterThan(3 - BEVEL);
  });

  it('gives a chamfered box 44 triangles (6 inset faces, 12 edge chamfers, 8 corner triangles)', () => {
    expect(meshForSolid(box).triangleCount).toBe(44);
  });

  it('gives a chamfered N-gon prism 12N-4 triangles', () => {
    expect(meshForSolid(prism).triangleCount).toBe(12 * prism.profile.length - 4);
  });

  it('faces outward for a chamfered box (sign test)', () => {
    expect(inwardNormals(meshForSolid(box), box.box.center)).toEqual([]);
  });

  it('faces outward for a chamfered extruded polygon (sign test)', () => {
    const cx = prism.profile.reduce((s, p) => s + p[0], 0) / prism.profile.length;
    const cy = prism.profile.reduce((s, p) => s + p[1], 0) / prism.profile.length;
    const cz = (prism.z[0] + prism.z[1]) / 2;
    expect(inwardNormals(meshForSolid(prism), [cx, cy, cz])).toEqual([]);
  });

  it('rejects profiles with collinear consecutive vertices before meshing', () => {
    const profile = [
      [0, 0],
      [2, 0],
      [4, 0],
      [4, 2],
      [0, 2],
    ] as const;
    expect(validateExtrudedPolygon(profile, [0, 1])).toBe('profile must not contain collinear consecutive vertices');
  });

  it('clamps the bevel so a thin solid cannot invert', () => {
    const thin: BoxSolid = { id: 't', kind: 'box', box: { center: [0, 0, 0], half: [0.01, 5, 5] } };
    const mesh = meshForSolid(thin, BEVEL);
    const { min, max } = bounds(mesh.positions);
    expect(min[0]).toBeCloseTo(-0.01);
    expect(max[0]).toBeCloseTo(0.01);
    // No vertex may have crossed the solid's own centre plane.
    for (let i = 0; i < mesh.positions.length; i += 3) {
      expect(Math.abs(mesh.positions[i]!)).toBeLessThanOrEqual(0.01 + 1e-9);
    }
  });
});

const importRe = /^\s*(?:import|export)[^'"]*from\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm;
const meshSpecifierRe = /(^|\/)mesh(\.ts)?$/;

describe('mesh module is display-only', () => {
  it('the validator path in src/core does not import mesh.ts', () => {
    for (const name of ['validate.ts', 'rules.ts', 'resolve.ts', 'geometry.ts']) {
      const source = readFileSync(join(import.meta.dirname, '..', 'src', 'core', name), 'utf8');
      const specs = [...source.matchAll(importRe)].map((m) => m[1] ?? m[2] ?? '');
      expect(specs.length, `${name}: no imports parsed`).toBeGreaterThan(0);
      expect(
        specs.filter((s) => meshSpecifierRe.test(s)),
        `${name} imports mesh`,
      ).toEqual([]);
    }
  });
});

const triangleCount = (resolved: ReturnType<typeof resolve>): number => {
  let triangles = 0;
  for (const part of resolved.placed.keys()) {
    const def = resolved.defs.get(part)!;
    for (const s of def.displaySolids ?? def.solids) {
      triangles += meshForSolid(s).triangleCount;
    }
  }
  return triangles;
};

describe('per-assembly triangle budget', () => {
  // Replaces the former CI-only seed sweep (PROJECT.md, "Generator tests", removal plan (a)): the
  // budget is checked on every fixture (broken-* ones included; none exists to break it) and every
  // published design.
  it(`stays under ${TRIANGLE_BUDGET} triangles in every fixture and design`, () => {
    const corpus = loadCorpus(() => true);
    expect(corpus.length).toBeGreaterThanOrEqual(45);
    for (const { label, assembly } of corpus) {
      expect(triangleCount(resolve(assembly, gunDomain)), label).toBeLessThan(TRIANGLE_BUDGET);
    }
  });
});

// A regular N-gon profile, radius r, CCW (matches validateExtrudedPolygon's convention).
const regularPolygon = (n: number, r: number): Vec2[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n;
    return [r * Math.cos(a), r * Math.sin(a)] as Vec2;
  });

describe('watertightness (welded at 1e-5u)', () => {
  const profiles: Record<string, Solid> = {
    box,
    triangle: {
      id: 'tri',
      kind: 'extruded-polygon',
      profile: [
        [0, 0],
        [4, 0],
        [2, 3],
      ],
      z: [-1, 1],
    },
    'five-point': prism,
    octagon: { id: 'oct', kind: 'extruded-polygon', profile: regularPolygon(8, 3), z: [-1, 1] },
  };

  for (const [name, solid] of Object.entries(profiles)) {
    it(`has no gaps or T-junctions for a ${name} profile`, () => {
      expectWatertightMesh(meshForSolid(solid), name);
    });
  }

  it('renders a clipped prism with its new cap and preserves watertight topology', () => {
    const clipped: ExtrudedPolygonSolid = {
      id: 'clipped-box',
      kind: 'extruded-polygon',
      profile: [
        [0, 0],
        [2, 0],
        [2, 2],
        [0, 2],
      ],
      z: [0, 2],
      clip: [{ normal: [1, 1, 0], offset: 2 }],
    };
    const mesh = meshForSolid(clipped);
    expect(mesh.triangleCount).toBe(8);
    expectWatertightMesh(mesh, 'clipped prism');
  });

  it('culls nested pieces from exterior faces and preserves closed union boundaries', () => {
    const nested = meshForSolidGroup([
      { id: 'outer', kind: 'box', box: { center: [0, 0, 0], half: [2, 2, 2] } },
      { id: 'inner', kind: 'box', box: { center: [0, 0, 0], half: [1, 1, 1] } },
    ]);
    expect(nested.triangleCount).toBe(12);
    expectWatertightMesh(nested, 'nested boxes');
  });

  it('merges coincident, overlapping, and T-junction box groups into closed boundaries', () => {
    const coincident = meshForSolidGroup([
      { id: 'a', kind: 'box', box: { center: [0, 0, 0], half: [1, 1, 1] } },
      { id: 'b', kind: 'box', box: { center: [0, 0, 0], half: [1, 1, 1] } },
    ]);
    expect(coincident.triangleCount).toBe(12);
    expectWatertightMesh(coincident, 'coincident boxes');
    for (const [label, solids] of [
      [
        'overlap',
        [
          { id: 'a', kind: 'box' as const, box: { center: [0, 0, 0] as const, half: [1, 1, 1] as const } },
          { id: 'b', kind: 'box' as const, box: { center: [1, 0, 0] as const, half: [1, 1, 1] as const } },
        ],
      ],
      [
        'T-junction',
        [
          { id: 'main', kind: 'box' as const, box: { center: [1, 1, 1] as const, half: [1, 1, 1] as const } },
          {
            id: 'neighbor',
            kind: 'box' as const,
            box: { center: [-0.5, 0.75, 1] as const, half: [0.5, 0.25, 1] as const },
          },
        ],
      ],
    ] as const) {
      expectWatertightMesh(meshForSolidGroup(solids), label);
    }
  });

  it('rejects union pieces thinner than ten weld tolerances', () => {
    const thin: BoxSolid = { id: 'thin', kind: 'box', box: { center: [0, 0, 0], half: [2.5e-6, 1, 1] } };
    expect(() => meshForSolidGroup([thin])).toThrow(THIN_SOLID_ERROR);
  });

  it('is watertight for every solid (including displaySolids) of every template at a few seeds', () => {
    for (const t of TEMPLATES) {
      for (const seed of [0, 1, 2]) {
        const resolved = resolve(generate(t, gunDomain, seed), gunDomain);
        for (const part of resolved.placed.keys()) {
          const def = resolved.defs.get(part)!;
          for (const s of def.displaySolids ?? def.solids) {
            const label = `${t.name} seed ${seed} part ${part} solid ${s.id}`;
            expectWatertightMesh(meshForSolid(s), label);
          }
        }
      }
    }
  });
});
