import { buildRegistry } from '@skelly/engine/internal/core/content.ts';
import { CHUNK } from '@skelly/engine/internal/core/coords.ts';
import { buildMesh } from '@skelly/engine/internal/core/mesher.ts';
import { PADDED, paddedIndex } from '@skelly/engine/internal/core/meshInput.ts';
import type { BlockDef } from '@skelly/engine/internal/core/schema.ts';
import { describe, expect, it } from 'vitest';
import { fixtureBlockMaterial } from './blockMaterialFixture.ts';

const shape = { rise: '+x', widthBlocks: 0.2 } as const;
const block: BlockDef = {
  id: 'fixture_strut',
  material: 'fixture_material',
  name: 'Fixture strut',
  color: '#888888',
  solid: true,
  opaque: false,
  bearing: '-x',
  strut: shape,
};

describe('strut content and geometry', () => {
  it('rejects a strut whose material is declared non-structural', () => {
    const issues = (structural: boolean) =>
      buildRegistry([
        {
          source: 'fixture',
          data: {
            blocks: [block],
            blockMaterials: [{ ...fixtureBlockMaterial(block.id), structural }],
          },
        },
      ]).issues.filter((issue) => issue.message.includes('structural material'));
    expect(issues(true)).toEqual([]);
    expect(issues(false)).toHaveLength(1);
  });

  it('meshes a bounded diagonal without cube faces and attributes each vertex to its cell', () => {
    const padded = new Uint16Array(PADDED ** 3);
    const x = CHUNK - 1;
    padded[paddedIndex(x + 1, 2, 2)] = 1;
    const mesh = buildMesh(padded, new Uint8Array([0, 0, 0, 128, 128, 128]), { struts: [undefined, shape] });
    expect(mesh.indices.length).toBeGreaterThan(0);
    let diagonal = false;
    for (let at = 0; at < mesh.positions.length; at += 3) {
      const p = [...mesh.positions.slice(at, at + 3)];
      expect(p[0]).toBeGreaterThanOrEqual(x);
      expect(p[0]).toBeLessThanOrEqual(x + 1);
      expect(Math.abs(p[0]! - x - (p[1]! - 1))).toBeLessThanOrEqual(shape.widthBlocks + 1e-6);
      expect(p.map((v, axis) => Math.floor(v - mesh.cellOffsets[at + axis]!))).toEqual([x, 1, 1]);
      diagonal ||= mesh.normals[at] !== 0 && mesh.normals[at + 1] !== 0;
    }
    expect(diagonal).toBe(true);
  });
});
