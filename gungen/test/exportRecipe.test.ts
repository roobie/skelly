import { afterAll, describe, expect, it } from 'vitest';
import { loadExportRecipe } from '../src/cli/exportRecipe.ts';
import { readGlb } from './glbReader.ts';

const SOURCE_CONTEXT = /Export fixture.*fixture-source/;
const voxel = { grain: 0.004, detailGrain: 0.002 };

it.each(['fixture-unsupported', 'toString'])('refuses unknown export kind %s at recipe load', (kind) => {
  expect(() => loadExportRecipe([{ id: 'fixture', kind, source: 'fixture-source', voxel }])).toThrow(
    'unknown export kind',
  );
});

it.each([
  { kind: 'design' },
  { kind: 'cartridge', options: { component: 'round' } },
  { kind: 'attachment' },
  { kind: 'magazine', options: { cartridge: 'fixture-cartridge.json', appearanceProfile: 'fixture' } },
])('refuses unresolved $kind sources at recipe load', (selection) => {
  expect(() => loadExportRecipe([{ id: 'fixture', source: 'fixture-source', voxel, ...selection }])).toThrow(
    SOURCE_CONTEXT,
  );
});

it('rejects two rows owning the same output identity before resolving sources', () => {
  const row = { id: 'fixture', kind: 'design', source: 'fixture-source', voxel };
  expect(() => loadExportRecipe([row, row])).toThrow('duplicate export id');
});

const designExport = (grains: { grain: number; detailGrain?: number }) => {
  const [exported] = loadExportRecipe([
    { id: 'fixture', kind: 'design', source: 'gungen/designs/archetype-ak-akm.json', voxel: grains },
  ]);
  return exported!.generate();
};

it('puts every unrotated part, coarse or fine, on the fine lattice so the two grains nest', () => {
  const { json, floats } = readGlb(designExport(voxel).glb);
  const seen = new Set<number>();
  for (const node of json.nodes) {
    const translation = node.translation ?? [0, 0, 0];
    if (node.mesh === undefined || node.rotation !== undefined) {
      continue;
    }
    for (const primitive of json.meshes[node.mesh]!.primitives) {
      const grain = (primitive.extras as { voxelGrain: number }).voxelGrain;
      seen.add(grain);
      const positions = floats(primitive.attributes.POSITION);
      for (let i = 0; i < positions.length; i += 1) {
        const world = positions[i]! + translation[i % 3]!;
        for (const step of [grain, voxel.detailGrain]) {
          expect(Math.abs(world / step - Math.round(world / step))).toBeLessThan(1e-3);
        }
      }
    }
  }
  expect([...seen].sort()).toEqual([voxel.detailGrain, voxel.grain]);
});

it('exports a voxelized sight whose up is perpendicular to its direction', () => {
  const { sight } = (
    designExport(voxel) as unknown as {
      modelEntry: { gun: { sight: { direction: readonly number[]; up: readonly number[] } } };
    }
  ).modelEntry.gun;
  const dot = sight.direction.reduce((sum, component, axis) => sum + component * sight.up[axis]!, 0);
  expect(Math.abs(dot)).toBeLessThan(1e-9);
});

describe('recipe iron sight lattice', () => {
  let ironSights = 0;
  afterAll(() => {
    if (ironSights === 0) {
      throw new Error('The recipe must exercise an iron sight');
    }
  });
  it.for(loadExportRecipe().filter(({ kind }) => kind === 'design'))(
    'puts $id iron sight eye on a drawn voxel top, which lies on its fine lattice',
    (row, context) => {
      const { sight } = (
        row.generate().modelEntry as unknown as { gun: { sight: { kind: string; eye: readonly number[] } } }
      ).gun;
      if (sight.kind !== 'iron') {
        context.skip();
        return;
      }
      ironSights += 1;
      const step = row.voxel.voxelDetailGrain ?? row.voxel.voxelGrain;
      expect(Math.abs(sight.eye[1]! / step - Math.round(sight.eye[1]! / step)), row.id).toBeLessThan(1e-6);
    },
  );
});

it('refuses a detail grain the gun grain is not a whole multiple of', () => {
  expect(() => designExport({ grain: 0.005, detailGrain: 0.002 })).toThrow('nest');
});

it('rejects options not taken by the selected exporter', () => {
  expect(() =>
    loadExportRecipe([
      { id: 'fixture', kind: 'design', source: 'fixture-source', voxel, options: { component: 'round' } },
    ]),
  ).toThrow('Invalid key');
});
