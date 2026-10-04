import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Window } from 'happy-dom';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { Character } from '../src/core/character.ts';
import { buildRegistry } from '../src/core/content.ts';
import { Inventory } from '../src/core/inventory.ts';
import { bindReach } from '../src/core/reach.ts';
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
afterAll(() => dom.happyDOM.abort());
describe('crafting read-only presentation', () => {
  it('shows raw material counts, best usable quality and skill gap without granting unknown recipes', () => {
    const character = new Character(registry);
    const inventory = new Inventory(registry);
    character.knownRecipes.delete('candle');
    const broken = inventory.create('kitchen_knife');
    broken.condition = 0;
    inventory.add(broken, { kind: 'pile', pos: [0, 0, 0] });
    inventory.add(inventory.create('rag', 3), { kind: 'pile', pos: [0, 0, 0] });
    const reach = bindReach({ inventory, position: [0, 0, 0], blockSize: 0.5 });
    const before = inventory.snapshotState();
    const rows = craftRows({ registry, character, reach: reach(), preferences: {}, startReason: undefined });
    expect(rows.map((row) => row.id)).toEqual(['repair_kit', 'torch']);
    const torch = rows.find((row) => row.id === 'torch')!;
    expect(torch.components[1]!.alternatives[0]).toMatchObject({ needed: 2, found: 3 });
    expect(torch.qualities).toContainEqual({ name: 'cutting', required: 1, best: 0 });
    expect(rows[0]!.skills[0]).toMatchObject({ required: 1, available: 0 });
    const root = document.createElement('section');
    const start = vi.fn();
    renderCrafting(root, rows, { start, prefer: vi.fn() });
    expect(root.textContent).toContain('3 found / 2 needed');
    expect(root.textContent).toContain('best 0 / needs 1');
    expect(root.querySelectorAll('button:disabled')).toHaveLength(2);
    expect(inventory.snapshotState()).toEqual(before);
  });
  it('renders command callbacks and stopped owned progress rather than advancing it', () => {
    const inventory = new Inventory(registry);
    const item = inventory.create('work_in_progress');
    item.work = { recipe: 'torch', elapsed: 80, duration: 1208, components: [] };
    inventory.add(item, { kind: 'hand', side: 'right' });
    const status = craftStatus(
      inventory,
      { jobType: 'craft', workUid: item.uid, stopped: true, last: 0 },
      'Required cutting tool is not in reach',
    )!;
    expect(status.progress).toBe('Work · 1.2 min / 20.0 min');
    const root = document.createElement('section');
    const resume = vi.fn();
    const stop = vi.fn();
    renderCraftStatus(root, status, { continue: resume, stop });
    (root.querySelector('button') as HTMLButtonElement).click();
    expect(resume).toHaveBeenCalledOnce();
    (root.querySelectorAll('button')[1] as HTMLButtonElement).click();
    expect(stop).toHaveBeenCalledOnce();
    expect(root.textContent).toContain('stopped');
    expect(root.textContent).toContain('cutting');
    expect(item.work.elapsed).toBe(80);
    renderCraftStatus(root, undefined, { continue: resume, stop });
    expect(root.hidden).toBe(true);
  });
});
