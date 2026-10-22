import { MATERIALS } from '@skelly/thing-core/materials';
import { expect, it } from 'vitest';
import { buildItem, catalogue, loadCatalogue } from '../src/catalogue.ts';
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
  expect(() => exportItem(item, { id: 'fixture', file: 'assets/models/fixture.glb' }, { collision: true })).toThrow(
    'baked collision travels with exported parts',
  );
});
it('omits runtime part masses only when inventory-atom export is authored', () => {
  const input = fixture();
  const asset = { id: 'fixture', file: 'assets/models/fixture.glb' } as const;
  const assembly = exportItem(loadCatalogue(input).items[0]!, asset);
  input.items[0]!.exportMass = 'inventory-atom';
  const atom = exportItem(loadCatalogue(input).items[0]!, asset);
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
        options: { mass: item.exportMass === 'parts' ? 'inventory-atom' : 'parts' },
      },
    ]),
  ).toThrow('Recipe mass ownership differs');
});
const primitiveExtras = (glb: Uint8Array): readonly Record<string, unknown>[] => {
  const length = new DataView(glb.buffer, glb.byteOffset).getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + length)));
  return json.meshes.flatMap((mesh: { primitives: { extras?: Record<string, unknown> }[] }) =>
    mesh.primitives.map(({ extras }) => extras ?? {}),
  );
};
it('passes a recipe row grain to the voxel meshes in the exported GLB, and only for that row', () => {
  const item = catalogue.items[0]!;
  const row = (options: object) => ({ id: 'fixture', kind: 'item', source: item.id, options });
  const grain = 0.05;
  const [voxel] = loadThingRecipe([row({ mass: item.exportMass, voxelGrain: grain })]);
  const [smooth] = loadThingRecipe([row({ mass: item.exportMass })]);
  expect(primitiveExtras(voxel!.generate().glb).every((extras) => extras.voxelGrain === grain)).toBe(true);
  expect(primitiveExtras(smooth!.generate().glb).some((extras) => 'voxelGrain' in extras)).toBe(false);
});
it.each([0, -1])('refuses a recipe row grain of %s', (voxelGrain) => {
  const item = catalogue.items[0]!;
  expect(() =>
    loadThingRecipe([{ id: 'fixture', kind: 'item', source: item.id, options: { mass: item.exportMass, voxelGrain } }]),
  ).toThrow('Invalid');
});
it('refuses unknown geometry families during catalogue loading', () => {
  const input = fixture();
  input.items[0]!.parts[0]!.family = 'fixture-unknown';
  expect(() => loadCatalogue(input)).toThrow('Unknown thing family');
});
it('refuses recipe references outside the authored item set', () => {
  expect(() =>
    loadThingRecipe([{ id: 'fixture', kind: 'item', source: 'fixture-unknown', options: { mass: 'parts' } }]),
  ).toThrow('Unknown tool item');
});
it('exports the player bust with joint anchors that seat the limbs symmetrically about the centre line', () => {
  const item = catalogue.items.find((candidate) => candidate.id === 'player_bust')!;
  const anchors = exportItem(item, { id: 'player_bust', file: 'assets/models/player_bust.glb' }).modelEntry.anchors!;
  for (const joint of ['neck', 'head', 'shoulder_left', 'shoulder_right', 'hip_left', 'hip_right']) {
    expect(anchors[joint], joint).toBeDefined();
  }
  expect(anchors.shoulder_left![1]).toBeCloseTo(anchors.shoulder_right![1]);
  expect(anchors.shoulder_left![0]).toBeCloseTo(-anchors.shoulder_right![0]);
  expect(anchors.hip_left![0]).toBeCloseTo(-anchors.hip_right![0]);
});
