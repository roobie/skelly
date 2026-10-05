import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Window } from 'happy-dom';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { Character } from '../src/core/character.ts';
import { buildRegistry } from '../src/core/content.ts';
import type { WorkOperation, WorkOption } from '../src/core/craftCommands.ts';
import { planCraft } from '../src/core/crafting.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import { bindReach } from '../src/core/reach.ts';
import { CONTROL_CODES } from '../src/game/input.ts';
import { handlePlayMenuKey } from '../src/game/menuKeys.ts';
import { mountMenuPointer } from '../src/ui/menuPointer.ts';

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
// Happy DOM has no layout and omits this API; a moved cursor in these controls hits no drop zone.
Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: () => [] });
const { InventoryScreen } = await import('../src/ui/inventoryScreen.ts');

afterAll(() => dom.happyDOM.abort());

function setup() {
  document.body.innerHTML = '<div id="inventory" hidden></div><div id="inventory-drag-root"></div>';
  const inv = new Inventory(registry);
  const queue = new HandlingQueue(inv);
  const jeans = inv.create('jeans');
  const hoodie = inv.create('hoodie');
  const beans = inv.create('canned_beans');
  if (
    !(
      inv.add(jeans, { kind: 'worn' }) &&
      inv.add(hoodie, { kind: 'worn' }) &&
      inv.add(beans, { kind: 'hand', side: 'right' })
    )
  ) {
    throw new Error('Inventory UI fixture cannot place its worn and held items');
  }
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
  const notices: string[] = [];
  const refusals: string[] = [];
  const hooks = {
    reach: bindReach({ inventory: inv, position: [0, 0, 0], blockSize: 1 }),
    feet: () => [0, 0, 0] as [number, number, number],
    nearby: () => [...inv.piles.values()],
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
    notice: (text: string) => notices.push(text),
    refusal: (text: string) => refusals.push(text),
    describe: (_item: typeof beans) => ['test description'],
    assign: (_slot: number, _item: typeof beans) => undefined,
    workOptions: (_uid: number): WorkOption[] => [],
    work: (_uid: number, _operation: WorkOperation): string | undefined => undefined,
  };
  const root = document.querySelector<HTMLElement>('#inventory')!;
  const screen = new InventoryScreen(root, inv, queue, hooks);
  screen.open();
  return { root, screen, inv, queue, entity, searching, beans, notices, refusals, hooks };
}

