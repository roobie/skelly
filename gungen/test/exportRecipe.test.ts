import { expect, it } from 'vitest';
import { loadExportRecipe } from '../src/cli/exportRecipe.ts';

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

it('rejects options not taken by the selected exporter', () => {
  expect(() =>
    loadExportRecipe([{ id: 'fixture', kind: 'design', source: 'fixture-source', options: { component: 'round' } }]),
  ).toThrow('Invalid key');
});
