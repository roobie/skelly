import { expect, it } from 'vitest';
import { compileJsonnetFile } from '../../../tools/jsonnet/index.mjs';
import { buildRegistry } from '../src/core/content.ts';
import { compileMapSite } from '../src/core/mapKit.ts';
import type { ContentFile } from '../src/core/schema.ts';
import { compileAssembly } from '../src/core/templates.ts';

const FIXTURE = JSON.parse(
  compileJsonnetFile('packages/deadvox/test/fixtures/jsonnet/map-kits.jsonnet'),
) as ContentFile;
const CLIMB_FIXTURE = JSON.parse(
  compileJsonnetFile('packages/deadvox/test/fixtures/jsonnet/climb-kits.jsonnet'),
) as ContentFile;
const fixture = (): ContentFile => structuredClone(FIXTURE);
const climbFixture = (): ContentFile => structuredClone(CLIMB_FIXTURE);
const build = (data: ContentFile) => buildRegistry([{ source: 'fixture-kits.json', data }]);
const registryOf = (data: ContentFile) => {
  const result = build(data);
  if (result.issues.length > 0) {
    throw new Error(JSON.stringify(result.issues));
  }
  return result.registry;
};
const CYCLE = /nesting cycle/;
const NO_ROUTE = /supported body paths/;
const INCOMPATIBLE_PORT = /incompatible ports/;

it('admits authored Jsonnet sections and a supported walking-and-return route', () => {
  const data = fixture();
  const registry = registryOf(data);
  const placement = compileMapSite(registry, data.mapSites![0]!, { seed: 1, siteId: 'fixture_site' });
  expect(placement.template.ports!.map((port) => port.id)).toEqual(['west', 'east']);
  expect(
    placement.template
      .provenance!.filter(Boolean)
      .every((owner) => owner!.source.startsWith('fixture-kits.json:mapPieces[')),
  ).toBe(true);
  expect(placement.template.provenance!.some((owner) => owner?.slotPath.includes('seam_threshold'))).toBe(true);
});

it('retains nested slot paths and turns exported ports without losing leaf provenance', () => {
  const data = fixture();
  data.mapAssemblies!.push({
    id: 'outer',
    lootContext: data.mapAssemblies![0]!.lootContext,
    size: [4, 5, 10],
    joins: [],
    anchors: {},
    ports: [
      { id: 'north', slot: 'nested', port: 'west' },
      { id: 'south', slot: 'nested', port: 'east' },
    ],
    slots: [
      {
        id: 'nested',
        at: [0, 0, 0],
        size: [4, 5, 10],
        turn: 1,
        choices: [{ ref: { kind: 'assembly', id: 'fixture_route' }, weight: 1 }],
      },
    ],
  });
  const registry = registryOf(data);
  const template = compileAssembly(registry, data.mapAssemblies!.at(-1)!, { seed: 1, siteId: 'fixture_site' });
  expect(template.ports!.map((port) => port.facing)).toEqual(['n', 's']);
  expect(template.provenance!.some((owner) => owner?.slotPath === 'outer/nested/front')).toBe(true);
  expect(template.provenance!.filter(Boolean).every((owner) => owner!.turn === 1)).toBe(true);
});

it('rejects nesting cycles before a site plan can be published', () => {
  const data = fixture();
  data.mapAssemblies![0]!.slots[0]!.choices = [{ ref: { kind: 'assembly', id: 'fixture_route' }, weight: 1 }];
  const result = build(data);
  expect(result.issues.some((issue) => CYCLE.test(issue.message) && issue.source === 'fixture-kits.json')).toBe(true);
  expect(result.registry.mapSites.size).toBe(0);
});

it('rejects a seam that cannot mate its declared endpoints', () => {
  const data = fixture();
  data.mapAssemblies![0]!.joins[0]!.seam.at = [3, 0, 0];
  expect(build(data).issues.some((issue) => INCOMPATIBLE_PORT.test(issue.message))).toBe(true);
});

it('rejects individually admissible alternatives with different solid-support contracts', () => {
  const data = fixture();
  const alternative = data.mapPieces![1]!;
  alternative.layers[0]![0] = '.===';
  alternative.ownership.layers[0]![0] = 'ASSS';
  const result = build(data);
  expect(result.issues.some((issue) => issue.path.startsWith('mapPieces['))).toBe(false);
  expect(
    result.issues.some(
      (issue) => issue.path.startsWith('mapAssemblies[0]') && issue.message.includes('equal solid support and ports'),
    ),
  ).toBe(true);
});

it('rejects individually admissible alternatives with different public port contracts', () => {
  const data = fixture();
  data.mapPieces![1]!.ports[0]!.type = 'different_corridor';
  const result = build(data);
  expect(result.issues.some((issue) => issue.path.startsWith('mapPieces['))).toBe(false);
  expect(
    result.issues.some(
      (issue) => issue.path.startsWith('mapAssemblies[0]') && issue.message.includes('equal solid support and ports'),
    ),
  ).toBe(true);
});

it('rejects individually admissible alternatives with moved anchors', () => {
  const data = fixture();
  const first = data.mapPieces![0]!;
  first.anchors.marker = { kind: 'point', at: [1, 1, 1] };
  const alternative = structuredClone(first);
  alternative.id = 'room_b';
  alternative.anchors.marker!.at = [2, 1, 1];
  data.mapPieces![1] = alternative;
  const result = build(data);
  expect(result.issues.some((issue) => issue.path.startsWith('mapPieces['))).toBe(false);
  expect(
    result.issues.some((issue) => issue.path.startsWith('mapAssemblies[0]') && issue.message.includes('anchors')),
  ).toBe(true);
});

