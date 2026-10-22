import { describe, expect, it } from 'vitest';
import { BlockEntities } from '../src/core/blockEntities.ts';
import { buildRegistry, type TemplateDef } from '../src/core/content.ts';
import { rotationOf } from '../src/core/orientation.ts';
import { furnitureOf } from '../src/core/site.ts';
import { compileTemplate } from '../src/core/templates.ts';
import { fixtureBreach, fixtureLootContext } from './economyFixtures.ts';

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
          furniture: [
            {
              id: 'posed_cabinet',
              name: 'Posed cabinet',
              size: [2, 4, 1],
              color: '#808080',
              appearance: { kind: 'cabinet', surface: 'wood' },
              container: { pockets: [{ grid: [1, 1], handlingSimSeconds: 1 }] },
              breach: fixtureBreach(),
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
