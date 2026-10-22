import { expect, it } from 'vitest';
import { compileJsonnetFile } from '../../../tools/jsonnet/index.mjs';
import { compileMapSite } from '../src/core/mapKit.ts';
import type { ContentFile, MapAssemblyDef, MapSiteDef } from '../src/core/schema.ts';
import { startupContent } from './baseRegistry.ts';
import { fixtureBreach } from './economyFixtures.ts';

const BUNDLED_CONTENT = startupContent();

const content = JSON.parse(
  compileJsonnetFile('packages/deadvox/src/content/base/gauntlet-lab-descents.libsonnet'),
) as ContentFile;
const [incoming, outgoing, shaft] = content.mapPieces!;
if (!(incoming && outgoing && shaft)) {
  throw new Error('Missing authored descent kit');
}
const BLOCKED_CLIMB = /\.routes\[1\].*continuous body-clear shaft/;
const assembly: MapAssemblyDef = {
  id: 'fixture_furnished_descent',
  size: [18, 16, 14],
  lootContext: incoming.lootContext,
  slots: [
    {
      id: 'lower',
      at: [0, 0, 0],
      size: incoming.size,
      turn: 0,
      choices: [{ ref: { kind: 'piece', id: incoming.id }, weight: 1 }],
    },
    {
      id: 'upper',
      at: [0, 8, 0],
      size: outgoing.size,
      turn: 0,
      choices: [{ ref: { kind: 'piece', id: outgoing.id }, weight: 1 }],
    },
    {
      id: 'connector',
      at: [7, 1, 6],
      size: shaft.size,
      turn: 0,
      choices: [{ ref: { kind: 'piece', id: shaft.id }, weight: 1 }],
    },
  ],
  joins: [],
  ports: [incoming, outgoing].flatMap((room, index) =>
    room.ports.map((port) => ({
      id: `${index}_${port.id}`,
      slot: index === 0 ? 'lower' : 'upper',
      port: port.id,
    })),
  ),
  anchors: {
    lower: { kind: 'standing', at: [7, 1, 7] },
    upper: { kind: 'standing', at: [7, 9, 7] },
    lowerRoom: incoming.anchors.circulation!,
    upperRoom: { kind: 'standing', at: [9, 9, 11] },
  },
};
const site: MapSiteDef = {
  id: 'fixture_furnished_descent',
  assembly: assembly.id,
  origin: [0, 0, 0],
  turn: 0,
  routes: [
    { from: 'lowerRoom', to: 'lower', traversal: 'walk', return: true },
    { from: 'lower', to: 'upper', traversal: 'climb', return: true },
    { from: 'upper', to: 'upperRoom', traversal: 'walk', return: true },
  ],
};
const registry = {
  ...BUNDLED_CONTENT.registry,
  mapPieces: new Map([
    ...BUNDLED_CONTENT.registry.mapPieces,
    ...content.mapPieces!.map((piece) => [piece.id, piece] as const),
  ]),
  mapAssemblies: new Map([[assembly.id, assembly]]),
};

it('authored descent owns its opening and certifies the furnished landing approaches and return', () => {
  const placement = compileMapSite(registry, site, { seed: 1, siteId: site.id });
  expect(placement.template.pieces.some((piece) => registry.furniture.get(piece.furniture)?.climbable)).toBe(true);
  expect(
    placement.template.pieces.some((piece) => {
      const furniture = registry.furniture.get(piece.furniture);
      return furniture !== undefined && furniture.solid !== false && !furniture.climbable;
    }),
  ).toBe(true);
});

it('rejects connector furniture substituted into the shaft-owned clearance', () => {
  const blocked = structuredClone(shaft);
  blocked.id = 'fixture_obstructed_shaft';
  blocked.layers[1]![0] = '.JB';
  blocked.ownership.layers[1]![0] = 'RSS';
  blocked.palette.B = { furniture: 'fixture_shaft_box' };
  const altered = structuredClone(assembly);
  altered.slots[2]!.choices![0]!.ref.id = blocked.id;
  const local = {
    ...registry,
    furniture: new Map([
      ...registry.furniture,
      [
        'fixture_shaft_box',
        {
          id: 'fixture_shaft_box',
          name: 'Fixture shaft box',
          size: [1, 1, 1] as [number, number, number],
          color: '#aaaaaa',
          breach: fixtureBreach(),
        },
      ],
    ]),
    mapPieces: new Map([...registry.mapPieces, [blocked.id, blocked]]),
    mapAssemblies: new Map([[assembly.id, altered]]),
  };
  expect(() => compileMapSite(local, site, { seed: 1, siteId: site.id })).toThrow(BLOCKED_CLIMB);
});
