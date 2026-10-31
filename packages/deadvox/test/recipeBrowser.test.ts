import { describe, expect, it } from 'vitest';
import { buildRegistry, validateContent } from '../src/core/content.ts';
import { gameMinutes } from '../src/core/time.ts';
import { type RecipeBrowserQuery, recipeBrowser } from '../src/ui/recipeBrowser.ts';
import { fixtureSources } from './economyFixtures.ts';

const categories = () => [
  { id: 'fixture_root', label: 'Workshop', order: 0 },
  { id: 'fixture_leaf', label: 'Threadwork', parent: 'fixture_root', order: 1 },
  { id: 'fixture_other', label: 'Elsewhere', order: 1 },
  { id: 'fixture_secret', label: 'Secret branch', order: 2 },
];
const tags = () => [
  { id: 'fixture_soft', label: 'Soft', searchTerms: ['supple'] },
  { id: 'fixture_portable', label: 'Portable', searchTerms: [] },
  { id: 'fixture_secret_tag', label: 'Secret tag', searchTerms: [] },
];
const recipe = (id: string, category: string, recipeTags: string[], searchTerms: string[] = []) => ({
  id,
  category,
  tags: recipeTags,
  searchTerms,
  result: { item: id, count: 1 },
  timeGameMinutes: 1,
  skills: {},
  qualities: {},
  components: [[{ item: 'fixture_scrap', count: 1 }]],
});
const data = () => ({
  recipeCategories: categories(),
  recipeTags: tags(),
  items: [
    ['fixture_bag', 'Café bag'],
    ['fixture_coat', 'Coat'],
    ['fixture_box', 'Box'],
    ['fixture_hidden', 'Secret pattern'],
    ['fixture_scrap', 'Scrap'],
  ].map(([id, name]) => ({
    id,
    name,
    category: 'material',
    size: [1, 1],
    weight: 1,
    disassembly:
      id === 'fixture_scrap'
        ? undefined
        : {
            timeGameMinutes: 1,
            skill: 'fixture_skill',
            yields: [{ item: 'fixture_scrap', count: 1, fractions: [0.5, 1], rounding: 'floor' }],
          },
  })),
  skills: [{ id: 'fixture_skill', name: 'Fixture skill' }],
  recipes: [
    recipe('fixture_bag', 'fixture_leaf', ['fixture_soft', 'fixture_portable'], ['stitch carry']),
    recipe('fixture_coat', 'fixture_root', ['fixture_soft']),
    recipe('fixture_box', 'fixture_other', ['fixture_portable']),
    recipe('fixture_hidden', 'fixture_secret', ['fixture_secret_tag']),
  ],
});
const source = () => fixtureSources([{ source: 'browser-fixture.json', data: data() }]);
const fixture = () => {
  const built = buildRegistry(source());
  if (built.issues.length > 0) {
    throw new Error(JSON.stringify(built.issues));
  }
  return built.registry;
};
const known = () => new Set(['fixture_bag', 'fixture_coat', 'fixture_box']);
const query = (overrides: Partial<RecipeBrowserQuery> = {}): RecipeBrowserQuery => ({
  category: undefined,
  text: '',
  tags: [],
  selected: undefined,
  ...overrides,
});

