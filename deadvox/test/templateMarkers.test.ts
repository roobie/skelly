import { expect, it } from 'vitest';
import { buildRegistry, type TemplateDef } from '../src/core/content.ts';
import { compileTemplate, findPieces } from '../src/core/templates.ts';
import { fixtureLootContext } from './economyFixtures.ts';

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
        blocks: [{ id: 'fixture_solid', name: 'Fixture solid', solid: true, color: '#808080' }],
        furniture: [{ id: 'fixture_piece', name: 'Fixture piece', size: [1, 1, 1], color: '#808080' }],
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

it('leaves a container empty when its placement has no loot table', () => {
  const template: TemplateDef = {
    id: 'fixture_empty_container',
    lootContext: fixtureLootContext(),
    size: [1, 1, 1],
    palette: { C: { furniture: 'fixture_container' } },
    layers: [['C']],
  };
  const { registry, issues } = buildRegistry([
    {
      source: 'empty-container.json',
      data: {
        furniture: [
          {
            id: 'fixture_container',
            name: 'Fixture container',
            size: [1, 1, 1],
            color: '#808080',
            container: { pockets: [{ grid: [1, 1], handlingSimSeconds: 1 }] },
          },
        ],
        loot: [{ id: 'fixture_supply', rolls: [1, 1], entries: [{ nothing: true, weight: 1 }] }],
        templates: [template],
      },
    },
  ]);
  expect(issues).toEqual([]);
  Object.assign(registry.furniture.get('fixture_container')!, { loot: 'fixture_supply' });
  expect(compileTemplate(registry, template).pieces[0]!.loot).toBeUndefined();
});
