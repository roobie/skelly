import { describe, expect, it } from 'vitest';
import { generate } from '../src/core/generate.ts';
import { BEVEL, meshForSolid } from '../src/core/mesh.ts';
import { resolve } from '../src/core/resolve.ts';
import type { BoxSolid, ExtrudedPolygonSolid } from '../src/core/schema.ts';
import { validate } from '../src/core/validate.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { TEMPLATES } from '../src/gun/templates.ts';

// Smaller than generate.test.ts's SEEDS: this file already re-runs generate+validate
// (baseline) and meshForSolid over every solid of every seed (budget), on top of the
// existing suite's own sweeps; 60 seeds/template keeps that added cost from starving
// other tests' timeouts when the whole suite runs in parallel.
const SEEDS = 60;
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

describe('validator results are unchanged by the mesh module (display-only)', () => {
  it('per-template valid/distinct counts over a seed sweep match the recorded baseline', () => {
    const summary = TEMPLATES.map((t) => {
      let valid = 0;
      const distinct = new Set<string>();
      for (let seed = 0; seed < SEEDS; seed++) {
        const a = generate(t, gunDomain, seed);
        distinct.add(JSON.stringify({ parts: a.parts, connections: a.connections }));
        if (validate(a, gunDomain).ok) {
          valid += 1;
        }
      }
      return { template: t.name, valid, distinct: distinct.size };
    });
    expect(summary).toMatchSnapshot();
  }, 30_000);
});

describe('per-assembly triangle budget', () => {
  it(`stays under ${TRIANGLE_BUDGET} triangles across a seed sweep`, () => {
    for (const t of TEMPLATES) {
      for (let seed = 0; seed < SEEDS; seed++) {
        const resolved = resolve(generate(t, gunDomain, seed), gunDomain);
        let triangles = 0;
        for (const part of resolved.placed.keys()) {
          const def = resolved.defs.get(part)!;
          for (const s of def.displaySolids ?? def.solids) {
            triangles += meshForSolid(s).triangleCount;
          }
        }
        expect(triangles, `${t.name} seed ${seed}`).toBeLessThan(TRIANGLE_BUDGET);
      }
    }
  }, 30_000);
});
