import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Window } from 'happy-dom';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { Character } from '../src/core/character.ts';
import { buildRegistry } from '../src/core/content.ts';
import { planCraft, requirementStatus } from '../src/core/crafting.ts';
import { Inventory } from '../src/core/inventory.ts';
import { bindReach } from '../src/core/reach.ts';
import type { Session } from '../src/game/session.ts';
import { craftRows, craftStatus } from '../src/ui/craftReadout.ts';

const { registry } = buildRegistry(
  readdirSync('src/content/base')
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({
      source: file,
      data: JSON.parse(readFileSync(join('src/content/base', file), 'utf8')) as unknown,
    })),
);
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
const { renderCrafting, renderCraftStatus } = await import('../src/ui/crafting.ts');
const { mountCraftPanel } = await import('../src/ui/craftController.ts');
afterAll(() => dom.happyDOM.abort());
describe('crafting read-only presentation', () => {
  it('shows raw material counts, best usable quality and skill gap without granting unknown recipes', () => {
    const character = new Character(registry);
    const inventory = new Inventory(registry);
    character.knownRecipes.delete('candle');
    const broken = inventory.create('kitchen_knife');
    broken.condition = 0;
    inventory.add(broken, { kind: 'pile', pos: [0, 0, 0] });
    inventory.add(inventory.create('hammer'), { kind: 'pile', pos: [0, 0, 0] });
    inventory.add(inventory.create('rag', 3), { kind: 'pile', pos: [0, 0, 0] });
    const reachSnapshot = bindReach({ inventory, position: [0, 0, 0], blockSize: 0.5 })();
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
        alternatives: alternatives.map(({ item, needed, available }) => ({
          id: item,
          name: registry.items.get(item)!.name,
          needed,
          found: available,
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
    renderCrafting(root, rows, { start, prefer: vi.fn() });
    const button = root.querySelector<HTMLButtonElement>('[data-recipe="torch"] .craft-start');
    expect(button).toBeDefined();
    expect(button!.disabled).toBe(torch.reason !== undefined);
    expect(inventory.snapshotState()).toEqual(before);
  });
  it('renders command callbacks and stopped owned progress rather than advancing it', () => {
    const inventory = new Inventory(registry);
    const item = inventory.create('work_in_progress');
    const recipeSeconds = registry.recipes.get('torch')!.time * 60;
    item.work = { kind: 'craft', recipe: 'torch', elapsed: recipeSeconds, duration: recipeSeconds * 2, components: [] };
    inventory.add(item, { kind: 'hand', side: 'right' });
    const status = craftStatus(
      inventory,
      item.uid,
      { jobType: 'craft', workUid: item.uid, stopped: true, last: 0 },
      undefined,
    )!;
    expect(status.percent).toBe(Math.round((item.work!.elapsed / item.work!.duration) * 100));
    const root = document.createElement('section');
    const resume = vi.fn();
    const stop = vi.fn();
    renderCraftStatus(root, status, { continue: resume, stop });
    (root.querySelector('button') as HTMLButtonElement).click();
    expect(resume).toHaveBeenCalledOnce();
    const buttons = root.querySelectorAll('button');
    expect(buttons).toHaveLength(2);
    (buttons[1] as HTMLButtonElement).click();
    expect(stop).toHaveBeenCalledOnce();
    expect(root.querySelector('progress')?.value).toBe(status.percent);
    expect(item.work!.elapsed).toBe(recipeSeconds);
    renderCraftStatus(root, undefined, { continue: resume, stop });
    expect(root.hidden).toBe(true);
  });
  it('hides held-work status while inventory is open and restores it when closed', () => {
    const inventory = new Inventory(registry);
    const item = inventory.create('work_in_progress');
    const recipeSeconds = registry.recipes.get('torch')!.time * 60;
    item.work = { kind: 'craft', recipe: 'torch', elapsed: recipeSeconds, duration: recipeSeconds * 2, components: [] };
    inventory.add(item, { kind: 'hand', side: 'right' });
    const character = new Character(registry);
    const reach = bindReach({ inventory, position: [0, 0, 0], blockSize: 0.5 })();
    const session = {
      inventory,
      character,
      reach: () => reach,
      crafting: { currentUid: item.uid, startReason: () => undefined },
      sim: {
        actions: { job: { jobType: 'craft', workUid: item.uid, stopped: true, last: 0 } },
        compression: { interruption: undefined },
      },
    } as unknown as Session;
    const panel = document.createElement('section');
    const status = document.createElement('section');
    const controller = mountCraftPanel(panel, status, session, {
      notice: vi.fn(),
      started: vi.fn(),
      continue: vi.fn(),
      stop: vi.fn(),
    });

    controller.update(true);
    expect(status.hidden).toBe(true);
    controller.update(false);
    expect(status.hidden).toBe(false);
  });
});