describe('inventory screen Lit rendering', () => {
  it('keeps inventory commands owned without a selection, but lets gameplay and debug modals reach debug', () => {
    const codes = [
      CONTROL_CODES.hands,
      CONTROL_CODES.wear,
      CONTROL_CODES.drop,
      CONTROL_CODES.takeAll,
      CONTROL_CODES.rotate,
      CONTROL_CODES.search,
      ...CONTROL_CODES.quickbar,
      CONTROL_CODES.cancel,
      CONTROL_CODES.inventory,
    ];
    interface Row {
      context: string;
      code: string;
      inventory: boolean;
      debug: boolean;
    }
    const rows: Row[] = [];
    const expected: Row[] = [];
    for (const context of ['inventory', 'gameplay', 'debug-modal'] as const) {
      const { screen } = setup();
      if (context === 'gameplay') {
        screen.close();
      }
      screen.selected = undefined;
      const inventoryKey = vi.spyOn(screen, 'onKey');
      const debugKey = vi.fn(() => true);
      const toggleInventory = vi.fn();
      for (const code of codes) {
        const before = {
          inventory: inventoryKey.mock.calls.length,
          toggle: toggleInventory.mock.calls.length,
          debug: debugKey.mock.calls.length,
        };
        handlePlayMenuKey(new KeyboardEvent('keydown', { code, cancelable: true }), {
          inventory: screen,
          debug: { menuOpen: context === 'debug-modal', handleKey: debugKey },
          locksInput: false,
          toggleInventory,
          syncMenuState: () => undefined,
        });
        rows.push({
          context,
          code,
          inventory:
            inventoryKey.mock.calls.length > before.inventory || toggleInventory.mock.calls.length > before.toggle,
          debug: debugKey.mock.calls.length > before.debug,
        });
        expected.push({ context, code, inventory: context === 'inventory', debug: context !== 'inventory' });
      }
    }
    expect(rows).toEqual(expected);
  });
  it('shows the derived occupied hand without a second item UID and routes work options by UID', () => {
    const { root, screen, inv, hooks } = setup();
    expect(inv.move(inv.hands.right!, { kind: 'pile', pos: [0, 0, 0] }).ok).toBe(true);
    for (const [type, count] of [
      ['stick', 1],
      ['rag', 2],
      ['wax', 1],
      ['kitchen_knife', 1],
    ] as const) {
      inv.add(inv.create(type, count), { kind: 'pile', pos: [0, 0, 0] });
    }
    const result = planCraft(registry.recipes.get('torch')!, hooks.reach(), new Character(registry));
    if (!('plan' in result)) {
      throw new Error(result.missing.reason);
    }
    const item = inv.beginWork(result.plan)!;
    const calls: [number, WorkOperation][] = [];
    hooks.workOptions = () => [
      { operation: 'continue', label: 'Continue: torch', plan: { ok: true, time: 0 } },
      { operation: 'apart', label: 'Take apart', plan: { ok: true, time: 0 } },
    ];
    hooks.work = (uid, operation) => {
      calls.push([uid, operation]);
    };
    screen.selected = item;
    screen.update();
    expect(root.querySelectorAll(`.inv-hands [data-uid="${item.uid}"]`)).toHaveLength(1);
    expect(root.querySelector('[data-target="hand:left"] .inv-occupied-hand')).not.toBeNull();
    expect(inv.hands.left).toBeUndefined();
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('.inv-details button')];
    buttons.find((button) => button.textContent!.includes('Take apart'))!.click();
    expect(calls).toEqual([[item.uid, 'apart']]);
  });
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
    expect(test.root.querySelectorAll('.inv-pane')[1]?.querySelector('button.inv-option')).toBeNull();
  });

  it.each([
    {
      name: 'Ctrl (plus Alt)',
      platform: 'Linux x86_64',
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      altKey: true,
      quick: true,
    },
    {
      name: 'Cmd (plus Shift, best-effort Mac mapping)',
      platform: 'MacIntel',
      ctrlKey: false,
      metaKey: true,
      shiftKey: true,
      altKey: false,
      quick: true,
    },
    {
      name: 'unmodified',
      platform: 'Linux x86_64',
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      quick: false,
    },
    {
      name: 'Shift only',
      platform: 'Linux x86_64',
      ctrlKey: false,
      metaKey: false,
      shiftKey: true,
      altKey: false,
      quick: false,
    },
  ])('$name crosses the locked-menu adapter with unchanged modifiers and inventory behavior', (binding) => {
    const t = setup();
    const node = t.root.querySelector<HTMLElement>(`[data-uid="${t.beans.uid}"]`)!;
    const canvas = document.createElement('canvas');
    document.body.append(canvas);
    const input = { locked: true, menuPointer: true, cursorX: 100, cursorY: 100, moveMenuCursor: () => undefined };
    const adapter = mountMenuPointer({ input, canvas, cursor: document.createElement('div') });
    const hit = vi.spyOn(document, 'elementFromPoint').mockReturnValue(node);
    vi.stubGlobal('navigator', { platform: binding.platform });
    const modifiers = {
      ctrlKey: binding.ctrlKey,
      metaKey: binding.metaKey,
      shiftKey: binding.shiftKey,
      altKey: binding.altKey,
    };
    let received: typeof modifiers | undefined;
    node.addEventListener('pointerdown', (event) => {
      received = { ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey, altKey: event.altKey };
    });
    try {
      // The locked canvas receives the original event; only the production adapter can deliver it to the item.
      canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, ...modifiers }));
      expect(received).toEqual(modifiers);
      expect(t.screen.selected).toBe(t.beans);
      expect(t.inv.hands.right).toBe(t.beans);
      expect(t.queue.jobs).toHaveLength(binding.quick ? 1 : 0);
      input.cursorX += 10;
      canvas.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1 }));
      expect(document.querySelector('.inv-ghost') !== null).toBe(!binding.quick);
      canvas.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
      if (binding.quick) {
        t.queue.tick(t.queue.remaining);
        expect(t.inv.locate(t.beans)?.kind).toBe('pocket');
      }
      expect(document.querySelector('#inventory-drag-root')?.textContent).toBe('');
    } finally {
      input.locked = false;
      adapter.releaseCaptures();
      t.screen.close();
      hit.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('repeated quick-clicks keep one owned move and emit refusal feedback for every duplicate', () => {
    const t = setup();
    vi.stubGlobal('navigator', { platform: 'Linux x86_64' });
    try {
      expect(t.inv.move(t.beans, { kind: 'pile', pos: [0, 0, 0] }).ok).toBe(true);
      t.screen.update();
      const attempts = 3;
      for (let click = 0; click < attempts; click++) {
        const node = t.root.querySelector<HTMLElement>(`[data-uid="${t.beans.uid}"]`)!;
        expect(node).not.toBeNull();
        node.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, ctrlKey: true, pointerId: 1 }));
      }
      expect.soft(t.queue.jobs).toHaveLength(1);
      expect(t.refusals).toHaveLength(attempts - 1);
      expect(t.refusals.every((refusal) => refusal.length > 0)).toBe(true);
    } finally {
      t.screen.close();
      vi.unstubAllGlobals();
    }
  });

  it('keeps each worn container’s pockets inside its own wrapping slot', () => {
    const { root, inv } = setup();
    const containers = Object.entries(inv.worn).filter(([, item]) => item?.pockets?.length);
    expect(containers.length).toBeGreaterThan(0);
    for (const [slot, item] of containers) {
      const wrapper = root.querySelector(`[data-target="worn:${slot}"]`)?.closest('.inv-worn');
      expect(wrapper).not.toBeNull();
      expect(wrapper!.querySelectorAll(':scope > .inv-pockets > .inv-pocket')).toHaveLength(item!.pockets!.length);
    }
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
    expect(test.inv.add(test.inv.create(test.beans.type), { kind: 'pile', pos: [0, 0, 0] })).toBe(true);
    test.screen.update();

    expect(redraws).toBe(1);
    expect(test.root.querySelector('.inv-details button')).toBe(button);
    expect(document.activeElement).toBe(button);
  });
});
