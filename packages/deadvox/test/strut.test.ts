import { blockRayQuery } from '@skelly/engine/internal/core/blockRay.ts';
import { buildRegistry } from '@skelly/engine/internal/core/content.ts';
import type { Vec3 } from '@skelly/engine/internal/core/coords.ts';
import { CHUNK } from '@skelly/engine/internal/core/coords.ts';
import { buildMesh } from '@skelly/engine/internal/core/mesher.ts';
import { PADDED, paddedIndex } from '@skelly/engine/internal/core/meshInput.ts';
import { raycast } from '@skelly/engine/internal/core/raycast.ts';
import type { BlockDef } from '@skelly/engine/internal/core/schema.ts';
import { traceShot } from '@skelly/engine/internal/core/shotTrace.ts';
import { createSupport } from '@skelly/engine/internal/core/structureSupport.ts';
import { describe, expect, it } from 'vitest';
import strutFixture from '../mods/skelly.deadvox.scenario.test-house.strut-look/layouts.json' with { type: 'json' };
import { baseRegistry } from './baseRegistry.ts';
import { fixtureBlockMaterial } from './blockMaterialFixture.ts';

const shape = { rise: '+x', widthBlocks: 0.2 } as const;
const block: BlockDef = {
  id: 'fixture_strut',
  material: 'fixture_material',
  name: 'Fixture strut',
  color: '#888888',
  solid: true,
  opaque: false,
  loadPath: { kind: 'strut', bearing: '-x' },
  strut: shape,
};

describe('strut content and geometry', () => {
  it('the authored look beams hold only while their knee members remain', () => {
    const registry = baseRegistry();
    const template = strutFixture.templates[0]!;
    const blocks = new Map<string, number>();
    const beams: Vec3[] = [];
    const members: Vec3[] = [];
    const cells = template.layers.flatMap((layer, y) =>
      layer.flatMap((row, z) => [...row].map((glyph, x) => ({ glyph, cell: [x, y, z] as Vec3 }))),
    );
    for (const { glyph, cell } of cells) {
      const id = registry.blockIds.get(template.palette[glyph as keyof typeof template.palette]);
      if (id === undefined) {
        throw new Error('Fixture references an unknown block');
      }
      blocks.set(cell.join(','), id);
      if (glyph === 'a' || glyph === 'f') {
        beams.push(cell);
      }
      if (registry.blocks[id]!.strut) {
        members.push(cell);
      }
    }
    const view = {
      minY: 0,
      maxY: template.size[1]!,
      block: (x: number, y: number, z: number) => blocks.get(`${x},${y},${z}`) ?? 0,
      natural: (_x: number, y: number) => y === 0,
    };
    expect(beams.length).toBeGreaterThan(0);
    expect(members.length).toBeGreaterThan(0);
    const before = createSupport(registry, view);
    expect(beams.every((cell) => before.holds(cell))).toBe(true);
    for (const cell of members) {
      blocks.delete(cell.join(','));
    }
    const after = createSupport(registry, view);
    expect(beams.every((cell) => !after.holds(cell))).toBe(true);
  });
  it.each(['+x', '-x', '+z', '-z'] as const)('shots hit the visible member and pass its gap for rise %s', (rise) => {
    const axis = rise.endsWith('x') ? 0 : 2;
    const across = axis === 0 ? 2 : 0;
    const base: Vec3 = [-CHUNK, 3, -CHUNK];
    const query = blockRayQuery(
      { blocks: [{ ...block, strut: { ...shape, rise } }] },
      () => 0,
      (x, y, z) => x === base[0] && y === base[1] && z === base[2],
    );
    const origin: Vec3 = [base[0] + 0.75, base[1] + 0.75, base[2] + 0.75];
    origin[axis] = base[axis]! + (rise.startsWith('+') ? 0.75 : 0.25);
    origin[across] = base[across]! - 1;
    const direction: Vec3 = [0, 0, 0];
    direction[across] = 1;
    const { hit } = traceShot(origin, [direction], 4, query)[0]!;
    expect(hit?.block).toEqual(base);
    expect(hit?.distance).toBeCloseTo(1 + (1 - shape.widthBlocks) / 2);
    const gap: Vec3 = [...origin];
    gap[axis] = base[axis]! + (rise.startsWith('+') ? 0.1 : 0.9);
    expect(traceShot(gap, [direction], 4, query)[0]!.hit).toBeUndefined();
    expect(raycast(origin, direction, 1, query)).toBeUndefined();
    // Starting inside the cell is not the same as starting inside its member.
    const inside: Vec3 = [...origin];
    inside[across] = base[across]! + 0.1;
    expect(raycast(inside, direction, 1, query)?.distance).toBeGreaterThan(0);
  });
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
