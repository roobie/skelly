import { parse } from 'valibot';
import { expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { ItemFactory, weightOf } from '../src/core/items.ts';
import { modelBodyMassKg } from '../src/core/modelMass.ts';
import { type ModelDef, ModelSchema } from '../src/core/schema.ts';

const model = {
  id: 'mass_fixture',
  file: 'assets/models/mass_fixture.glb',
  parts: {
    body: { massKg: 0.4, centreOfMass: [0, 0, 0], node: 'fixture:body' },
    other: { massKg: 0.7, centreOfMass: [1, 0, 0] },
  },
} satisfies ModelDef;

it('gets an assembly item stack weight from the sum of its physical parts', () => {
  const { registry, issues } = buildRegistry([
    {
      source: 'mass_fixture.json',
      data: {
        models: [model],
        items: [
          {
            id: 'mass_item',
            workInProgress: false,
            notLoot: false,
            name: 'Fixture',
            category: 'misc',
            economy: { usage: [], tiers: [] },
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
  } satisfies NonNullable<ModelDef['parts']>[string];
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
          properties: { noiseFactor: 0.5 },
        },
      ],
    },
  });
  expect(modelBodyMassKg(host)).toBe(Object.values(model.parts).reduce((total, part) => total + part.massKg, 0));
});

it('keeps each atom authored weight when several items share a visual model', () => {
  const atom = { id: model.id, file: model.file };
  const items = [2, 7].map((weight, index) => ({
    id: `atom_${index}`,
    workInProgress: false,
    notLoot: false,
    name: `Atom ${index}`,
    category: 'misc',
    economy: { usage: [], tiers: [] },
    weight,
    size: [1, 1],
    model: atom.id,
  }));
  const { registry, issues } = buildRegistry([{ source: 'atoms.json', data: { models: [atom], items } }]);
  expect(issues).toEqual([]);
  const factory = new ItemFactory();
  for (const item of items) {
    expect(weightOf(registry, factory.create(registry, item.id))).toBe(item.weight);
  }
});

it('requires exactly one authored mass source per item', () => {
  for (const parts of [undefined, model.parts]) {
    for (const weight of [undefined, 1]) {
      const { issues } = buildRegistry([
        {
          source: 'mass-source.json',
          data: {
            models: [{ id: model.id, file: model.file, ...(parts === undefined ? {} : { parts }) }],
            items: [
              {
                id: 'fixture_item',
                workInProgress: false,
                notLoot: false,
                name: 'Fixture',
                category: 'misc',
                economy: { usage: [], tiers: [] },
                size: [1, 1],
                model: model.id,
                ...(weight === undefined ? {} : { weight }),
              },
            ],
          },
        },
      ]);
      const valid = (parts !== undefined) !== (weight !== undefined);
      expect(issues.map(({ path }) => path)).toEqual(valid ? [] : ['items[0].weight']);
    }
  }
});
