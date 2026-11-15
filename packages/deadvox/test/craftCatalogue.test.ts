import { CraftCommands, claimed, HandlingQueue, Inventory, planCraft } from '@skelly/engine/inventory';
import { bindReach, Character } from '@skelly/engine/sim';
import {
  cataloguePage,
  craftCatalogue,
  initialCraftCatalogue,
} from '@skelly/presentation/internal/ui/craftCatalogue.ts';
import { Window } from 'happy-dom';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { baseRegistryWith } from './baseRegistry.ts';
import { BASE_CLOCK } from './dayPhaseFixture.ts';
import { fixtureSources } from './economyFixtures.ts';
import { Simulation } from './simulationFixture.ts';

const dom = new Window();
for (const key of [
  'document',
  'HTMLElement',
  'Element',
  'Node',
  'Event',
  'MouseEvent',
  'Document',
  'DocumentFragment',
] as const) {
  Object.defineProperty(globalThis, key, { configurable: true, value: dom[key] });
}
const { mountCraftPanel } = await import('@skelly/presentation/internal/ui/craftController.ts');
afterAll(() => dom.happyDOM.abort());

const ids = Array.from({ length: 12 }, (_, i) => `catalogue_recipe_${i}`);
const setup = () => {
  const registry = baseRegistryWith(
    fixtureSources([
      {
        source: 'catalogue-fixture',
        data: {
          items: [
            { id: 'catalogue_fibre', name: 'Fibre', category: 'material', size: [1, 1], weight: 1 },
            { id: 'catalogue_wood', name: 'Wood', category: 'material', size: [1, 1], weight: 1 },
          ],
          recipeCategories: [
            { id: 'catalogue_parent', label: 'Parent', order: 1 },
            { id: 'catalogue_child', label: 'Child', parent: 'catalogue_parent', order: 2 },
            { id: 'catalogue_other', label: 'Other', order: 3 },
          ],
          recipeTags: [{ id: 'catalogue_tag', label: 'Tagged', searchTerms: ['keyword'] }],
          recipes: ids.map((id, i) => ({
            id,
            category: i % 2 ? 'catalogue_other' : 'catalogue_child',
            tags: i % 3 ? [] : ['catalogue_tag'],
            searchTerms: [`needle${i}`],
            result: { item: 'catalogue_wood', count: 1 },
            timeGameMinutes: 1,
            skills: {},
            qualities: {},
            components: [
              [
                { item: 'catalogue_fibre', count: 1 },
                { item: 'catalogue_wood', count: 1 },
              ],
              [{ item: 'catalogue_fibre', count: 1 }],
            ],
          })),
        },
      },
    ]),
  );
  const inventory = new Inventory(registry);
  const character = new Character(registry);
  character.initializeProgression({}, ids);
  for (const [type, count] of [
    ['catalogue_fibre', 1],
    ['catalogue_wood', 4],
  ] as const) {
    if (!inventory.add(inventory.create(type, count), { kind: 'pile', pos: [0, 0, 0] })) {
      throw new Error('Catalogue fixture stock did not fit');
    }
  }
  const reach = bindReach({ inventory, position: [0, 0, 0], blockSize: 0.5, clock: BASE_CLOCK });
  const crafting = new CraftCommands({
    inventory,
    character,
    reach,
    queue: new HandlingQueue(inventory),
    sim: new Simulation({ seed: 1 }),
  });
  return { inventory, character, reach, crafting };
};

