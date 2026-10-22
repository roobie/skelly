import { MATERIALS } from '@skelly/thing-core/materials';
import { expect, it } from 'vitest';
import { buildItem, catalogue, loadCatalogue } from '../src/catalogue.ts';
import { exportItem, loadThingRecipe } from '../src/exports.ts';

const material = Object.keys(MATERIALS)[0]!;
// Fine enough that a voxelized box stays within `toBeCloseTo` of the smooth datum it follows.
const VOXEL = { voxelGrain: 0.002 };
const ROW_VOXEL = { grain: 0.01 };
const port = (id: string, gender: 'male' | 'female', y: number) => ({
  id,
  mount: 'fixture-joint',
  gender,
  pos: [0, y, 0],
  normal: [0, gender === 'male' ? -1 : 1, 0],
  up: [1, 0, 0],
  required: true,
});
const fixture = () => ({
  units: { metresPerUnit: 1, grid: 0.001, bevel: 0 },
  facets: 12,
  defaultMaterial: material,
  items: [
    {
      id: 'fixture',
      exportMass: 'parts',
      parts: [
        {
          id: 'lower',
          family: 'cylinder',
          params: { radius: '0.03', height: '0.02' },
          massKg: 0.2,
          finish: { body: material },
          ports: [port('top', 'female', 0.02)],
        },
        {
          id: 'upper',
          family: 'cylinder',
          params: { radius: '0.02', height: '0.04' },
          massKg: 0.3,
          finish: { body: material },
          ports: [port('bottom', 'male', 0)],
        },
      ],
      connections: [{ from: 'lower.top', to: 'upper.bottom' }],
    },
  ],
});

it('keeps per-part ports when two parts use the same family builder', () => {
  const item = loadCatalogue(fixture()).items[0]!;
  const built = buildItem(item);
  expect(built.report.issues).toEqual([]);
  for (const part of item.parts) {
    expect(built.report.resolved.defs.get(part.id)?.ports).toEqual(part.ports);
  }
});
it('exports a grip following the held solid through resizing and assembly placement', () => {
  const input = fixture();
  const datum = {
    part: 'upper',
    solid: 'body',
    fraction: [0.5, 0.25, 0.5],
    turn: [0, 0, -90],
    hold: 'upright',
    roll: 90,
  };
  const exportFixture = () =>
    exportItem(
      loadCatalogue({
        ...input,
        items: [{ ...input.items[0], handling: datum }],
      }).items[0]!,
      { id: 'fixture', file: 'assets/models/fixture.glb' },
      VOXEL,
    ).modelEntry;
  const before = exportFixture();
  expect(before.grip?.at[1]).toBeCloseTo(0.03);
  expect(before.grip?.turn).toEqual(datum.turn);
  expect(before.hold).toBe(datum.hold);
  expect(before.roll).toBe(datum.roll);
  input.items[0]!.parts[1]!.params.height = '0.08';
  input.items[0]!.parts[0]!.params.height = '0.06';
  input.items[0]!.parts[0]!.ports[0]!.pos[1] = 0.06;
  const after = exportFixture();
  expect(after.grip?.at[1]).toBeCloseTo(0.08);
  datum.solid = 'missing';
  expect(exportFixture).toThrow('missing datum geometry');
});
it('exports datums and baked collision that follow the resized solid', () => {
  const input = fixture();
  const exportFixture = () =>
    exportItem(
      loadCatalogue({
        ...input,
        items: [{ ...input.items[0], anchors: { top: { part: 'upper', solid: 'body', fraction: [0.5, 1, 0.5] } } }],
      }).items[0]!,
      { id: 'fixture', file: 'assets/models/fixture.glb' },
      VOXEL,
      { collision: true },
    ).modelEntry;
  const topOf = (entry: ReturnType<typeof exportFixture>) => ({
    datum: entry.anchors?.top?.[1],
    box: entry.parts?.upper?.collision?.[0]?.max[1],
  });
  const before = topOf(exportFixture());
  expect(before.box).toBeCloseTo(before.datum!);
  input.items[0]!.parts[1]!.params.height = '0.08';
  const after = topOf(exportFixture());
  expect(after.datum).toBeGreaterThan(before.datum!);
  expect(after.box).toBeCloseTo(after.datum!);
});
it('refuses baked collision on an inventory atom, whose export carries no parts', () => {
  const input = fixture();
  input.items[0]!.exportMass = 'inventory-atom';
  const item = loadCatalogue(input).items[0]!;
  expect(() =>
    exportItem(item, { id: 'fixture', file: 'assets/models/fixture.glb' }, VOXEL, { collision: true }),
  ).toThrow('baked collision travels with exported parts');
});
it('omits runtime part masses only when inventory-atom export is authored', () => {
  const input = fixture();
  const asset = { id: 'fixture', file: 'assets/models/fixture.glb' } as const;
  const assembly = exportItem(loadCatalogue(input).items[0]!, asset, VOXEL);
  input.items[0]!.exportMass = 'inventory-atom';
  const atom = exportItem(loadCatalogue(input).items[0]!, asset, VOXEL);
  expect(assembly.modelEntry.parts).toBeDefined();
  expect(atom.modelEntry).not.toHaveProperty('parts');
  expect(atom.glb).toEqual(assembly.glb);
  expect(atom.physical).toEqual(assembly.physical);
});
it('refuses recipe mass ownership that differs from the authored item', () => {
  const item = catalogue.items[0]!;
  expect(() =>
    loadThingRecipe([
      {
        id: 'fixture',
        kind: 'item',
        source: item.id,
        voxel: ROW_VOXEL,
        options: { mass: item.exportMass === 'parts' ? 'inventory-atom' : 'parts' },
      },
    ]),
  ).toThrow('Recipe mass ownership differs');
});
it('refuses a recipe row without a voxel class, so no model exports smooth', () => {
  const item = catalogue.items[0]!;
  expect(() =>
    loadThingRecipe([{ id: 'fixture', kind: 'item', source: item.id, options: { mass: item.exportMass } }]),
  ).toThrow('Expected "voxel"');
});
it.each([0, -1])('refuses a voxel class grain of %s', (grain) => {
  const item = catalogue.items[0]!;
  expect(() =>
    loadThingRecipe([
      { id: 'fixture', kind: 'item', source: item.id, voxel: { grain }, options: { mass: item.exportMass } },
    ]),
  ).toThrow('Invalid');
});
it('refuses unknown geometry families during catalogue loading', () => {
  const input = fixture();
  input.items[0]!.parts[0]!.family = 'fixture-unknown';
  expect(() => loadCatalogue(input)).toThrow('Unknown thing family');
});
it('refuses recipe references outside the authored item set', () => {
  expect(() =>
    loadThingRecipe([
      { id: 'fixture', kind: 'item', source: 'fixture-unknown', voxel: ROW_VOXEL, options: { mass: 'parts' } },
    ]),
  ).toThrow('Unknown tool item');
});
