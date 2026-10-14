import { expect, it } from 'vitest';
import { compileJsonnetFile } from '../../tools/jsonnet/index.mjs';
import { buildRegistry } from '../src/core/content.ts';
import { compileMapSite } from '../src/core/mapKit.ts';
import type { ContentFile } from '../src/core/schema.ts';
import { compileAssembly } from '../src/core/templates.ts';

const FIXTURE = JSON.parse(compileJsonnetFile('deadvox/test/fixtures/jsonnet/map-kits.jsonnet')) as ContentFile;
const fixture = (): ContentFile => structuredClone(FIXTURE);
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

it('rejects an unselected alternative that removes supported body clearance', () => {
  const data = fixture();
  const alternative = data.mapPieces![1]!;
  alternative.layers[0] = ['....', '....', '....', '....'];
  alternative.ownership.layers[0] = ['AAAA', 'AAAA', 'AAAA', 'AAAA'];
  const result = build(data);
  expect(
    result.issues.some((issue) => issue.path.startsWith('mapPieces[1]') && issue.message.includes('supported landing')),
  ).toBe(true);
  expect(result.registry.mapSites.size).toBe(0);
});

it('rejects assigning an interior-floor binding to shell cells', () => {
  const data = fixture();
  data.mapStyles![0]!.bindings.floor!.role = 'interior_floor';
  data.mapPieces![0]!.palette['='] = { role: 'shell', material: 'floor' };
  expect(build(data).issues.some((issue) => issue.message.includes('shell cannot take material floor'))).toBe(true);
});

it('refuses climbing recipes without a final placed certificate', () => {
  const data = fixture();
  data.mapSites![0]!.routes[0]!.traversal = 'climb';
  const result = build(data);
  expect(
    result.issues.some(
      (issue) => issue.path.startsWith('mapSites[0]') && issue.message.includes('final placed scenario certificate'),
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