describe('recipe taxonomy admission', () => {
  it('accepts novel authored category and tag ids without code registration', () => {
    const registry = fixture();
    const view = recipeBrowser(registry, known(), query());
    expect(view.categories).toEqual([
      { id: 'fixture_root', label: 'Workshop', children: [{ id: 'fixture_leaf', label: 'Threadwork', children: [] }] },
      { id: 'fixture_other', label: 'Elsewhere', children: [] },
    ]);
    expect(view.tags.map(({ id }) => id)).toEqual(['fixture_portable', 'fixture_soft']);
  });

  it.each(['category', 'tag', 'parent'] as const)('rejects a missing %s reference at the registry boundary', (kind) => {
    const input = data();
    if (kind === 'category') {
      input.recipes[0]!.category = 'fixture_missing';
    }
    if (kind === 'tag') {
      input.recipes[0]!.tags = ['fixture_missing'];
    }
    if (kind === 'parent') {
      input.recipeCategories[0]!.parent = 'fixture_missing';
    }
    const result = buildRegistry(fixtureSources([{ source: 'bad-reference.json', data: input }]));
    expect(result.issues).toContainEqual(
      expect.objectContaining({ message: expect.stringContaining('fixture_missing') }),
    );
    expect(result.registry.recipes.has('fixture_bag')).toBe(false);
  });

  it.each([false, true])('rejects category cycles including a self parent (%s)', (self) => {
    const input = data();
    input.recipeCategories[0]!.parent = self ? 'fixture_root' : 'fixture_leaf';
    const result = buildRegistry(fixtureSources([{ source: 'cycle.json', data: input }]));
    expect(result.issues).toContainEqual(expect.objectContaining({ message: 'recipe category cycle' }));
  });

  it('rejects duplicate identities, absent labels and missing recipe metadata without authoring defaults', () => {
    expect(
      validateContent({ source: 'duplicate.json', data: { recipeCategories: [categories()[0], categories()[0]] } }),
    ).toContainEqual(expect.objectContaining({ path: 'recipeCategories[1].id' }));
    for (const section of ['recipeCategories', 'recipeTags']) {
      expect(
        validateContent({ source: 'label.json', data: { [section]: [{ id: 'fixture_unlabelled' }] } }),
      ).toContainEqual(expect.objectContaining({ path: `${section}[0].label` }));
    }
    const complete: Record<string, unknown> = {
      ...recipe('fixture_recipe', 'fixture_root', []),
      timeGameMinutes: gameMinutes(1),
    };
    for (const field of ['category', 'tags', 'searchTerms']) {
      const incomplete = { ...complete };
      delete incomplete[field];
      expect(validateContent({ source: 'metadata.json', data: { recipes: [incomplete] } })).toContainEqual(
        expect.objectContaining({ path: `recipes[0].${field}` }),
      );
    }
  });
});

describe('pure recipe browsing', () => {
  it('intersects subtree, every text word and every selected tag', () => {
    const registry = fixture();
    const browse = (overrides: Partial<RecipeBrowserQuery>) =>
      recipeBrowser(registry, known(), query(overrides)).rows.map(({ id }) => id);
    expect(browse({ category: 'fixture_root' })).toEqual(['fixture_bag', 'fixture_coat']);
    expect(browse({ category: 'fixture_leaf' })).toEqual(['fixture_bag']);
    expect(browse({ tags: ['fixture_portable'] })).toEqual(['fixture_box', 'fixture_bag']);
    expect(
      browse({ category: 'fixture_root', text: 'CAFE stitch', tags: ['fixture_soft', 'fixture_portable'] }),
    ).toEqual(['fixture_bag']);
    expect(browse({ category: 'fixture_other', text: 'cafe' })).toEqual([]);
    expect(browse({ text: 'cafe absent' })).toEqual([]);
    expect(browse({ category: 'fixture_root', tags: ['fixture_secret_tag'] })).toEqual([]);
    expect(browse({ category: 'fixture_missing' })).toEqual([]);
  });

  it('hides unknown recipes before search and navigation and does not auto-select', () => {
    const registry = fixture();
    expect(recipeBrowser(registry, known(), query({ text: 'secret' })).rows).toEqual([]);
    const hidden = recipeBrowser(registry, known(), query({ selected: 'fixture_hidden' }));
    expect(hidden.selected).toBeUndefined();
    expect(hidden.categories.some(({ id }) => id === 'fixture_secret')).toBe(false);
    expect(hidden.tags.some(({ id }) => id === 'fixture_secret_tag')).toBe(false);
    expect(recipeBrowser(registry, new Set(), query())).toEqual({
      rows: [],
      categories: [],
      tags: [],
      selected: undefined,
    });
    expect(recipeBrowser(registry, known(), query({ selected: 'fixture_bag' })).selected).toBe('fixture_bag');
    expect(recipeBrowser(registry, known(), query({ selected: 'fixture_bag', text: 'coat' })).selected).toBeUndefined();
  });

  it('does not mutate its registry, knowledge or query and returns detached presentation data', () => {
    const registry = fixture();
    const knowledge = known();
    const selection = query({ selected: 'fixture_bag', tags: ['fixture_soft'] });
    const before = structuredClone({ registry, knowledge, selection });
    const view = recipeBrowser(registry, knowledge, selection);
    expect(view.rows.map(({ id }) => id)).toEqual(['fixture_bag', 'fixture_coat']);
    view.rows[0]!.tags.push('fixture_secret_tag');
    view.categories[0]!.label = 'Changed';
    view.tags[0]!.searchTerms.push('changed');
    expect({ registry, knowledge, selection }).toEqual(before);
  });
});
