import { buildRegistry } from '@skelly/engine/content';
import { layoutBuildingSite, placementOf } from '@skelly/engine/internal/core/authoredPlacement.ts';
import type { MapAssemblyDef, SiteLayoutDef } from '@skelly/engine/internal/core/schema/files.ts';
import type { ContentFile } from '@skelly/engine/internal/core/schema.ts';
import { describe, expect, it } from 'vitest';
import { compileJsonnetFile } from '../../../tools/jsonnet/index.mjs';
import { checkSheetRequest, parseVariants, sheetTarget, startPack } from './browser/buildingSheet.mjs';
import { type Variants, variantSeed } from './browser/buildingSheetVariants.ts';

const packs = [
  { id: 'fixture.kit', optIn: false, ids: { templates: ['cabin'], mapAssemblies: ['yard'], starts: [] } },
  { id: 'fixture.look', optIn: true, ids: { layouts: ['cabin'], starts: ['cabinlook'] } },
  { id: 'fixture.styles', optIn: false, ids: { mapStyles: ['brick'] } },
];

describe('building sheet arguments', () => {
  it('names the kind an id has and the pack that authors it', () => {
    expect(sheetTarget(packs, 'yard')).toEqual({ kind: 'assembly', pack: packs[0] });
  });

  it('refuses an id no pack authors, and one that names two things', () => {
    expect(() => sheetTarget(packs, 'barn')).toThrow('No pack authors');
    expect(() => sheetTarget(packs, 'cabin')).toThrow('a template in fixture.kit and a layout in fixture.look');
  });

  it('finds the pack of a start id, and answers a pack id with the start it supplies', () => {
    expect(startPack(packs, 'cabinlook')).toBe('fixture.look');
    expect(() => startPack(packs, 'fixture.look')).toThrow('supplies start cabinlook. The starts are: cabinlook');
  });

  it('styles only a lone assembly, from the pack that authors the style', () => {
    expect(checkSheetRequest({ id: 'yard', style: 'brick' }, packs).style).toEqual({ id: 'brick', pack: packs[2] });
    expect(() => checkSheetRequest({ id: 'yard', style: 'slate' }, packs)).toThrow('the styles are: brick');
    expect(() => checkSheetRequest({ id: 'yard', start: 'cabinlook', style: 'brick' }, packs)).toThrow('drop --start');
  });

  it('reads each --variant as one choice per slot, refusing a malformed or repeated slot', () => {
    expect(parseVariants(['roof=felt', 'house/door=oak'])).toEqual({ roof: 'felt', 'house/door': 'oak' });
    expect(() => parseVariants(['roof'])).toThrow('<slot>=<choice>');
    expect(() => parseVariants(['roof=a=b'])).toThrow('<slot>=<choice>');
    expect(() => parseVariants(['roof=a', 'roof=b'])).toThrow('twice');
  });
});

/**
 * The fixture kit with a street whose house slot draws one of two routes: one draws its front room from a pool of
 * both rooms, the other always the first room. Only the second room's floor block shows which room the house drew.
 */
const streetKit = (): ContentFile => {
  const kits = JSON.parse(compileJsonnetFile('packages/deadvox/test/fixtures/jsonnet/map-kits.jsonnet')) as ContentFile;
  const assemblies = kits.mapAssemblies ?? [];
  const route = assemblies.find(({ id }) => id === 'fixture_route')!;
  const withFront = (id: string, front: Partial<MapAssemblyDef['slots'][number]>): MapAssemblyDef => ({
    ...route,
    id,
    slots: route.slots.map((slot) => {
      if (slot.id !== 'front') {
        return slot;
      }
      const { choices: _drawn, ...placed } = slot;
      return { ...placed, ...front };
    }) as MapAssemblyDef['slots'],
  });
  const room = (id: string) => ({ ref: { kind: 'piece', id }, weight: 1 }) as const;
  const routes = [
    withFront('fixture_route_pooled', { pool: 'fixture_rooms' }),
    withFront('fixture_route_plain', { choices: [room('room_a')] }),
  ];
  const street = {
    id: 'fixture_street',
    size: route.size,
    lootContext: route.lootContext,
    slots: [
      {
        id: 'house',
        at: [0, 0, 0],
        size: route.size,
        turn: 0,
        choices: routes.map(({ id }) => ({ ref: { kind: 'assembly', id }, weight: 1 })),
      },
    ],
    joins: [],
    anchors: {},
    ports: route.ports.map(({ id }) => ({ id, slot: 'house', port: id })),
  } as unknown as MapAssemblyDef;
  return {
    ...kits,
    mapPools: [{ id: 'fixture_rooms', choices: [room('room_a'), room('room_b')] }],
    mapAssemblies: [...assemblies, ...routes, street],
  };
};

describe('building sheet slot variants', () => {
  const { registry, issues } = buildRegistry([{ source: 'fixture-kits.json', data: streetKit() }]);
  const layoutOf = (template: string) =>
    ({
      id: 'fixture_variants',
      lootContext: { usage: [], tier: 'Tier1' },
      buildings: [{ template, position: [0, 0, 0], rotation: 0 }],
    }) as unknown as SiteLayoutDef;
  const seeds = Array.from({ length: 64 }, (_, seed) => seed);
  const search = (template: string, variants: Variants) => ({
    layout: layoutOf(template),
    indices: [0],
    variants,
    seeds,
  });
  /** Whether the building at `seed` drew the second room, read from its blocks rather than from the draws reported. */
  const drewSecondRoom = (template: string, seed: number, onDraw?: (path: string, id: string) => void) => {
    const layout = layoutOf(template);
    const { template: placed } = placementOf(registry, layout.buildings[0]!, layout.lootContext, {
      ...layoutBuildingSite(seed, layout.id, 0),
      ...(onDraw ? { onDraw: (path: string, { id }: { id: string }) => onDraw(path, id) } : {}),
    });
    return placed.blocks.includes(registry.blockIds.get('fixture_other_floor')!);
  };

  it('reports a nested slot only from the alternative its parent slot drew', () => {
    expect(issues).toEqual([]);
    for (const seed of seeds) {
      const drawn = new Map<string, string>();
      const second = drewSecondRoom('fixture_street', seed, (path, id) => drawn.set(path, id));
      expect(drawn.get('fixture_street/house/front') === 'room_b').toBe(second);
    }
  });

  it('finds a seed whose own draw puts the chosen alternative in a nested pool slot', () => {
    const seed = variantSeed(registry, search('fixture_street', { 'house/front': 'room_b' }));
    expect(seed).toBeDefined();
    expect(drewSecondRoom('fixture_street', seed!)).toBe(true);
  });

  it('refuses an unknown slot or alternative, listing the accepted ones', () => {
    const route = (variants: Variants) => variantSeed(registry, search('fixture_route', variants));
    expect(() => route({ roof: 'room_a' })).toThrow('their slots are: front, rear');
    expect(() => route({ front: 'room_c' })).toThrow('it draws: room_a, room_b');
  });
});
