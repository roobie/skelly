import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Window } from 'happy-dom';
import { afterAll, describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import { bindReach } from '../src/core/reach.ts';

const contentDir = join(import.meta.dirname, '../src/content/base');
const { registry } = buildRegistry(
  readdirSync(contentDir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(contentDir, file), 'utf8')) as unknown })),
);

const dom = new Window();
for (const key of [
  'document',
  'HTMLElement',
  'Element',
  'Node',
  'Event',
  'MouseEvent',
  'PointerEvent',
  'KeyboardEvent',
  'Document',
  'DocumentFragment',
] as const) {
  Object.defineProperty(globalThis, key, { configurable: true, value: dom[key] });
}
Object.defineProperty(globalThis, 'window', { configurable: true, value: dom });
Object.defineProperty(globalThis, 'addEventListener', {
  configurable: true,
  value: dom.addEventListener.bind(dom),
});
Object.defineProperty(globalThis, 'removeEventListener', {
  configurable: true,
  value: dom.removeEventListener.bind(dom),
});
const { InventoryScreen } = await import('../src/ui/inventoryScreen.ts');

afterAll(() => dom.happyDOM.abort());

function setup() {
  document.body.innerHTML = '<div id="inventory" hidden></div><div id="inventory-drag-root"></div>';
  const inv = new Inventory(registry);
  const queue = new HandlingQueue(inv);
  const jeans = inv.create('jeans');
  const hoodie = inv.create('hoodie');
  inv.worn.legs = jeans;
  inv.worn.torso = hoodie;
  const beans = inv.create('canned_beans');
  inv.hands.right = beans;
  const furnitureDef = [...registry.furniture.values()].find((def) => def.container);
  if (!furnitureDef) {
    throw new Error('expected shipped searchable furniture');
  }
  const entity = inv.entities.add({ type: furnitureDef.id, pos: [1, 0, 0], size: [1, 1, 1], facing: 'n' });
  if (!entity) {
    throw new Error('expected the shipped container to be added');
  }
  const searching = new Set<typeof entity>();
  queue.registerAction('furniture.search', () => {
    searching.delete(entity);
    inv.entities.markSearched(entity);
  });
  const hooks = {
    reach: bindReach({ inventory: inv, position: [0, 0, 0], blockSize: 1 }),
    feet: () => [0, 0, 0] as [number, number, number],
    nearby: () => [],
    distance: () => 0,
    containers: () => [entity],
    entityDistance: () => 1,
    search: (target: typeof entity): string | undefined => {
      if (target.searched || searching.has(target)) {
        return undefined;
      }
      searching.add(target);
      queue.enqueueAction('furniture.search', 'Search furniture', 5);
      return undefined;
    },
    searching: (target: typeof entity) => searching.has(target),
    notice: (_text: string) => undefined,
    use: (_item: typeof beans) => undefined,
    describe: (_item: typeof beans) => ['test description'],
    assign: (_slot: number, _item: typeof beans) => undefined,
  };
  const root = document.querySelector<HTMLElement>('#inventory')!;
  const screen = new InventoryScreen(root, inv, queue, hooks);
  screen.open();
  return { root, screen, inv, queue, entity, searching, beans };
}

describe('inventory screen Lit rendering', () => {
  it('redraws the body when a furniture search is queued without a version bump', () => {
    const test = setup();
    const versions = [test.inv.version, test.inv.entities.version];
    const search = [...test.root.querySelectorAll<HTMLButtonElement>('.inv-pane button')].find((button) =>
      button.textContent?.includes('Search it'),
    );
    expect(search).toBeDefined();

    search!.click();
    test.screen.update();

    expect([test.inv.version, test.inv.entities.version]).toEqual(versions);
    expect(test.queue.jobs).toHaveLength(1);
    expect(test.searching.has(test.entity)).toBe(true);
    expect(test.root.querySelectorAll('.inv-pane')[1]?.textContent).toContain('Searching…');
  });

  it('Ctrl pointer binding enqueues quick move without immediately moving or starting a drag', () => {
    const t = setup();
    const node = t.root.querySelector<HTMLElement>(`[data-uid="${t.beans.uid}"]`)!;
    node.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, ctrlKey: true }));
    expect(t.queue.jobs).toHaveLength(1);
    expect(t.inv.hands.right).toBe(t.beans);
    t.queue.tick(10);
    expect(t.inv.locate(t.beans)?.kind).toBe('pocket');
    expect(document.querySelector('#inventory-drag-root')?.textContent).toBe('');
  });

  it('keeps shipped jeans and hoodie pockets inside their wrapping container', () => {
    const { root } = setup();
    const legs = [...root.querySelectorAll('.inv-worn')].find(
      (slot) => slot.querySelector('.inv-slot-label')?.textContent === 'Legs',
    );
    const torso = [...root.querySelectorAll('.inv-worn')].find(
      (slot) => slot.querySelector('.inv-slot-label')?.textContent === 'Torso',
    );

    expect(legs?.querySelectorAll(':scope > .inv-pockets > .inv-pocket')).toHaveLength(4);
    expect(torso?.querySelectorAll(':scope > .inv-pockets > .inv-pocket')).toHaveLength(1);
  });

  it('preserves focus across a real body redraw while the selected option remains valid', () => {
    const test = setup();
    test.screen.selected = test.beans;
    test.screen.update();
    const button = test.root.querySelector<HTMLButtonElement>('.inv-details button');
    expect(button).toBeDefined();
    button!.focus();
    expect(document.activeElement).toBe(button);

    let redraws = 0;
    const screenWithRender = test.screen as unknown as { render: () => void };
    const render = screenWithRender.render.bind(test.screen);
    screenWithRender.render = () => {
      redraws += 1;
      render();
    };
    test.inv.version += 1;
    test.screen.update();

    expect(redraws).toBe(1);
    expect(test.root.querySelector('.inv-details button')).toBe(button);
    expect(document.activeElement).toBe(button);
  });
});
