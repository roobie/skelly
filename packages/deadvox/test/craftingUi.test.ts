import { Window } from 'happy-dom';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { Character } from '../src/core/character.ts';
import { planCraft, requirementStatus } from '../src/core/crafting.ts';
import { Inventory } from '../src/core/inventory.ts';
import { bindReach } from '../src/core/reach.ts';
import { fillText } from '../src/core/textTemplate.ts';
import { craftingText, craftRows, runningCraftPresentation } from '../src/ui/craftReadout.ts';
import { baseRegistry, baseRegistryWith, baseScreenText } from './baseRegistry.ts';
import { BASE_CLOCK } from './dayPhaseFixture.ts';
import { fixtureSources } from './economyFixtures.ts';

const registry = baseRegistry();
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
const { renderCrafting } = await import('../src/ui/crafting.ts');
const { handlingViewModel, timedActionHandlingPresentation } = await import('../src/ui/hud.ts');
afterAll(() => dom.happyDOM.abort());

const ENTITY_REPAIR = 'fixture_entity_repair';
const ITEM_REPAIR = 'fixture_item_repair';
const FURNITURE = 'fixture_repair_furniture';
const RESULT = 'fixture_repair_item';
const STOCK = 'fixture_repair_stock';
const repairRegistry = baseRegistryWith(
  fixtureSources([
    {
      source: 'craft-ui-repair-fixture',
      data: {
        items: [
          { id: RESULT, name: 'Fixture item', category: 'material', size: [1, 1], weight: 1 },
          { id: STOCK, name: 'Fixture stock', category: 'material', size: [1, 1], weight: 1 },
        ],
        furniture: [{ id: FURNITURE, name: 'Fixture furniture', size: [1, 1, 1], color: '#777777' }],
        skills: [{ id: 'fixture_repair_skill', name: 'Fixture repair', startingRecipes: [ENTITY_REPAIR, ITEM_REPAIR] }],
        recipes: [ENTITY_REPAIR, ITEM_REPAIR].map((id) => ({
          id,
          kind: 'repair',
          result: { item: RESULT, count: 1 },
          repair: {
            ...(id === ENTITY_REPAIR ? { entity: FURNITURE } : {}),
            skill: 'fixture_repair_skill',
            amount: 0.2,
            perSkill: 0,
          },
          timeGameMinutes: 1,
          skills: {},
          qualities: {},
          components: [[{ item: STOCK, count: 1 }]],
        })),
      },
    },
  ]),
);
const repairRows = (withItem = true) => {
  const character = new Character(repairRegistry);
  const inventory = new Inventory(repairRegistry);
  if (!inventory.add(inventory.create(STOCK), { kind: 'pile', pos: [0, 0, 0] })) {
    throw new Error('Fixture stock did not fit');
  }
  if (withItem && !inventory.add(inventory.create(RESULT, 1, 0.5), { kind: 'pile', pos: [0, 0, 0] })) {
    throw new Error('Fixture repair item did not fit');
  }
  return craftRows({
    registry: repairRegistry,
    character,
    reach: bindReach({ inventory, position: [0, 0, 0], blockSize: 0.5, clock: BASE_CLOCK })(),
    preferences: {},
    startReason: undefined,
  });
};

