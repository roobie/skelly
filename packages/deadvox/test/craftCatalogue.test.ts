import { repairCeiling } from '@skelly/engine/internal/core/items.ts';
import { CraftCommands, claimed, HandlingQueue, hasRepairTarget, Inventory, planCraft } from '@skelly/engine/inventory';
import { bindReach, Character } from '@skelly/engine/sim';
import {
  cataloguePage,
  craftCatalogue,
  initialCraftCatalogue,
} from '@skelly/presentation/internal/ui/craftCatalogue.ts';
import { craftRows } from '@skelly/presentation/internal/ui/craftReadout.ts';
import { housingSites } from '@skelly/presentation/internal/ui/housingSites.ts';
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

const REPAIR_ID = 'catalogue_repair';
const WORLD_REPAIR_ID = 'catalogue_world_repair';
const ACTIVATION_ID = 'catalogue_activation';
const CELL_REPAIR_ID = 'catalogue_cell_repair';
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
            { id: 'catalogue_blade', name: 'Blade', category: 'material', size: [1, 1], weight: 1 },
          ],
          recipeCategories: [
            { id: 'catalogue_parent', label: 'Parent', order: 1 },
            { id: 'catalogue_child', label: 'Child', parent: 'catalogue_parent', order: 2 },
            { id: 'catalogue_other', label: 'Other', order: 3 },
          ],
          recipeTags: [{ id: 'catalogue_tag', label: 'Tagged', searchTerms: ['keyword'] }],
          furniture: [{ id: 'catalogue_piece', name: 'Catalogue piece', size: [1, 1, 1], color: '#777777' }],
          recipes: [
            {
              id: WORLD_REPAIR_ID,
              kind: 'repair',
              category: 'catalogue_other',
              tags: [],
              searchTerms: [],
              result: { item: 'catalogue_wood', count: 1 },
              repair: { skill: 'crafting', amount: 1, perSkill: 0, entity: 'catalogue_piece' },
              timeGameMinutes: 1,
              skills: {},
              qualities: {},
              components: [[{ item: 'catalogue_fibre', count: 1 }]],
            },
            {
              id: CELL_REPAIR_ID,
              kind: 'repair',
              category: 'catalogue_other',
              tags: [],
              searchTerms: [],
              result: { item: 'catalogue_wood', count: 1 },
              repair: { skill: 'crafting', amount: 1, perSkill: 0, block: 'planks' },
              timeGameMinutes: 1,
              skills: {},
              qualities: {},
              components: [[{ item: 'catalogue_fibre', count: 1 }]],
            },
            {
              id: ACTIVATION_ID,
              kind: 'repair',
              activation: 'sharpen',
              category: 'catalogue_other',
              tags: [],
              searchTerms: [],
              result: { item: 'catalogue_blade', count: 1 },
              repair: { skill: 'crafting', amount: 0.2, perSkill: 0 },
              timeGameMinutes: 1,
              skills: {},
              qualities: {},
              components: [],
            },
            {
              id: REPAIR_ID,
              kind: 'repair',
              category: 'catalogue_other',
              tags: [],
              searchTerms: [],
              result: { item: 'catalogue_blade', count: 1 },
              repair: { skill: 'crafting', amount: 0.2, perSkill: 0 },
              timeGameMinutes: 1,
              skills: {},
              qualities: {},
              components: [[{ item: 'catalogue_fibre', count: 1 }]],
            },
            ...ids.map((id, i) => ({
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
          ],
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
  return { inventory, character, reach, crafting, power: undefined };
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
    const result = craftCatalogue(session.inventory.registry, session.character.knownRecipes, state, {
      makeable: feasible,
      hasTarget: () => true,
    });
    expect(result.results.map(({ id }) => id)).toEqual([ids[0]]);
    expect(feasible).toHaveBeenCalledOnce();
    expect(result.categories.some(({ id }) => id === 'catalogue_parent')).toBe(true);
    state.makeable = false;
    feasible.mockClear();
    craftCatalogue(session.inventory.registry, session.character.knownRecipes, state, {
      makeable: feasible,
      hasTarget: () => true,
    });
    expect(feasible).not.toHaveBeenCalled();
  });

  it('hides an item repair recipe whose only targets sit at its ceiling, and a search still reaches it', () => {
    const session = setup();
    const { registry } = session.inventory;
    const recipe = registry.recipes.get(REPAIR_ID)!;
    session.character.learnRecipes([REPAIR_ID]);
    const listed = (query = '') =>
      craftCatalogue(
        registry,
        session.character.knownRecipes,
        { ...initialCraftCatalogue(), query },
        { makeable: () => true, hasTarget: (candidate) => hasRepairTarget(registry, session.reach(), candidate) },
      ).results.some(({ id }) => id === REPAIR_ID);
    const place = (condition: number) => {
      expect(
        session.inventory.add(session.inventory.create('catalogue_blade', 1, condition), {
          kind: 'pile',
          pos: [0, 0, 0],
        }),
      ).toBe(true);
    };
    const ceiling = repairCeiling(registry, recipe);

    place(ceiling);
    expect(listed()).toBe(false);
    expect(listed(registry.items.get('catalogue_blade')!.name)).toBe(true);

    place(ceiling / 2);
    expect(listed()).toBe(true);
  });

  it('lists every known recipe in the all-known view, ignoring filters, and reviews the unstartable read-only', () => {
    const session = setup();
    const { registry } = session.inventory;
    session.character.learnRecipes([REPAIR_ID, WORLD_REPAIR_ID, CELL_REPAIR_ID, ACTIVATION_ID]);
    session.inventory.add(
      session.inventory.create('catalogue_blade', 1, repairCeiling(registry, registry.recipes.get(REPAIR_ID)!)),
      {
        kind: 'pile',
        pos: [0, 0, 0],
      },
    );
    const listed = (state: Partial<ReturnType<typeof initialCraftCatalogue>>) =>
      craftCatalogue(
        registry,
        session.character.knownRecipes,
        { ...initialCraftCatalogue(), ...state },
        {
          makeable: () => false,
          hasTarget: () => false,
        },
      ).results.map(({ id }) => id);
    const hidden = [REPAIR_ID, WORLD_REPAIR_ID, ACTIVATION_ID];

    expect(listed({})).not.toEqual(expect.arrayContaining([hidden[1]]));
    expect(listed({ allKnown: true, category: 'catalogue_child', tags: ['catalogue_tag'], makeable: true })).toEqual(
      expect.arrayContaining(hidden),
    );
    expect(listed({ allKnown: true, query: registry.items.get('catalogue_blade')!.name })).toContain(ACTIVATION_ID);

    const rows = craftRows({
      registry,
      character: session.character,
      reach: session.reach(),
      preferences: {},
      startReason: undefined,
      recipeIds: [ACTIVATION_ID, WORLD_REPAIR_ID, CELL_REPAIR_ID],
      allKnown: true,
    });
    expect(rows.map(({ id }) => id).sort()).toEqual([ACTIVATION_ID, WORLD_REPAIR_ID, CELL_REPAIR_ID].sort());
    const reasons = rows.map(({ reason }) => reason);
    expect(reasons.every((reason) => reason !== undefined)).toBe(true);
    // A terrain repair has no surface to start from, so it must not borrow the furniture repair's pointer.
    expect(new Set(reasons).size).toBe(3);
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
    const controller = mountCraftPanel(root, session, {
      dispatch,
      notice: vi.fn(),
      sites: housingSites(session),
      pickSpot: vi.fn(),
    });
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
