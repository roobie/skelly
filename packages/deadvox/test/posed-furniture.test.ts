import { describe, expect, it } from 'vitest';
import type { TemplateDef } from '../../engine/src/core/content.ts';
import { furnitureOf } from '../../engine/src/core/site.ts';
import { compileTemplate } from '../../engine/src/core/templates.ts';
import { buildRegistry } from '../../engine/src/content.ts';
import { BlockEntities, rotationOf } from '../../engine/src/world.ts';
import {
  FIXTURE_MATERIAL,
  fixtureBreach,
  fixtureLootContext,
  fixtureMaterials,
  fixtureSounds,
} from './economyFixtures.ts';

describe('posed furniture', () => {
  it('keeps an authored fallen cabinet pose through rotated placement and spawn', () => {
    const template: TemplateDef = {
      id: 'posed_cabinet_template',
      size: [2, 1, 4],
      lootContext: fixtureLootContext(),
      palette: { F: { furniture: 'posed_cabinet', tip: 'back' } },
      layers: [['FF', 'FF', 'FF', 'FF']],
    };
    const { registry: fixtureRegistry, issues } = buildRegistry([
      {
        source: 'posed-cabinet-fixture',
        data: {
          furnitureMaterials: fixtureMaterials(),
          sounds: fixtureSounds(),
          furniture: [
            {
              id: 'posed_cabinet',
              name: 'Posed cabinet',
              size: [2, 4, 1],
              color: '#808080',
              massKg: 1,
              appearance: { kind: 'cabinet', surface: 'wood' },
              container: { pockets: [{ grid: [1, 1], handlingSimSeconds: 1 }] },
              breach: fixtureBreach(),
              material: FIXTURE_MATERIAL,
            },
          ],
          templates: [template],
        },
      },
    ]);
    expect(issues).toEqual([]);

    const compiled = compileTemplate(fixtureRegistry, template);
    const [spawn] = furnitureOf(
      { registry: fixtureRegistry, seed: 13 },
      { template: compiled, origin: [0, 0, 0], turn: 1 },
      [0, 0],
      [],
    );
    const entity = new BlockEntities(fixtureRegistry).add(spawn!.spec)!;
    const [, , back] = rotationOf(entity);

    expect(entity).toMatchObject({ type: 'posed_cabinet', facing: 'e', tip: 'back', size: [4, 1, 2] });
    expect(back.map((axis) => (axis === 0 ? 0 : -axis))).toEqual([0, 1, 0]);
  });
});