describe('crafting read-only presentation', () => {
  it('names entity repair rows after furniture rather than the recipe result item', () => {
    const row = repairRows().find(({ id }) => id === ENTITY_REPAIR)!;
    const { name } = repairRegistry.furniture.get(FURNITURE)!;
    expect(row.itemName).toBe(name);
    expect(row.name).toBe(fillText(craftingText(repairRegistry).repairName, { item: name }));
  });

  it('refuses targetless entity Start without dispatch and links a focusable button to its reason', () => {
    const row = repairRows().find(({ id }) => id === ENTITY_REPAIR)!;
    const text = craftingText(repairRegistry);
    expect(row.reason).toBeDefined();
    expect(row.reason).toBe(text.entityRepairTargetRequired);
    const root = document.createElement('section');
    document.body.append(root);
    const start = vi.fn();
    try {
      renderCrafting(root, [row], { start, prefer: vi.fn(), source: vi.fn() }, text);
      const button = root.querySelector<HTMLButtonElement>('.craft-start')!;
      expect(button.disabled).toBe(false);
      expect(button.getAttribute('aria-disabled')).toBe('true');
      button.focus();
      expect(document.activeElement).toBe(button);
      const reason = root.querySelector('.craft-reason')!;
      expect(reason.textContent).toBe(row.reason);
      expect(button.getAttribute('aria-describedby')).toBe(reason.id);
      expect(reason.id).not.toBe('');
      button.click();
      expect(start).not.toHaveBeenCalled();
    } finally {
      root.remove();
    }
  });

  it.each([true, false])('keeps item repair admission and routing based on a damaged item in reach: %s', (withItem) => {
    const row = repairRows(withItem).find(({ id }) => id === ITEM_REPAIR)!;
    const text = craftingText(repairRegistry);
    const { name } = repairRegistry.items.get(RESULT)!;
    expect(row.itemName).toBe(name);
    expect(row.name).toBe(fillText(text.repairName, { item: name }));
    expect(row.reason).toBe(withItem ? undefined : text.noRepairTarget);
    const root = document.createElement('section');
    const start = vi.fn();
    renderCrafting(root, [row], { start, prefer: vi.fn(), source: vi.fn() }, text);
    root.querySelector<HTMLButtonElement>('.craft-start')!.click();
    expect(start.mock.calls).toEqual(withItem ? [[ITEM_REPAIR]] : []);
  });
  it('shows raw material counts, best usable quality and skill gap without granting unknown recipes', () => {
    const character = new Character(registry);
    const inventory = new Inventory(registry);
    character.knownRecipes.delete('candle');
    const broken = inventory.create('kitchen_knife');
    broken.condition = 0;
    inventory.add(broken, { kind: 'pile', pos: [0, 0, 0] });
    inventory.add(inventory.create('hammer'), { kind: 'pile', pos: [0, 0, 0] });
    inventory.add(inventory.create('rag', 3), { kind: 'pile', pos: [0, 0, 0] });
    const reachSnapshot = bindReach({ inventory, position: [0, 0, 0], blockSize: 0.5, clock: BASE_CLOCK })();
    const before = inventory.snapshotState();
    const rows = craftRows({ registry, character, reach: reachSnapshot, preferences: {}, startReason: undefined });
    expect(rows.every((row) => character.knownRecipes.has(row.id))).toBe(true);
    const torchRecipe = registry.recipes.get('torch')!;
    const torch = rows.find((row) => row.id === torchRecipe.id)!;
    const requirements = requirementStatus(torchRecipe, reachSnapshot, character);
    expect(torch.components).toEqual(
      requirements.components.map(({ group, alternatives }) => ({
        group,
        preferred: '',
        draws: [],
        automatic: true,
        vessels: [],
        alternatives: alternatives.map((alternative) => ({
          kind: alternative.kind,
          id: JSON.stringify(
            alternative.kind === 'item'
              ? { kind: 'item', item: alternative.item }
              : { kind: 'liquid', liquid: alternative.liquid },
          ),
          name:
            alternative.kind === 'item'
              ? registry.items.get(alternative.item)!.name
              : registry.liquids.get(alternative.liquid)!.name,
          needed: alternative.needed,
          found: alternative.available,
        })),
      })),
    );
    expect(torch.qualities).toEqual(
      requirements.qualities.map(({ quality, required, available }) => ({
        name: quality,
        required,
        best: available,
      })),
    );
    expect(torch.skills).toEqual(
      requirements.skills.map(({ skill, required, available }) => ({
        name: registry.skills.get(skill)!.name,
        required,
        available,
      })),
    );
    const result = planCraft(torchRecipe, reachSnapshot, character);
    expect(torch.reason).toBe('missing' in result ? result.missing.reason : undefined);
    const root = document.createElement('section');
    const start = vi.fn();
    renderCrafting(root, rows, { start, prefer: vi.fn(), source: vi.fn() }, craftingText(registry));
    const button = root.querySelector<HTMLButtonElement>('[data-recipe="torch"] .craft-start');
    expect(button).toBeDefined();
    expect(button!.disabled).toBe(false);
    expect(button!.getAttribute('aria-disabled')).toBe(torch.reason === undefined ? 'false' : 'true');
    button!.click();
    expect(start.mock.calls).toEqual(torch.reason === undefined ? [[torch.id]] : []);
    expect(inventory.snapshotState()).toEqual(before);
  });
  describe('craft progress in the handling HUD', () => {
    const workItem = (where: 'hand' | 'pile') => {
      const inventory = new Inventory(registry);
      const item = inventory.create('work_in_progress');
      item.work = { kind: 'craft', recipe: 'torch', elapsed: 30, duration: 120, components: [] };
      inventory.add(item, where === 'hand' ? { kind: 'hand', side: 'right' } : { kind: 'pile', pos: [0, 0, 0] });
      return { inventory, job: { jobType: 'craft' as const, workUid: item.uid, last: 0 } };
    };

    it('drives handling progress from the work item while the craft runs', () => {
      const { inventory, job } = workItem('hand');
      const action = runningCraftPresentation(inventory, { ...job, stopped: false });
      expect(action).toBeDefined();
      const { handling } = baseScreenText();
      const model = handlingViewModel(timedActionHandlingPresentation(action!, handling), handling);
      expect(model.visible).toBe(true);
      expect(model.percent).toBe(25);
    });

    it('shows no progress for a paused craft, held or dropped', () => {
      for (const where of ['hand', 'pile'] as const) {
        const { inventory, job } = workItem(where);
        expect(runningCraftPresentation(inventory, { ...job, stopped: true })).toBeUndefined();
      }
    });
  });
});
