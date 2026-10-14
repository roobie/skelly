import { expect, it } from 'vitest';
import { Chunk } from '../src/core/chunk.ts';
import { buildRegistry, type TemplateDef } from '../src/core/content.ts';
import { CHUNK } from '../src/core/coords.ts';
import {
  compileAssembly,
  compileTemplate,
  placedBlockAt,
  stampPlacement,
  type TemplateAssembly,
  type TemplateSlot,
} from '../src/core/templates.ts';
import { fixtureLootContext } from './economyFixtures.ts';

const piece = (id: string, row: string, mask: string): TemplateDef => ({
  id,
  size: [row.length, 1, 1],
  lootContext: fixtureLootContext(),
  palette: { '#': 'fixture_shell', p: 'fixture_floor', '.': 'air', C: { furniture: 'fixture_clutter' } },
  layers: [[row]],
  ownership: { layers: [[mask]] },
});
const registryOf = (...templates: TemplateDef[]) => {
  const result = buildRegistry([
    {
      source: 'fixture-kits.json',
      data: {
        blocks: [
          { id: 'fixture_shell', name: 'Shell', color: '#808080', solid: true },
          { id: 'fixture_floor', name: 'Floor', color: '#808080', solid: true },
        ],
        furniture: [{ id: 'fixture_clutter', name: 'Clutter', size: [1, 1, 1], color: '#808080' }],
        templates,
      },
    },
  ]);
  if (result.issues.length > 0) {
    throw new Error(JSON.stringify(result.issues));
  }
  return result.registry;
};
const slot = (id: string, template: string, at: TemplateSlot['at'], size: TemplateSlot['size']): TemplateSlot => ({
  id,
  at,
  size,
  turn: 0,
  choices: [{ template, weight: 1 }],
});
const context = { seed: 17, siteId: 'fixture_site' };
const SHELL_COLLISION =
  /seed=17.*slot=fixture_building\/floor.*turn=0.*variant=slab.*source=slab.*0,0,0.*fixture_building\/facade.*fixture_building\/floor/;
const RESERVED_COLLISION = /reserved circulation collision.*fixture_hall\/walking.*fixture_hall\/furnishing/;
const DIFFERENT_RESERVATIONS = /same ownership domain and reserved voids/;
const OUTSIDE_SLOT = /outside assembly/;

it('rejects a floor slab invading shell ownership and names both owners and the cell', () => {
  const registry = registryOf(piece('shell', '#.', 'S.'), piece('slab', 'pp', 'SS'));
  const assembly: TemplateAssembly = {
    id: 'fixture_building',
    lootContext: fixtureLootContext(),
    size: [2, 1, 1],
    slots: [slot('facade', 'shell', [0, 0, 0], [2, 1, 1]), slot('floor', 'slab', [0, 0, 0], [2, 1, 1])],
  };
  expect(() => compileAssembly(registry, assembly, context)).toThrow(SHELL_COLLISION);
});

it('rejects clutter writing into a reserved walking cell', () => {
  const registry = registryOf(piece('route', '..', 'RR'), piece('clutter', 'C.', 'S.'));
  expect(() =>
    compileAssembly(
      registry,
      {
        id: 'fixture_hall',
        lootContext: fixtureLootContext(),
        size: [2, 1, 1],
        slots: [slot('walking', 'route', [0, 0, 0], [2, 1, 1]), slot('furnishing', 'clutter', [0, 0, 0], [2, 1, 1])],
      },
      context,
    ),
  ).toThrow(RESERVED_COLLISION);
});

it('leaves unclaimed terrain untouched while owned air excavates', () => {
  const definition = piece('excavation', '.#.', '.SA');
  const registry = registryOf(definition);
  const placement = {
    template: compileTemplate(registry, definition),
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
    {
      id: 'fixture_rotation',
      lootContext: fixtureLootContext(),
      size: [1, 1, 2],
      slots: [{ ...slot('room', 'asymmetric', [0, 0, 0], [1, 1, 2]), turn: 1 }],
    },
    context,
  );
  expect([...compiled.blocks]).toEqual([registry.blockIds.get('fixture_shell'), 0]);
  expect([...compiled.reserved!]).toEqual([0, 1]);
  expect(compiled.provenance!.map((entry) => entry?.turn)).toEqual([1, 1]);
});

it('resolves the same weighted site under reversed slot, candidate and chunk orders', () => {
  const registry = registryOf(piece('room_a', '#.', 'SR'), piece('room_b', 'p.', 'SR'));
  const room = {
    ...slot('room', 'room_a', [0, 0, 0], [2, 1, 1]),
    choices: [
      { template: 'room_b', weight: 3 },
      { template: 'room_a', weight: 1 },
    ],
  };
  const assembly: TemplateAssembly = {
    id: 'fixture_order',
    lootContext: fixtureLootContext(),
    size: [4, 1, 1],
    slots: [room, { ...room, id: 'annex', at: [2, 0, 0] }],
  };
  const stamp = (reverse: boolean) => {
    const definition = reverse
      ? {
          ...assembly,
          slots: [...assembly.slots].reverse().map((entry) => ({ ...entry, choices: [...entry.choices].reverse() })),
        }
      : assembly;
    const compiled = compileAssembly(registry, definition, context);
    const placement = { template: compiled, origin: [CHUNK - 1, 0, 0] as [number, number, number], turn: 0 as const };
    const chunks = [
      new Chunk(0, 0, 0, registry.blockIds.get('fixture_floor')),
      new Chunk(1, 0, 0, registry.blockIds.get('fixture_floor')),
    ];
    for (const chunk of reverse ? [...chunks].reverse() : chunks) {
      stampPlacement(chunk, placement);
    }
    return {
      blocks: [
        chunks[0]!.get(CHUNK - 1, 0, 0),
        chunks[1]!.get(0, 0, 0),
        chunks[1]!.get(1, 0, 0),
        chunks[1]!.get(2, 0, 0),
      ],
      provenance: compiled.provenance,
    };
  };
  const first = stamp(false);
  expect(first.blocks[0]).not.toBe(0);
  expect(first.blocks[1]).toBe(0);
  expect(first.blocks[2]).not.toBe(0);
  expect(first.blocks[3]).toBe(0);
  expect(stamp(true)).toEqual(first);
});

it('rejects alternatives that change reserved circulation', () => {
  const registry = registryOf(piece('room', '#.', 'SR'), piece('blocked_contract', '#.', 'SA'));
  expect(() =>
    compileAssembly(
      registry,
      {
        id: 'fixture_contract',
        lootContext: fixtureLootContext(),
        size: [2, 1, 1],
        slots: [
          {
            ...slot('room', 'room', [0, 0, 0], [2, 1, 1]),
            choices: [
              { template: 'room', weight: 1 },
              { template: 'blocked_contract', weight: 1 },
            ],
          },
        ],
      },
      context,
    ),
  ).toThrow(DIFFERENT_RESERVATIONS);
});

it('rejects a child outside its delegated slot', () => {
  const registry = registryOf(piece('room', '#.', 'SR'));
  expect(() =>
    compileAssembly(
      registry,
      {
        id: 'fixture_contract',
        lootContext: fixtureLootContext(),
        size: [2, 1, 1],
        slots: [slot('escaped', 'room', [1, 0, 0], [2, 1, 1])],
      },
      context,
    ),
  ).toThrow(OUTSIDE_SLOT);
});
