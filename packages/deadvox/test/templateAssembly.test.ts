import { expect, it } from 'vitest';
import { Chunk } from '../src/core/chunk.ts';
import type { MapPieceDef } from '../src/core/schema.ts';
import {
  type AssemblyContext,
  compileAssembly,
  compileMapPiece,
  placedBlockAt,
  stampPlacement,
  type TemplateAssembly,
  type TemplateSlot,
} from '../src/core/templates.ts';
import {
  buildFixtureRegistry as buildRegistry,
  FIXTURE_MATERIAL,
  fixtureBreach,
  fixtureLootContext,
  fixtureMaterials,
  fixtureSounds,
} from './economyFixtures.ts';

const piece = (id: string, row: string, mask: string): MapPieceDef => ({
  id,
  size: [row.length, 1, 1],
  lootContext: fixtureLootContext(),
  style: 'fixture_style',
  palette: {
    '#': { role: 'shell', material: 'shell' },
    p: { role: 'interior_floor', material: 'floor' },
    '.': { role: 'opening', material: 'air' },
    C: { furniture: 'fixture_clutter' },
  },
  layers: [[row]],
  ownership: { layers: [[mask]] },
  anchors: {},
  ports: [],
});
const registryOf = (...mapPieces: MapPieceDef[]) => {
  const result = buildRegistry([
    {
      source: 'fixture-kits.json',
      data: {
        furnitureMaterials: fixtureMaterials(),
        sounds: fixtureSounds(),
        blocks: [
          { id: 'fixture_shell', name: 'Shell', color: '#808080', solid: true },
          { id: 'fixture_floor', name: 'Floor', color: '#808080', solid: true },
        ],
        furniture: [
          {
            id: 'fixture_clutter',
            name: 'Clutter',
            size: [1, 1, 1],
            color: '#808080',
            massKg: 1,
            breach: fixtureBreach(),
            material: FIXTURE_MATERIAL,
          },
        ],
        mapStyles: [
          {
            id: 'fixture_style',
            bindings: {
              shell: { role: 'shell', block: 'fixture_shell' },
              floor: { role: 'interior_floor', block: 'fixture_floor' },
              air: { role: 'opening', block: 'air' },
            },
          },
        ],
        mapPieces,
      },
    },
  ]);
  if (result.issues.length > 0) {
    throw new Error(JSON.stringify(result.issues));
  }
  return result.registry;
};
const slot = (id: string, pieceId: string, at: TemplateSlot['at'], size: TemplateSlot['size']): TemplateSlot => ({
  id,
  at,
  size,
  turn: 0,
  choices: [{ ref: { kind: 'piece', id: pieceId }, weight: 1 }],
});
const assembly = (id: string, size: TemplateAssembly['size'], slots: TemplateSlot[]): TemplateAssembly => ({
  id,
  size,
  slots,
  lootContext: fixtureLootContext(),
  anchors: {},
  ports: [],
  joins: [],
});
const context = { seed: 17, siteId: 'fixture_site' };
const SHELL_COLLISION =
  /seed=17.*slot=fixture_building\/floor.*turn=0.*variant=slab.*source=fixture-kits.json.*0,0,0.*fixture_building\/facade.*fixture_building\/floor/;
const RESERVED_COLLISION = /reserved circulation collision.*fixture_hall\/walking.*fixture_hall\/furnishing/;
const DIFFERENT_RESERVATIONS = /same ownership domain and reserved voids/;
const OUTSIDE_SLOT = /outside assembly/;

it('rejects a floor slab invading shell ownership and names both owners, source and cell', () => {
  const registry = registryOf(piece('shell', '#.', 'S.'), piece('slab', 'pp', 'SS'));
  expect(() =>
    compileAssembly(
      registry,
      assembly(
        'fixture_building',
        [2, 1, 1],
        [slot('facade', 'shell', [0, 0, 0], [2, 1, 1]), slot('floor', 'slab', [0, 0, 0], [2, 1, 1])],
      ),
      context,
    ),
  ).toThrow(SHELL_COLLISION);
});

it('rejects clutter writing into a reserved walking cell', () => {
  const registry = registryOf(piece('route', '..', 'RR'), piece('clutter', 'C.', 'S.'));
  expect(() =>
    compileAssembly(
      registry,
      assembly(
        'fixture_hall',
        [2, 1, 1],
        [slot('walking', 'route', [0, 0, 0], [2, 1, 1]), slot('furnishing', 'clutter', [0, 0, 0], [2, 1, 1])],
      ),
      context,
    ),
  ).toThrow(RESERVED_COLLISION);
});

it('leaves unclaimed terrain untouched while owned air excavates', () => {
  const definition = piece('excavation', '.#.', '.SA');
  const registry = registryOf(definition);
  const placement = {
    template: compileMapPiece(registry, definition),
    origin: [0, 0, 0] as [number, number, number],
    turn: 0 as const,
  };
  const terrain = registry.blockIds.get('fixture_floor')!;
  const chunk = new Chunk(0, 0, 0, terrain);
  stampPlacement(chunk, placement);
  expect([chunk.get(0, 0, 0), chunk.get(1, 0, 0), chunk.get(2, 0, 0)]).toEqual([
    terrain,
    registry.blockIds.get('fixture_shell'),
    0,
  ]);
  expect(placedBlockAt(placement, [0, 0, 0])).toBeUndefined();
  expect(placedBlockAt(placement, [2, 0, 0])).toBe(0);
});

