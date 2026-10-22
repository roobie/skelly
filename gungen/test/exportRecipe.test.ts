import { expect, it } from 'vitest';
import { loadExportRecipe } from '../src/cli/exportRecipe.ts';
import { readGlb } from './glbReader.ts';

const SOURCE_CONTEXT = /Export fixture.*fixture-source/;

it.each(['fixture-unsupported', 'toString'])('refuses unknown export kind %s at recipe load', (kind) => {
  expect(() => loadExportRecipe([{ id: 'fixture', kind, source: 'fixture-source' }])).toThrow('unknown export kind');
});

it.each([
  { kind: 'design' },
  { kind: 'cartridge', options: { component: 'round' } },
  { kind: 'attachment' },
  { kind: 'magazine', options: { cartridge: 'fixture-cartridge.json', appearanceProfile: 'fixture' } },
])('refuses unresolved $kind sources at recipe load', (selection) => {
  expect(() => loadExportRecipe([{ id: 'fixture', source: 'fixture-source', ...selection }])).toThrow(SOURCE_CONTEXT);
});

it('rejects two rows owning the same output identity before resolving sources', () => {
  const row = { id: 'fixture', kind: 'design', source: 'fixture-source' };
  expect(() => loadExportRecipe([row, row])).toThrow('duplicate export id');
});

it('takes a positive voxel grain on a design row and refuses one that is not', () => {
  const row = (voxelGrain: number) => [
    { id: 'fixture', kind: 'design', source: 'fixture-source', options: { voxelGrain } },
  ];
  expect(() => loadExportRecipe(row(0.05))).toThrow(SOURCE_CONTEXT);
  expect(() => loadExportRecipe(row(0))).toThrow('Invalid');
});

it('writes the design row grain into the exported GLB', () => {
  const grain = 0.05;
  const [exported] = loadExportRecipe([
    { id: 'fixture', kind: 'design', source: 'gungen/designs/archetype-ak-akm.json', options: { voxelGrain: grain } },
  ]);
  const extras = readGlb(exported!.generate().glb).json.meshes.flatMap(({ primitives }) =>
    primitives.map((primitive) => (primitive.extras ?? {}) as Record<string, unknown>),
  );
  expect(extras.length).toBeGreaterThan(0);
  expect(extras.every((entry) => entry.voxelGrain === grain)).toBe(true);
});

it('rejects options not taken by the selected exporter', () => {
  expect(() =>
    loadExportRecipe([{ id: 'fixture', kind: 'design', source: 'fixture-source', options: { component: 'round' } }]),
  ).toThrow('Invalid key');
});
