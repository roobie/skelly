import { MATERIALS } from '@skelly/thing-core/materials';
import { expect, it } from 'vitest';
import { buildItem, loadCatalogue } from '../src/catalogue.ts';
import { exportItem, loadThingRecipe } from '../src/exports.ts';

const material = Object.keys(MATERIALS)[0]!;
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
  expect(exportFixture).toThrow('missing handling geometry');
});
it('refuses unknown geometry families during catalogue loading', () => {
  const input = fixture();
  input.items[0]!.parts[0]!.family = 'fixture-unknown';
  expect(() => loadCatalogue(input)).toThrow('Unknown thing family');
});
it('refuses recipe references outside the authored item set', () => {
  expect(() => loadThingRecipe([{ id: 'fixture', kind: 'item', source: 'fixture-unknown' }])).toThrow(
    'Unknown tool item',
  );
});
