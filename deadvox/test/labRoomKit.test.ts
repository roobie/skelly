import { expect, it } from 'vitest';
import { compileJsonnetFile } from '../../tools/jsonnet/index.mjs';
import { compileMapSite } from '../src/core/mapKit.ts';
import type { ContentFile, MapSiteDef } from '../src/core/schema.ts';
import {
  compileAssembly,
  compileMapPiece,
  footprint,
  placedPoint,
  type TemplateAssembly,
} from '../src/core/templates.ts';
import { startupContent } from './baseRegistry.ts';

const BUNDLED_CONTENT = startupContent();

it('lab room substitutions preserve furnished threshold-to-circulation and return routes at every quarter turn', () => {
  const data = JSON.parse(compileJsonnetFile('deadvox/src/content/base/gauntlet-lab-rooms.libsonnet')) as ContentFile;
  const rooms = data.mapPieces!;
  const registry = {
    ...BUNDLED_CONTENT.registry,
    mapPieces: new Map([...BUNDLED_CONTENT.registry.mapPieces, ...rooms.map((room) => [room.id, room] as const)]),
  };
  expect(rooms.length).toBeGreaterThan(1);
  for (const room of rooms) {
    const template = compileMapPiece(registry, room);
    expect(template.ports!.length).toBeGreaterThan(0);
    expect(template.pieces.length).toBeGreaterThan(0);
    const standing = Object.entries(template.anchors!).filter(([, anchor]) => anchor.kind === 'standing');
    expect(standing.length).toBeGreaterThan(0);
    for (const turn of [0, 1, 2, 3] as const) {
      const placement = { template, origin: [0, 0, 0] as [number, number, number], turn };
      const [width, depth] = footprint(placement);
      const assembly: TemplateAssembly = {
        id: 'fixture_rotated_lab_room',
        size: [width, template.size[1], depth],
        lootContext: room.lootContext,
        slots: [
          {
            id: 'room',
            at: [0, 0, 0],
            size: [width, template.size[1], depth],
            turn,
            choices: [{ ref: { kind: 'piece', id: room.id }, weight: 1 }],
          },
        ],
        joins: [],
        ports: template.ports!.map((port) => ({ id: port.id, slot: 'room', port: port.id })),
        anchors: Object.fromEntries([
          ...Object.entries(template.anchors!).map(([id, anchor]) => [
            `anchor_${id}`,
            { ...anchor, at: placedPoint(placement, anchor.at) },
          ]),
          ...template.ports!.map((port) => [
            `port_${port.id}`,
            { kind: 'standing' as const, at: placedPoint(placement, port.standing) },
          ]),
        ]),
      };
      const site: MapSiteDef = {
        id: 'fixture_room_site',
        assembly: assembly.id,
        origin: [0, 0, 0],
        turn: 0,
        routes: template.ports!.flatMap((port) =>
          standing.map(([id]) => ({
            from: `port_${port.id}`,
            to: `anchor_${id}`,
            traversal: 'walk' as const,
            return: true,
          })),
        ),
      };
      const local = { ...registry, mapAssemblies: new Map([...registry.mapAssemblies, [assembly.id, assembly]]) };
      expect(() => compileMapSite(local, site, { seed: 1, siteId: site.id })).not.toThrow();
    }
  }
  const alternatives: TemplateAssembly = {
    id: 'fixture_lab_substitution',
    size: rooms[0]!.size,
    lootContext: rooms[0]!.lootContext,
    slots: [
      {
        id: 'room',
        at: [0, 0, 0],
        size: rooms[0]!.size,
        turn: 0,
        choices: rooms.map((room) => ({ ref: { kind: 'piece', id: room.id }, weight: 1 })),
      },
    ],
    joins: [],
    anchors: {},
    ports: rooms[0]!.ports.map((port) => ({ id: port.id, slot: 'room', port: port.id })),
  };
  expect(() => compileAssembly(registry, alternatives, { seed: 1, siteId: 'fixture_substitution_site' })).not.toThrow();
});
