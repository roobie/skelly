import { buildRegistry } from '@skelly/engine/content';
import { layoutBuildingSite, placementOf } from '@skelly/engine/internal/core/authoredPlacement.ts';
import type { SiteLayoutDef } from '@skelly/engine/internal/core/schema/files.ts';
import type { ContentFile } from '@skelly/engine/internal/core/schema.ts';
import { describe, expect, it } from 'vitest';
import { compileJsonnetFile } from '../../../tools/jsonnet/index.mjs';
import { parseVariants, sheetTarget, startPack } from './browser/buildingSheet.mjs';
import { type Variants, variantSeed } from './browser/buildingSheetVariants.ts';

const packs = [
  { id: 'fixture.kit', optIn: false, ids: { templates: ['cabin'], mapAssemblies: ['yard'], starts: [] } },
  { id: 'fixture.look', optIn: true, ids: { layouts: ['cabin'], starts: ['cabinlook'] } },
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

  it('reads each --variant as one choice per slot, refusing a malformed or repeated slot', () => {
    expect(parseVariants(['roof=felt', 'house/door=oak'])).toEqual({ roof: 'felt', 'house/door': 'oak' });
    expect(() => parseVariants(['roof'])).toThrow('<slot>=<choice>');
    expect(() => parseVariants(['roof=a=b'])).toThrow('<slot>=<choice>');
    expect(() => parseVariants(['roof=a', 'roof=b'])).toThrow('twice');
  });
});

describe('building sheet slot variants', () => {
  // The fixture kit's route assembly draws its front slot from two rooms.
  const kits = JSON.parse(compileJsonnetFile('packages/deadvox/test/fixtures/jsonnet/map-kits.jsonnet')) as ContentFile;
  const { registry, issues } = buildRegistry([{ source: 'fixture-kits.json', data: kits }]);
  const layout = {
    id: 'fixture_variants',
    lootContext: { usage: [], tier: 'Tier1' },
    buildings: [{ template: 'fixture_route', position: [0, 0, 0], rotation: 0 }],
  } as unknown as SiteLayoutDef;
  const search = (variants: Variants) => ({
    layout,
    indices: [0],
    variants,
    seeds: Array.from({ length: 64 }, (_, seed) => seed),
  });

  it('finds a seed whose own draw puts the chosen alternative in the slot', () => {
    expect(issues).toEqual([]);
    const seed = variantSeed(registry, search({ front: 'room_b' }));
    expect(seed).toBeDefined();
    const drawn = new Map<string, string>();
    placementOf(registry, layout.buildings[0]!, layout.lootContext, {
      ...layoutBuildingSite(seed!, layout.id, 0),
      onDraw: (path, { id }) => drawn.set(path, id),
    });
    expect(drawn.get('fixture_route/front')).toBe('room_b');
  });

  it('refuses an unknown slot or alternative, listing the accepted ones', () => {
    expect(() => variantSeed(registry, search({ roof: 'room_a' }))).toThrow('their slots are: front, rear');
    expect(() => variantSeed(registry, search({ front: 'room_c' }))).toThrow('it draws: room_a, room_b');
  });
});
