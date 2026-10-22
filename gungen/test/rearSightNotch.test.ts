import { resolve } from '@skelly/engine/assembly/resolve.ts';
import type { Assembly } from '@skelly/engine/assembly/schema.ts';
import { describe, expect, it } from 'vitest';
import { gunDomain } from '../src/gun/domain.ts';
import { exportGunGlb } from '../src/gun/exportGlb.ts';
import gunVoxel from '../src/gun/gunVoxel.json' with { type: 'json' };
import { type GltfJson, readGlb } from './glbReader.ts';
import { loadDesigns, type MutableAssembly } from './helpers.ts';

const ASSET = { id: 'rear_sight_test', file: 'assets/models/rear_sight_test.glb' };

/** An iron-sight design: the optic comes off, so the file's sight line is the iron one. */
const ironOnly = (assembly: Assembly): Assembly => {
  const copy = structuredClone(assembly) as MutableAssembly;
  for (const [id, part] of Object.entries(copy.parts)) {
    if (part.family === 'sight') {
      delete copy.parts[id];
      copy.connections = copy.connections.filter(
        ({ from, to }) => !(from.startsWith(`${id}.`) || to.startsWith(`${id}.`)),
      );
    }
  }
  return copy;
};

/** The parts that carry a rear sight: a sight axis that is neither an optic nor a front sight. */
const rearSightParts = (assembly: Assembly): string[] =>
  [...resolve(assembly, gunDomain).defs.entries()]
    .filter(([id, def]) => {
      const { family } = assembly.parts[id]!;
      return def.axes.some(({ kind }) => kind === 'sight') && family !== 'sight' && !family.includes('front-sight');
    })
    .map(([id]) => id);

type Triangle = readonly [readonly number[], readonly number[], readonly number[]];

const partTriangles = (json: GltfJson, read: ReturnType<typeof readGlb>, partId: string): Triangle[] => {
  const triangles: Triangle[] = [];
  for (const node of json.nodes.filter(({ extras }) => extras?.part === partId)) {
    const shift = node.translation ?? [0, 0, 0];
    for (const primitive of json.meshes[node.mesh!]!.primitives) {
      const positions = read.floats(primitive.attributes.POSITION);
      const accessor = json.accessors[primitive.indices]!;
      const view = json.bufferViews[accessor.bufferView]!;
      const indices = new Uint32Array(read.bin.slice(view.byteOffset, view.byteOffset + accessor.count * 4).buffer);
      for (let i = 0; i < indices.length; i += 3) {
        triangles.push(
          [0, 1, 2].map((k) =>
            [0, 1, 2].map((axis) => positions[indices[i + k]! * 3 + axis]! + shift[axis]!),
          ) as unknown as Triangle,
        );
      }
    }
  }
  return triangles;
};

/**
 * How wide the file's drawn rear sight is open across the sight line: the distance between the drawn faces that bound
 * the line on either side, read in the top voxel row, or 0 where the line runs through drawn material.
 */
const openWidthAtLine = (triangles: readonly Triangle[], eye: readonly number[], row: number): number => {
  let left = Number.NEGATIVE_INFINITY;
  let right = Number.POSITIVE_INFINITY;
  for (const [a, b, c] of triangles) {
    const flat = a[2] === b[2] && b[2] === c[2];
    const over = (axis: number, at: number) =>
      Math.min(a[axis]!, b[axis]!, c[axis]!) < at && Math.max(a[axis]!, b[axis]!, c[axis]!) > at;
    if (!(flat && over(0, eye[0]!) && over(1, row))) {
      continue;
    }
    const towardsPlusZ = (b[0]! - a[0]!) * (c[1]! - a[1]!) - (b[1]! - a[1]!) * (c[0]! - a[0]!) > 0;
    if (towardsPlusZ && a[2]! <= eye[2]!) {
      left = Math.max(left, a[2]!);
    } else if (!towardsPlusZ && a[2]! >= eye[2]!) {
      right = Math.min(right, a[2]!);
    }
  }
  return Number.isFinite(left) && Number.isFinite(right) ? right - left : 0;
};

const rearSights = loadDesigns().flatMap(({ label, assembly }) => {
  const iron = ironOnly(assembly);
  return rearSightParts(iron).map((partId) => ({ label, assembly: iron, partId }));
});

describe('a rear sight keeps its notch in the voxelized file', () => {
  it('has rear sights to check', () => {
    expect(rearSights.length).toBeGreaterThan(0);
  });

  it.each(rearSights)('is open at the gun grain on the sight line: $label, $partId', ({ assembly, partId }) => {
    const result = exportGunGlb(
      assembly,
      ASSET,
      { appearanceProfile: 'ar' },
      {
        voxelGrain: gunVoxel.grain,
        voxelDetailGrain: gunVoxel.detailGrain,
      },
    );
    if (!result.ok) {
      throw new Error(`export failed: ${JSON.stringify(result.error)}`);
    }
    const { eye } = result.modelEntry.gun.sight!;
    const read = readGlb(result.glb);
    const row = eye[1] - gunVoxel.detailGrain / 2;
    const width = openWidthAtLine(partTriangles(read.json, read, partId), eye, row);
    expect(width).toBeGreaterThanOrEqual(gunVoxel.grain - 1e-6);
  });
});
