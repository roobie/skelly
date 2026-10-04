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
import { expectWatertightMesh } from './helpers.ts';

const THIN_SOLID_ERROR = /thinner than the mesh-group weld contract/;

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
  it('keeps the bounding box equal to the box solid’s own extent', () => {
    const mesh = meshForSolid(box);
    const { min, max } = bounds(mesh.positions);
    const expectedMin = box.box.center.map((center, axis) => center - box.box.half[axis]!);
    const expectedMax = box.box.center.map((center, axis) => center + box.box.half[axis]!);
    expect(min).toEqual(expectedMin);
    expect(max).toEqual(expectedMax);
  });

  it('preserves flat-edge and cap bounds while keeping a bevelled apex within the outline', () => {
    // The profile apex at +Y is bevelled; flat profile edges and the extrusion caps stay exact.
    const mesh = meshForSolid(prism);
    const { min, max } = bounds(mesh.positions);
    const expectedMin: [number, number, number] = [
      Math.min(...prism.profile.map(([x]) => x)),
      Math.min(...prism.profile.map(([, y]) => y)),
      prism.z[0],
    ];
    const expectedMax: [number, number, number] = [
      Math.max(...prism.profile.map(([x]) => x)),
      Math.max(...prism.profile.map(([, y]) => y)),
      prism.z[1],
    ];
    expect(min).toEqual(expectedMin);
    expect(max[0]).toBe(expectedMax[0]);
    expect(max[1]).toBeLessThanOrEqual(expectedMax[1]);
    expect(max[1]).toBeGreaterThan(expectedMax[1] - BEVEL);
    expect(max[2]).toBe(expectedMax[2]);
  });

  it('never exceeds the outline, even at a lone vertex apex (+Y here, touched only at (2, 3))', () => {
    const mesh = meshForSolid(prism);
    const { max } = bounds(mesh.positions);
    const apexY = Math.max(...prism.profile.map(([, y]) => y));
    expect(max[1]).toBeLessThanOrEqual(apexY);
    expect(max[1]).toBeGreaterThan(apexY - BEVEL);
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
    expect(min[0]).toBeCloseTo(thin.box.center[0] - thin.box.half[0]);
    expect(max[0]).toBeCloseTo(thin.box.center[0] + thin.box.half[0]);
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
      display: { bevel: false },
    };
    const mesh = meshForSolid(clipped);
    expectWatertightMesh(mesh, 'clipped prism');
  });

  it('culls nested pieces from exterior faces and preserves closed union boundaries', () => {
    const nested = meshForSolidGroup([
      { id: 'outer', kind: 'box', box: { center: [0, 0, 0], half: [2, 2, 2] } },
      { id: 'inner', kind: 'box', box: { center: [0, 0, 0], half: [1, 1, 1] } },
    ]);
    expectWatertightMesh(nested, 'nested boxes');
  });

  it('merges coincident, overlapping, and T-junction box groups into closed boundaries', () => {
    const coincident = meshForSolidGroup([
      { id: 'a', kind: 'box', box: { center: [0, 0, 0], half: [1, 1, 1] } },
      { id: 'b', kind: 'box', box: { center: [0, 0, 0], half: [1, 1, 1] } },
    ]);
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

  it('welds adjacent tapered cells whose shared width is on a half-grid rounding tie', () => {
    const cellProfiles = [
      [
        [-0.656_25, -2.260_742_187_5],
        [-0.609_375, -2.273_071_289_062_5],
        [-0.609_375, 0.766_152_343_75],
        [-0.656_25, 0.748_984_375],
      ],
      [
        [-0.703_125, -2.252_807_617_187_5],
        [-0.656_25, -2.260_742_187_5],
        [-0.656_25, 0.748_984_375],
        [-0.703_125, 0.731_933_593_75],
      ],
    ] as const;
    const cells: ExtrudedPolygonSolid[] = cellProfiles.map((profile, i) => ({
      id: `cell-${i}`,
      kind: 'extruded-polygon',
      profile,
      z: [-1.5, 1.5],
      clip: [
        { normal: [-5 / 6, 0, 1], offset: 1.5 },
        { normal: [-5 / 6, 0, -1], offset: 1.5 },
      ],
    }));
    expectWatertightMesh(meshForSolidGroup(cells), 'half-grid shared station');
  });

  it('rejects union pieces thinner than ten weld tolerances', () => {
    const thin: BoxSolid = { id: 'thin', kind: 'box', box: { center: [0, 0, 0], half: [2.5e-6, 1, 1] } };
    expect(() => meshForSolidGroup([thin])).toThrow(THIN_SOLID_ERROR);
  });

  // Measured about 1.5 s on a loaded host (load 4-10), too much of vitest's 5 s default; the explicit timeout, about 5x that, keeps it from flaking under load.
  it('is watertight for every solid (including displaySolids) of every template at a few seeds', {
    timeout: 10_000,
  }, () => {
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