it('rotates an asymmetric piece and its provenance inside its delegated slot', () => {
  const registry = registryOf(piece('asymmetric', '#.', 'SR'));
  const compiled = compileAssembly(
    registry,
    assembly('fixture_rotation', [1, 1, 2], [{ ...slot('room', 'asymmetric', [0, 0, 0], [1, 1, 2]), turn: 1 }]),
    context,
  );
  expect([...compiled.blocks]).toEqual([registry.blockIds.get('fixture_shell'), 0]);
  expect([...compiled.reserved!]).toEqual([0, 1]);
  expect(compiled.provenance!.map((entry) => entry?.turn)).toEqual([1, 1]);
});

it('keys variants by stable slot path rather than slot visitation order', () => {
  const registry = registryOf(piece('room_a', '#.', 'SR'), piece('room_b', 'p.', 'SR'));
  const room: TemplateSlot = {
    ...slot('room', 'room_a', [0, 0, 0], [2, 1, 1]),
    choices: [
      { ref: { kind: 'piece', id: 'room_b' }, weight: 1 },
      { ref: { kind: 'piece', id: 'room_a' }, weight: 1 },
    ],
  };
  const definition = assembly('fixture_order', [4, 1, 1], [room, { ...room, id: 'annex', at: [2, 0, 0] }]);
  const variants = (reverse: boolean) => {
    const ordered = reverse
      ? {
          ...definition,
          slots: [...definition.slots].reverse().map((entry) => ({ ...entry, choices: [...entry.choices!].reverse() })),
        }
      : definition;
    const compiled = compileAssembly(registry, ordered, { ...context, seed: 1 });
    return [compiled.provenance![0]!.variant, compiled.provenance![2]!.variant];
  };
  expect(variants(false)).toEqual(['room_a', 'room_b']);
  expect(variants(true)).toEqual(['room_a', 'room_b']);
});

it('rejects alternatives that change reserved circulation', () => {
  const registry = registryOf(piece('room', '#.', 'SR'), piece('blocked_contract', '#.', 'SA'));
  const room = slot('room', 'room', [0, 0, 0], [2, 1, 1]);
  room.choices!.push({ ref: { kind: 'piece', id: 'blocked_contract' }, weight: 1 });
  expect(() => compileAssembly(registry, assembly('fixture_contract', [2, 1, 1], [room]), context)).toThrow(
    DIFFERENT_RESERVATIONS,
  );
});

it('shares leaf buffers within a compilation without sharing slot provenance or style bindings', () => {
  const definition = piece('repeated', '#.', 'SR');
  const registry = registryOf(definition);
  registry.mapStyles.set('alternate', {
    id: 'alternate',
    bindings: {
      ...registry.mapStyles.get('fixture_style')!.bindings,
      shell: { role: 'shell', block: 'fixture_floor' },
    },
  });
  const shared: AssemblyContext = { ...context, pieceCache: new Map() };
  const first = compileMapPiece(registry, definition, { ...shared, slotPath: 'first' });
  const second = compileMapPiece(registry, definition, { ...shared, slotPath: 'second' });
  expect(second.blocks).toBe(first.blocks);
  expect(first.provenance![0]!.owner).toBe('first');
  expect(second.provenance![0]!.owner).toBe('second');
  expect(second.provenance![0]).not.toBe(first.provenance![0]);
  const alternate = compileMapPiece(registry, definition, { ...shared, style: 'alternate' });
  expect(alternate.blocks[0]).toBe(registry.blockIds.get('fixture_floor'));
  expect(first.blocks[0]).toBe(registry.blockIds.get('fixture_shell'));
  expect(compileMapPiece(registry, definition, context).blocks).not.toBe(first.blocks);
});

it('rejects a child outside its delegated slot', () => {
  const registry = registryOf(piece('room', '#.', 'SR'));
  expect(() =>
    compileAssembly(
      registry,
      assembly('fixture_contract', [2, 1, 1], [slot('escaped', 'room', [1, 0, 0], [2, 1, 1])]),
      context,
    ),
  ).toThrow(OUTSIDE_SLOT);
});

it('rejects generated stair metadata on an owned assembly before compiling slots', () => {
  const registry = registryOf(piece('room', '#.', 'SA'));
  const definition = assembly('fixture_stairs', [2, 1, 1], [slot('room', 'room', [0, 0, 0], [2, 1, 1])]);
  definition.access = {
    ground: 'lower',
    entrance: [0, 1, 0],
    storeys: [
      { id: 'lower', floor: 1 },
      { id: 'upper', floor: 2 },
    ],
    stairs: [{ from: 'lower', to: 'upper', lower: [0, 1, 0], upper: [2, 2, 0], width: 2, block: 'fixture_floor' }],
  };
  expect(() => compileAssembly(registry, definition, context)).toThrow(
    'owned pieces must author stair geometry, not use a post-pass flight',
  );
});
