import { parse } from 'valibot';
import { expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { ItemFactory, weightOf } from '../src/core/items.ts';
import { modelBodyMassKg } from '../src/core/modelMass.ts';
import { type ModelDef, ModelSchema } from '../src/core/schema.ts';

const model: ModelDef = {
  id: 'mass_fixture',
  file: 'assets/models/mass_fixture.glb',
  parts: {
    body: { massKg: 0.4, centreOfMass: [0, 0, 0], node: 'fixture:body' },
    other: { massKg: 0.7, centreOfMass: [1, 0, 0] },
  },
};

it('gets a model-backed item stack weight from the sum of its physical parts', () => {
  const { registry, issues } = buildRegistry([
    {
      source: 'mass_fixture.json',
      data: {
        models: [model],
        items: [
          {
            id: 'mass_item',
            name: 'Fixture',
            category: 'misc',
            economy: { usage: [], tiers: [] },
            weight: 1,
            size: [1, 1],
            stack: 5,
            model: model.id,
          },
        ],
      },
    },
  ]);
  expect(issues).toEqual([]);
  const item = new ItemFactory().create(registry, 'mass_item', 3);
  const sum = Object.values(model.parts).reduce((total, part) => total + part.massKg, 0);
  expect(weightOf(registry, item)).toBe(sum * 1000 * item.count);
});

it('excludes baked replaceable geometry so fitted child items own that mass', () => {
  const magazine = {
    massKg: 0.3,
    centreOfMass: [0, 0, 0],
    node: 'fixture:magazine',
  } satisfies ModelDef['parts'][string];
  const suppressor = { ...magazine, node: 'fixture:suppressor', massKg: 0.2 };
  const host = parse(ModelSchema, {
    ...model,
    parts: { ...model.parts, magazine, suppressor },
    gun: {
      slots: { magazine: { node: magazine.node, at: [0, 0, 0], turn: [0, 0, 0] } },
      attachmentSlots: [
        { id: 'fixture_muzzle', mount: 'muzzle', position: [0, 0, 0], direction: [1, 0, 0], up: [0, 1, 0] },
      ],
      attachments: [
        {
          id: 'fixture_suppressor',
          kind: 'suppressor',
          mount: 'muzzle',
          node: suppressor.node,
          mountedAt: 'fixture_muzzle',
          mountFrame: { normal: [1, 0, 0], up: [0, 1, 0] },
          properties: {},
        },
      ],
    },
  });
  expect(modelBodyMassKg(host)).toBe(Object.values(model.parts).reduce((total, part) => total + part.massKg, 0));
});