it('rejects individually admissible alternatives changing furniture support under reserved circulation', () => {
  const data = fixture();
  data.furniture = [
    { id: 'passable', name: 'Passable fixture', size: [1, 1, 1], color: '#808080', solid: false },
    { id: 'blocking', name: 'Blocking fixture', size: [1, 1, 1], color: '#808080', solid: true },
  ];
  const first = data.mapPieces![0]!;
  first.layers[0]![0] = 'F===';
  first.palette.F = { furniture: 'passable' };
  const alternative = structuredClone(first);
  alternative.id = 'room_b';
  alternative.palette.F = { furniture: 'blocking' };
  data.mapPieces![1] = alternative;
  const result = build(data);
  expect(result.issues.some((issue) => issue.path.startsWith('mapPieces['))).toBe(false);
  expect(
    result.issues.some(
      (issue) => issue.path.startsWith('mapAssemblies[0]') && issue.message.includes('reserved-body furniture'),
    ),
  ).toBe(true);
});

it('rejects assigning an interior-floor binding to shell cells', () => {
  const data = fixture();
  data.mapStyles![0]!.bindings.floor!.role = 'interior_floor';
  data.mapPieces![0]!.palette['='] = { role: 'shell', material: 'floor' };
  expect(build(data).issues.some((issue) => issue.message.includes('shell cannot take material floor'))).toBe(true);
});

it.each([0, 1, 2, 3] as const)('certifies a placed climb and return after quarter turn %s', (turn) => {
  const data = climbFixture();
  data.mapSites![0]!.turn = turn;
  const registry = registryOf(data);
  const placement = compileMapSite(registry, data.mapSites![0]!, { seed: 1, siteId: 'fixture_climb_site' });
  expect(placement.turn).toBe(turn);
  expect(placement.template.pieces.some((piece) => registry.furniture.get(piece.furniture)?.climbable)).toBe(true);
});

it('rejects a climb with a discontinuous ladder column', () => {
  const data = climbFixture();
  data.mapPieces![0]!.layers[3] = [
    '........',
    '........',
    '........',
    '........',
    '........',
    '........',
    '........',
    '........',
  ];
  data.mapPieces![0]!.ownership.layers[3] = [
    'RRRRRRRR',
    'RRRRRRRR',
    'RRRRRRRR',
    'RRRRRRRR',
    'RRRRRRRR',
    'RRRRRRRR',
    'RRRRRRRR',
    'RRRRRRRR',
  ];
  expect(
    build(data).issues.some(
      (issue) => issue.path.startsWith('mapSites[0]') && issue.message.includes('continuous body-clear shaft'),
    ),
  ).toBe(true);
});

it('rejects a climb whose upper anchor is supported but has no braced return landing', () => {
  const data = climbFixture();
  for (const row of [2, 3, 4, 5]) {
    data.mapPieces![0]!.layers[6]![row] = '===....=';
    data.mapPieces![0]!.ownership.layers[6]![row] = 'SSSRRRRS';
  }
  const result = build(data);
  expect(
    result.issues.some((issue) => issue.path.startsWith('mapPieces[') || issue.path.startsWith('mapAssemblies[')),
  ).toBe(false);
  expect(
    result.issues.some(
      (issue) => issue.path.startsWith('mapSites[0]') && issue.message.includes('supported braced landings'),
    ),
  ).toBe(true);
});

it('rejects individually admissible alternatives with different climb geometry', () => {
  const data = climbFixture();
  const alternative = structuredClone(data.mapPieces![0]!);
  alternative.id = 'fixture_nonclimbing_descent';
  alternative.palette.L = { furniture: 'fixture_nonclimber', facing: 'w' };
  data.furniture!.push({
    id: 'fixture_nonclimber',
    name: 'Nonclimber',
    size: [2, 1, 1],
    color: '#808080',
    solid: false,
  });
  data.mapPieces!.push(alternative);
  data.mapAssemblies![0]!.slots[0]!.choices!.push({ ref: { kind: 'piece', id: alternative.id }, weight: 1 });
  const result = build(data);
  expect(result.issues.some((issue) => issue.path.startsWith('mapPieces['))).toBe(false);
  expect(
    result.issues.some(
      (issue) => issue.path.startsWith('mapAssemblies[0]') && issue.message.includes('ladder geometry'),
    ),
  ).toBe(true);
});

it('rejects a climbing graph edge with no distinct physical landings', () => {
  const data = fixture();
  data.mapSites![0]!.routes[0]!.traversal = 'climb';
  const result = build(data);
  expect(
    result.issues.some(
      (issue) => issue.path.startsWith('mapSites[0]') && issue.message.includes('distinct ordered landing heights'),
    ),
  ).toBe(true);
  expect(result.registry.mapSites.size).toBe(0);
});

it('rejects a graph connection without a supported walking-and-return route', () => {
  const data = fixture();
  for (const room of data.mapPieces!.slice(0, 2)) {
    room.layers[0] = ['=..=', '=..=', '=..=', '=..='];
    room.ownership.layers[0] = ['SAAS', 'SAAS', 'SAAS', 'SAAS'];
  }
  const result = build(data);
  expect(result.issues.some((issue) => NO_ROUTE.test(issue.message))).toBe(true);
});
