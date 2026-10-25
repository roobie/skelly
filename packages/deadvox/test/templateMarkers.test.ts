import { expect, it } from 'vitest';
import { buildRegistry, type TemplateDef } from '../src/core/content.ts';
import { compileTemplate, findPieces } from '../src/core/templates.ts';
import {
  FIXTURE_MATERIAL,
  fixtureBreach,
  fixtureLootContext,
  fixtureMaterials,
  fixtureSounds,
} from './economyFixtures.ts';

it.each(['P', '🧪'])('indexes furniture and blocks by code point for marker %s', (marker) => {
  const template: TemplateDef = {
    id: 'fixture_markers',
    lootContext: fixtureLootContext(),
    size: [4, 1, 1],
    palette: { '=': 'fixture_solid', [marker]: { furniture: 'fixture_piece' } },
    layers: [[`=${marker}=${marker}`]],
  };
  const result = buildRegistry([
    {
      source: 'markers.json',
      data: {
        furnitureMaterials: fixtureMaterials(),
        sounds: fixtureSounds(),
        blocks: [{ id: 'fixture_solid', name: 'Fixture solid', solid: true, color: '#808080' }],
        furniture: [
          {
            id: 'fixture_piece',
            name: 'Fixture piece',
            size: [1, 1, 1],
            color: '#808080',
            massKg: 1,
            breach: fixtureBreach(),
            material: FIXTURE_MATERIAL,
          },
        ],
        templates: [template],
      },
    },
  ]);
  expect(result.issues).toEqual([]);
  const compiled = compileTemplate(result.registry, template);
  const anchors = [
    [1, 0, 0],
    [3, 0, 0],
  ];
  expect(findPieces(template, marker, [1, 1, 1]).anchors).toEqual(anchors);
  expect(compiled.pieces.map((piece) => piece.pos)).toEqual(anchors);
  const solid = result.registry.blockIds.get('fixture_solid');
  expect([...compiled.blocks]).toEqual([solid, 0, solid, 0]);
});

it('rejects a furniture loot table', () => {
  const source = 'furniture-loot.json';
  const { issues } = buildRegistry([
    {
      source,
      data: {
        furniture: [
          {
            id: 'fixture_container',
            name: 'Fixture container',
            size: [1, 1, 1],
            color: '#808080',
            container: { pockets: [{ grid: [1, 1], handlingSimSeconds: 1 }] },
            loot: 'fixture_supply',
            breach: fixtureBreach(),
            material: FIXTURE_MATERIAL,
          },
        ],
      },
    },
  ]);
  expect(issues).toEqual([{ source, path: 'furniture[0].loot', message: 'unknown field "loot"' }]);
});