describe('craft catalogue', () => {
  it('narrows authored metadata and known recipes before evaluating makeable-only', () => {
    const session = setup();
    const state = {
      ...initialCraftCatalogue(),
      category: 'catalogue_parent',
      tags: ['catalogue_tag'],
      query: 'needle0',
      makeable: true,
    };
    const feasible = vi.fn(() => true);
    session.character.knownRecipes.delete(ids[1]!);
    const result = craftCatalogue(session.inventory.registry, session.character.knownRecipes, state, feasible);
    expect(result.results.map(({ id }) => id)).toEqual([ids[0]]);
    expect(feasible).toHaveBeenCalledOnce();
    expect(result.categories.some(({ id }) => id === 'catalogue_parent')).toBe(true);
    state.makeable = false;
    feasible.mockClear();
    craftCatalogue(session.inventory.registry, session.character.knownRecipes, state, feasible);
    expect(feasible).not.toHaveBeenCalled();
  });

  it('bounds result and facet pages, clamps lost pages and represents empty results', () => {
    const entries = ['a', 'b', 'c', 'd'];
    expect(cataloguePage(entries, 1, 3)).toMatchObject({
      entries: ['d'],
      first: 4,
      last: 4,
      previous: true,
      next: false,
    });
    expect(cataloguePage(entries, 90, 3).page).toBe(1);
    expect(cataloguePage([], 90, 3)).toMatchObject({ entries: [], page: 0, first: 0, last: 0, total: 0 });
  });

  it('keeps the planner-selected competing alternative on fresh and cached projections', () => {
    const session = setup();
    const recipe = session.inventory.registry.recipes.get(ids[0]!)!;
    const snapshot = session.reach();
    const result = planCraft(recipe, snapshot, session.character);
    if (!('plan' in result)) {
      throw new Error(result.missing.reason);
    }
    expect(result.plan.selectedAlternatives).toEqual({
      0: { kind: 'item', item: 'catalogue_wood' },
      1: { kind: 'item', item: 'catalogue_fibre' },
    });
    const cached = planCraft(recipe, snapshot, session.character);
    expect(cached).toEqual(result);
    expect(cached).not.toBe(result);
  });

  it('retains browsing and one selected review across page, empty query, close and reach changes', () => {
    const session = setup();
    const root = document.createElement('section');
    document.body.append(root);
    const dispatch = vi.fn();
    const controller = mountCraftPanel(root, session, { dispatch, notice: vi.fn() });
    const query = () => root.querySelector<HTMLInputElement>('.craft-query')!;
    const input = (value: string) => {
      query().value = value;
      query().dispatchEvent(new Event('input'));
    };
    const page = () => [...root.querySelectorAll<HTMLButtonElement>('.craft-catalogue .craft-pages button')];
    try {
      controller.update(true);
      const limit = claimed(session.inventory.registry.ui, 'interface')!.crafting.pageSize;
      expect(root.querySelectorAll('[data-craft-result]')).toHaveLength(Math.min(limit, ids.length));
      expect(root.querySelectorAll('.craft-recipe')).toHaveLength(1);
      page()[1]!.click();
      const selected = root.querySelector<HTMLButtonElement>('[data-craft-result]')!;
      const selectedId = selected.dataset.craftResult;
      selected.click();
      expect(root.querySelector('.craft-recipe')?.getAttribute('data-recipe')).toBe(selectedId);
      const group = root.querySelector<HTMLButtonElement>('[data-craft-group]')!;
      expect(group.textContent).toContain('Wood');
      group.click();
      root.querySelector<HTMLButtonElement>('.craft-close-alternatives')!.click();
      expect(document.activeElement).toBe(group);
      controller.update(false);
      controller.update(true);
      expect(root.querySelector('[data-craft-result]')?.getAttribute('data-craft-result')).toBe(selectedId);
      input('no-such-fixture');
      expect(root.querySelectorAll('[data-craft-result]')).toHaveLength(0);
      expect(root.querySelector('.craft-empty')).not.toBeNull();
      expect(root.querySelector('.craft-recipe')?.getAttribute('data-recipe')).toBe(selectedId);
      expect(session.inventory.add(session.inventory.create('catalogue_fibre'), { kind: 'pile', pos: [0, 0, 0] })).toBe(
        true,
      );
      controller.update(true);
      expect(query().value).toBe('no-such-fixture');
      expect(root.querySelector('.craft-recipe')?.getAttribute('data-recipe')).toBe(selectedId);
      expect(dispatch).not.toHaveBeenCalled();
    } finally {
      root.remove();
    }
  });
});
