import { Window } from 'happy-dom';
import { Group } from 'three';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { Body } from '../src/core/body.ts';
import { Character, practiceForNextLevel, SKILL_LEVEL_LEGENDARY } from '../src/core/character.ts';
import { buildRegistry } from '../src/core/content.ts';
import { CORE_CONTENT_IDS } from '../src/core/contentIds.ts';
import { coreLabel, coreMessage } from '../src/core/coreText.ts';
import type { WorkOperation, WorkOption } from '../src/core/craftCommands.ts';
import { planCraft } from '../src/core/crafting.ts';
import { firearmSlotIds } from '../src/core/firearmFitting.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import { swapBattery } from '../src/core/lights.ts';
import { countText, decimalText } from '../src/core/numberText.ts';
import { bindReach } from '../src/core/reach.ts';
import { fillText } from '../src/core/textTemplate.ts';
import { FirearmAttachmentHandling } from '../src/game/firearmAttachmentHandling.ts';
import {
  BindingRegistry,
  INPUT_BINDINGS,
  inputBindings,
  inventoryTabForAction,
  KeyboardInput,
  keyboardInput,
} from '../src/game/inputBindings.ts';
import { routeModalCommand } from '../src/game/modalCommand.ts';
import { PlayerTickActions } from '../src/game/playerTickActions.ts';
import { Quickbar } from '../src/game/quickbar.ts';
import {
  applyReplayActionPayload,
  isReplayActionPayload,
  type ReplayActionPayload,
  type ReplayCommandOwners,
} from '../src/game/replayCommands.ts';
import { createScreenCommandDispatcher } from '../src/game/screenCommandDispatcher.ts';
import { Survival } from '../src/game/survival.ts';
import { ItemPictures } from '../src/render/itemPictures.ts';
import { mountMenuPointer } from '../src/ui/menuPointer.ts';
import { baseRegistry, baseRegistryWith } from './baseRegistry.ts';
import { BASE_CLOCK } from './dayPhaseFixture.ts';
import { withDefaultMountedLight } from './firearmAttachmentFixture.ts';
import { BODY_TUNING_FIXTURE, Simulation } from './simulationFixture.ts';

const registry = baseRegistry();

/** Matches text filled from a content template, each placeholder replaced by its pattern. */
const templatePattern = (template: string, placeholders: Readonly<Record<string, string>>): RegExp =>
  new RegExp(
    `^${template.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{(\w+)\\\}/g, (_, name: string) => placeholders[name] ?? '')}$`,
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
Object.defineProperty(globalThis, 'dispatchEvent', {
  configurable: true,
  value: dom.dispatchEvent.bind(dom),
});
// Happy DOM has no layout and omits this API; a moved cursor in these controls hits no drop zone.
Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: () => [] });
const { InventoryScreen, targetForPackedFloorDrop } = await import('../src/ui/inventoryScreen.ts');

afterAll(() => dom.happyDOM.abort());

function setup(contentRegistry = registry) {
  document.body.innerHTML = '<div id="inventory" hidden></div><div id="inventory-drag-root"></div>';
  const inv = new Inventory(contentRegistry);
  const queue = new HandlingQueue(inv);
  const quickbar = new Quickbar();
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
  const body = new Body(BODY_TUNING_FIXTURE);
  const character = new Character(registry);
  queue.registerAction('furniture.search', () => {
    searching.delete(entity);
    inv.entities.markSearched(entity);
  });
  const notices: string[] = [];
  const refusals: string[] = [];
  let needs = 'health 100% · stamina 100% · food 100% · water 100% · fatigue 0';
  let lastPayload: ReplayActionPayload | undefined;
  let workHandler = (_uid: number, _operation: WorkOperation): string | undefined => undefined;
  let loadHandler = (_lightUid: number, _batteryUid: number): string | undefined => undefined;
  let alarm: { gameHour: number | undefined } | undefined;
  const commandOwners: ReplayCommandOwners = {
    inventory: inv,
    queue,
    quickbar,
    vehicleWork: () => undefined,
    search: (uid) => {
      if (uid !== entity.uid || entity.searched || searching.has(entity)) {
        return;
      }
      searching.add(entity);
      queue.enqueueAction('furniture.search', 'Search furniture', 5);
    },
    work: (uid, operation) => workHandler(uid, operation),
    loadBattery: (lightUid, batteryUid) => loadHandler(lightUid, batteryUid),
    toHands: () => undefined,
    pickup: () => undefined,
    interact: () => undefined,
    lift: () => undefined,
    useFurniture: () => undefined,
    slide: () => undefined,
    place: () => undefined,
    turn: () => undefined,
    tip: () => undefined,
    clearDownedBody: () => undefined,
    craftStart: () => undefined,
    craftContinue: () => undefined,
    craftStop: () => undefined,
    wait: () => undefined,
    setWakeGameHour: (gameHour) => {
      alarm = alarm && { gameHour };
    },
    cancelItemThrow: () => undefined,
    throwItem: () => undefined,
  };
  const hooks = {
    reach: bindReach({ inventory: inv, position: [0, 0, 0], blockSize: 1, clock: BASE_CLOCK }),
    feet: () => [0, 0, 0] as [number, number, number],
    nearby: () => [...inv.piles.values()],
    distance: () => 0,
    containers: () => [entity],
    entityDistance: () => 1,
    dispatch: (payload: ReplayActionPayload) => {
      lastPayload = payload;
      return applyReplayActionPayload(payload, commandOwners);
    },
    searching: (target: typeof entity) => searching.has(target),
    notice: (text: string) => notices.push(text),
    refusal: (text: string) => refusals.push(text),
    describe: (_item: typeof beans) => ['test description'],
    workOptions: (_uid: number): WorkOption[] => [],
    character: () => character,
    body: () => body,
    needs: () => needs,
    slotLabels: {
      head: 'fixture head',
      eyes: 'fixture eyes',
      torso: 'fixture torso',
      vest: 'fixture vest',
      legs: 'fixture legs',
      back: 'fixture back',
      waist: 'fixture waist',
      hands: 'fixture hands',
      feet: 'fixture feet',
      shoulder: 'fixture shoulder',
    },
    wakeGameHour: () => alarm,
    actionRefusal: () => body.actionRefusal,
    attachmentCandidates: (_firearmUid: number, _slotId: string) => [beans],
  };
  const root = document.querySelector<HTMLElement>('#inventory')!;
  const screen = new InventoryScreen(root, inv, queue, hooks);
  screen.open();
  return {
    root,
    screen,
    inv,
    queue,
    quickbar,
    entity,
    searching,
    beans,
    notices,
    refusals,
    hooks,
    commandOwners,
    body,
    character,
    lastPayload: () => lastPayload,
    setWorkHandler: (handler: typeof workHandler) => {
      workHandler = handler;
    },
    setLoadHandler: (handler: typeof loadHandler) => {
      loadHandler = handler;
    },
    setNeeds: (value: string) => {
      needs = value;
    },
    carryAlarm: () => {
      alarm = { gameHour: undefined };
    },
  };
}

it('keeps a model-less item as a text tile when pictures are enabled', () => {
  const fixture = buildRegistry([
    {
      source: 'text-tile',
      data: {
        items: [
          {
            id: 'text_tile',
            workInProgress: false,
            notLoot: false,
            name: 'Text tile',
            category: 'misc',
            weight: 1,
            size: [1, 1],
            economy: { usage: [], tiers: [] },
          },
        ],
      },
    },
  ]);
  expect(fixture.issues).toEqual([]);
  const merged = { ...registry, items: new Map([...registry.items, ...fixture.registry.items]) };
  const test = setup(merged);
  const item = test.inv.create('text_tile');
  expect(test.inv.add(item, { kind: 'pile', pos: [0, 0, 0] })).toBe(true);
  Object.assign(test.hooks, {
    pictures: new ItemPictures(
      merged,
      {
        version: 1,
        has: () => true,
        groundLook: () => new Group(),
      },
      2,
      { paint: () => 'still', view: vi.fn(), dispose: vi.fn() },
    ),
  });
  test.screen.update();
  const tile = test.root.querySelector(`[data-uid="${item.uid}"]`)!;
  expect(tile.querySelector('.inv-item-name')!.textContent).toBe('Text tile');
  expect(tile.querySelector('img')).toBeNull();
});

const holdQuickGate = () => {
  const previous = { context: keyboardInput.context, command: keyboardInput.command };
  keyboardInput.cancel();
  keyboardInput.context = () => ({ context: 'inventory', debug: false });
  keyboardInput.command = () => undefined;
  const issue = inputBindings.rebind('inventory.quick-action-gate', [{ code: 'KeyJ' }]);
  if (issue) {
    throw new Error(issue);
  }
  const event = new KeyboardEvent('keydown', inputBindings.chords('inventory.quick-action-gate')[0]);
  if (!keyboardInput.press(event)) {
    throw new Error('Quick-action fixture gate was not admitted');
  }
  return () => {
    keyboardInput.release(event);
    inputBindings.reset();
    keyboardInput.context = previous.context;
    keyboardInput.command = previous.command;
  };
};

describe('inventory screen Lit rendering', () => {
  it('drops a packed floor stack onto the visible stack at its stored spot', () => {
    const items = new Map(registry.items);
    items.set('fixture_floor_stack', {
      id: 'fixture_floor_stack',
      workInProgress: false,
      notLoot: false,
      economy: { usage: [], tiers: [] },
      name: 'Fixture floor stack',
      category: 'material',
      weight: 1,
      size: [1, 1],
      stack: 4,
    });
    const inventory = new Inventory({ ...registry, items });
    const pos: [number, number, number] = [0, 0, 0];
    const hiddenFirst = inventory.create('fixture_floor_stack');
    const visibleStack = inventory.create('fixture_floor_stack', 2);
    if (
      !(
        inventory.add(hiddenFirst, { kind: 'pile', pos, at: { x: 0, y: 0, rotated: false } }) &&
        inventory.add(visibleStack, { kind: 'pile', pos, at: { x: 1, y: 0, rotated: false } })
      )
    ) {
      throw new Error('Could not create packed floor drop fixture');
    }
    inventory.consume(hiddenFirst);
    const dragged = inventory.create('fixture_floor_stack');
    if (!inventory.add(dragged, { kind: 'hand', side: 'left' })) {
      throw new Error('Could not hold packed floor drop fixture');
    }

    const target = targetForPackedFloorDrop(inventory, dragged, pos, visibleStack);
    expect(target).toEqual({ kind: 'pile', pos, at: { x: 1, y: 0, rotated: false } });
    const plan = inventory.plan(dragged, target);
    if (!plan.ok) {
      throw new Error(`Visible floor stack refused its matching drop: ${plan.reason}`);
    }
    expect(plan.merge).toBe(visibleStack);
  });

  it('drops onto the visible packed floor item at its stored spot to swap', () => {
    const items = new Map(registry.items);
    items.set('fixture_floor_dragged', {
      id: 'fixture_floor_dragged',
      workInProgress: false,
      notLoot: false,
      economy: { usage: [], tiers: [] },
      name: 'Fixture dragged item',
      category: 'material',
      weight: 1,
      size: [1, 1],
    });
    items.set('fixture_floor_target', {
      id: 'fixture_floor_target',
      workInProgress: false,
      notLoot: false,
      economy: { usage: [], tiers: [] },
      name: 'Fixture target item',
      category: 'material',
      weight: 1,
      size: [1, 1],
    });
    const inventory = new Inventory({ ...registry, items });
    const pos: [number, number, number] = [0, 0, 0];
    const hiddenFirst = inventory.create('fixture_floor_dragged');
    const visibleTarget = inventory.create('fixture_floor_target');
    if (
      !(
        inventory.add(hiddenFirst, { kind: 'pile', pos, at: { x: 0, y: 0, rotated: false } }) &&
        inventory.add(visibleTarget, { kind: 'pile', pos, at: { x: 1, y: 0, rotated: false } })
      )
    ) {
      throw new Error('Could not create packed floor swap fixture');
    }
    inventory.consume(hiddenFirst);
    const dragged = inventory.create('fixture_floor_dragged');
    if (!inventory.add(dragged, { kind: 'hand', side: 'left' })) {
      throw new Error('Could not hold packed floor swap fixture');
    }

    const target = targetForPackedFloorDrop(inventory, dragged, pos, visibleTarget);
    expect(target).toEqual({ kind: 'pile', pos, at: { x: 1, y: 0, rotated: false } });
    expect(inventory.plan(dragged, target)).toMatchObject({ ok: true, swap: visibleTarget, at: { x: 1, y: 0 } });
  });

  it('shows distinct item names in grid cells and uses the same name in the drag ghost', () => {
    const items = new Map(registry.items);
    const alphaName = 'Can of beans';
    const betaName = 'Box of matches';
    items.set('fixture_inventory_alpha', {
      id: 'fixture_inventory_alpha',
      workInProgress: false,
      notLoot: false,
      economy: { usage: [], tiers: [] },
      name: alphaName,
      category: 'medical',
      weight: 1,
      size: [1, 1],
    });
    items.set('fixture_inventory_beta', {
      id: 'fixture_inventory_beta',
      workInProgress: false,
      notLoot: false,
      economy: { usage: [], tiers: [] },
      name: betaName,
      category: 'medical',
      weight: 1,
      size: [1, 1],
    });
    const { root, screen, inv } = setup({ ...registry, items });
    const alpha = inv.create('fixture_inventory_alpha');
    const beta = inv.create('fixture_inventory_beta');
    const handItem = inv.create('fixture_inventory_alpha');
    const pos: [number, number, number] = [1, 0, 0];
    if (
      !(
        inv.add(alpha, { kind: 'pile', pos, at: { x: 0, y: 0, rotated: false } }) &&
        inv.add(beta, { kind: 'pile', pos, at: { x: 1, y: 0, rotated: false } }) &&
        inv.add(handItem, { kind: 'hand', side: 'left' })
      )
    ) {
      throw new Error('Could not place inventory display fixtures');
    }
    screen.update();

    const cells = [alpha, beta].map((item) => root.querySelector<HTMLElement>(`.inv-item[data-uid="${item.uid}"]`)!);
    const names = cells.map((cell) => cell.querySelector('.inv-item-name')?.textContent?.trim() ?? '');
    const handNode = root.querySelector<HTMLElement>(`.inv-item-slot[data-uid="${handItem.uid}"]`);
    expect(names[0]).not.toBe(names[1]);
    expect(cells[0]!.title.startsWith(alphaName)).toBe(true);
    expect(cells[1]!.title.startsWith(betaName)).toBe(true);
    expect(handNode?.querySelector('.inv-item-name')?.textContent).toBe(inv.name(handItem));

    cells[0]!.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, clientX: 10, clientY: 10 }),
    );
    globalThis.window.dispatchEvent(
      new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: 30, clientY: 10 }),
    );
    const ghost = document.querySelector<HTMLElement>('.inv-ghost');
    expect(ghost?.textContent?.trim()).toBe(names[0]);
    globalThis.window.dispatchEvent(
      new PointerEvent('pointerup', { bubbles: true, button: 0, pointerId: 1, clientX: 30, clientY: 10 }),
    );
    screen.close();
  });

  it('opens the view-only item viewer on the view press over a card and closes it with state unchanged', () => {
    const test = setup();
    const { root, screen, inv, queue, beans } = test;
    const model = vi.fn(() => new Group());
    Object.assign(test.hooks, { itemView: { model, view: vi.fn() } });
    // Selected, so a drop that leaked past the viewer would move it.
    screen.selected = beans;
    screen.update();
    const viewPress = inputBindings.chords('inventory.view-item')[0]!;
    const button = Number(viewPress.code.replace('Mouse', ''));
    const before = { state: inv.snapshotState(), selected: screen.selected, jobs: queue.jobs.length };
    const covered = root.querySelector<HTMLButtonElement>('button.inv-option')!;
    covered.focus();
    expect(document.activeElement).toBe(covered);

    root.querySelector<HTMLElement>(`[data-uid="${beans.uid}"]`)!.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        button,
        pointerId: 1,
        shiftKey: viewPress.modifier === 'shift',
      }),
    );
    expect(screen.viewedUid).toBe(beans.uid);
    expect(model).toHaveBeenLastCalledWith(beans);
    const viewer = root.querySelector(`.inv-viewer[data-item-viewer="${beans.uid}"]`);
    expect(viewer).not.toBeNull();
    // Focus leaves the covered button, which stays out of reach through a redraw.
    expect(document.activeElement).toBe(viewer);
    screen.update();
    expect(covered.closest('[inert]')).not.toBeNull();
    expect(viewer!.closest('[inert]')).toBeNull();

    // The viewer swallows item keys while open.
    expect(screen.onAction('inventory.drop')).toBe(true);
    screen.update();
    expect(screen.viewedUid).toBe(beans.uid);

    root.querySelector<HTMLButtonElement>('[data-action="viewer.close"]')!.click();
    expect(screen.viewedUid).toBeUndefined();
    expect(root.querySelector('.inv-viewer')).toBeNull();
    expect(root.querySelector('[inert]')).toBeNull();
    expect(document.activeElement).toBe(covered);
    expect({ state: inv.snapshotState(), selected: screen.selected, jobs: queue.jobs.length }).toEqual(before);
    screen.close();
  });

  it('turns the model on a left drag even when the view binding is the left button', () => {
    const test = setup();
    const { root, screen, beans } = test;
    const view = vi.fn();
    Object.assign(test.hooks, { itemView: { model: () => new Group(), view } });
    screen.update();
    const issue = inputBindings.rebind('inventory.view-item', [{ code: 'Mouse0' }]);
    try {
      expect(issue).toBeUndefined();
      root
        .querySelector<HTMLElement>(`[data-uid="${beans.uid}"]`)!
        .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1 }));
      globalThis.window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerId: 1 }));
      expect(screen.viewedUid).toBe(beans.uid);
      const yaw = () => view.mock.lastCall![1].yaw;
      const opened = yaw();
      root
        .querySelector('.inv-viewer-canvas')!
        .dispatchEvent(
          new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, clientX: 10, clientY: 10 }),
        );
      globalThis.window.dispatchEvent(
        new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: 40, clientY: 10 }),
      );
      expect(screen.viewedUid).toBe(beans.uid);
      expect(yaw()).not.toBe(opened);
    } finally {
      inputBindings.reset();
      screen.close();
    }
  });

  // The browser breaks and clips a grid name (style.css, `.inv-item-name`), so the screen hands it the whole name.
  it('renders whole grid names and runs tall items along the long edge', () => {
    const items = new Map(registry.items);
    const fixtures = [
      { id: 'fixture_tall_name', name: 'Fixture baseball bat', size: [1, 4] as [number, number] },
      {
        id: 'fixture_long_word_name',
        name: 'Fixture extraordinarilylongword',
        size: [1, 1] as [number, number],
      },
    ];
    for (const fixture of fixtures) {
      items.set(fixture.id, {
        id: fixture.id,
        workInProgress: false,
        notLoot: false,
        economy: { usage: [], tiers: [] },
        name: fixture.name,
        category: 'misc',
        weight: 1,
        size: fixture.size,
      });
    }
    const { root, screen, inv } = setup({ ...registry, items });
    const position: [number, number, number] = [1, 0, 0];
    const placed = fixtures.map((fixture, x) => {
      const item = inv.create(fixture.id);
      if (!inv.add(item, { kind: 'pile', pos: position, at: { x, y: 0, rotated: false } })) {
        throw new Error(`Could not place ${fixture.id} display fixture`);
      }
      return { fixture, item };
    });
    screen.update();

    for (const { fixture, item } of placed) {
      const node = root.querySelector<HTMLElement>(`.inv-item[data-uid="${item.uid}"]`)!;
      expect(node.querySelector('.inv-item-name')?.textContent).toBe(fixture.name);
      expect(node.classList.contains('inv-item-tall')).toBe(fixture.size[1] > fixture.size[0]);
    }
    screen.close();
  });

  it('marks successful and refused drop previews with distinct shapes', () => {
    const { root, screen, beans } = setup();
    const beansSlot = root.querySelector<HTMLElement>(`.inv-item-slot[data-uid="${beans.uid}"]`)!;
    const floorGrid = root.querySelector<HTMLElement>('.inv-grid[data-target^="pile:"]')!;
    const wornSlot = root.querySelector<HTMLElement>('.inv-slot-worn[data-target]')!;
    let hitTarget: HTMLElement = floorGrid;
    const hitTest = vi.spyOn(document, 'elementsFromPoint').mockImplementation(() => [hitTarget]);

    beansSlot.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, clientX: 10, clientY: 10 }),
    );
    globalThis.window.dispatchEvent(
      new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: 30, clientY: 10 }),
    );
    expect(floorGrid.dataset.dropShape).toBe('will-land');
    const acceptedMark = floorGrid.dataset.dropMark ?? '';
    expect(acceptedMark).not.toBe('');

    hitTarget = wornSlot;
    globalThis.window.dispatchEvent(
      new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: 30, clientY: 10 }),
    );
    expect(wornSlot.dataset.dropShape).toBe('blocked');
    const refusedMark = wornSlot.dataset.dropMark ?? '';
    expect(refusedMark).not.toBe('');
    expect(refusedMark).not.toBe(acceptedMark);
    globalThis.window.dispatchEvent(
      new PointerEvent('pointerup', { bubbles: true, button: 0, pointerId: 1, clientX: 30, clientY: 10 }),
    );
    hitTest.mockRestore();
    screen.close();
  });

  it('opens directly on a requested tab and remembers it across toggles', () => {
    const { screen, root } = setup();
    screen.close();
    screen.openOnTab('skills');
    expect(screen.isOpen).toBe(true);
    screen.close();
    screen.open();

    expect(screen.activeTab).toBe('skills');
    expect(root.querySelector<HTMLElement>('[data-tab-panel="skills"]')?.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>('[data-tab-panel="items"]')?.hidden).toBe(true);
  });

  it('keeps a find filter while blurred and routes inventory keys to its items', () => {
    const { screen, root, beans, lastPayload } = setup();
    const keyboard = new KeyboardInput(inputBindings);
    keyboard.context = () => ({ context: 'inventory', debug: false });
    keyboard.command = ({ action, phase }) => {
      if (phase === 'down') {
        screen.onAction(action);
      }
    };
    const remove = keyboard.install();
    try {
      screen.onAction('inventory.find');
      const field = root.querySelector<HTMLInputElement>('[data-inventory-find]')!;
      const query = root.querySelector<HTMLElement>(`.inv-item[data-uid="${beans.uid}"] .inv-item-name`)!.textContent!;
      const press = (code: string, key = code) => {
        const event = new KeyboardEvent('keydown', { code, key, bubbles: true, cancelable: true });
        field.dispatchEvent(event);
        field.dispatchEvent(new KeyboardEvent('keyup', { code, key, bubbles: true }));
        return event;
      };
      expect(press('ArrowDown').defaultPrevented).toBe(true);
      expect(screen.selected).toBe(beans);
      expect(press('ArrowDown').defaultPrevented).toBe(true);
      expect(screen.selected).not.toBe(beans);
      expect(press('ArrowUp').defaultPrevented).toBe(true);
      expect(screen.selected).toBe(beans);
      for (const [code, key] of [
        ['ArrowLeft', 'ArrowLeft'],
        ['ArrowRight', 'ArrowRight'],
        ['Home', 'Home'],
        ['End', 'End'],
      ]) {
        expect(press(code!, key!).defaultPrevented).toBe(false);
        expect(screen.selected).toBe(beans);
      }
      expect(press('Enter').defaultPrevented).toBe(true);
      expect(lastPayload()).toMatchObject({ kind: 'inventory.move', itemUid: beans.uid });
      expect(press('ArrowDown').defaultPrevented).toBe(true);
      expect(screen.selected).not.toBe(beans);

      field.value = query;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      expect(screen.selected).toBe(beans);
      const payloadBeforeTypingKey = lastPayload();
      expect(press('KeyW', 'w').defaultPrevented).toBe(false);
      expect(lastPayload()).toBe(payloadBeforeTypingKey);
      expect(press('Escape', 'Escape').defaultPrevented).toBe(true);
      expect(field.value).toBe(query);
      expect(document.activeElement).not.toBe(field);

      const action = new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', bubbles: true, cancelable: true });
      globalThis.dispatchEvent(action);
      globalThis.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w', bubbles: true }));
      expect(action.defaultPrevented).toBe(true);
      expect(lastPayload()).toMatchObject({ kind: 'inventory.to-hands', itemUid: beans.uid });

      const dimmed = [...root.querySelectorAll<HTMLElement>('.inv-item-unmatched')][0]!;
      const dimmedUid = Number(dimmed.dataset.uid);
      dimmed.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1 }));
      globalThis.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerId: 1 }));
      expect(screen.selected?.uid).toBe(dimmedUid);

      const dimmedAction = new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', bubbles: true, cancelable: true });
      globalThis.dispatchEvent(dimmedAction);
      globalThis.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w', bubbles: true }));
      expect(dimmedAction.defaultPrevented).toBe(true);
      expect(lastPayload()).toMatchObject({ kind: 'inventory.to-hands', itemUid: dimmedUid });
    } finally {
      remove();
      screen.close();
    }
  });

  it('does not act on an unselected inventory item', () => {
    const { screen, lastPayload } = setup();
    expect(screen.selected).toBeUndefined();
    expect(screen.onAction('inventory.hands')).toBe(true);
    expect(lastPayload()).toBeUndefined();
  });

  it('keys body redraws by displayed values, not live recovery state', () => {
    const { screen, hooks, body, beans } = setup();
    body.impact(0.1, 'torso', { kind: 'blunt' });
    screen.selected = beans;
    const description = vi.spyOn(hooks, 'describe');
    screen.update();
    description.mockClear();
    body.advance(0.000_01);
    screen.update();
    expect(description).not.toHaveBeenCalled();
  });

  it('records selection inspection for the next tick but never records a passive repaint', () => {
    const { screen, hooks, beans, inv, commandOwners } = setup();
    const pendingPlayerTickActions = new PlayerTickActions();
    const recorder = { queueAction: vi.fn() };
    const inspect = vi.fn();
    const owners = { ...commandOwners, inspect };
    hooks.dispatch = createScreenCommandDispatcher({
      isReplaying: () => false,
      inputRecorder: () => recorder,
      inputContext: () => 'inventory',
      pendingPlayerTickActions,
      apply: (command) => applyReplayActionPayload(command, owners),
      inventory: inv,
      notice: hooks.notice,
      refusal: hooks.refusal,
    });
    screen.selected = beans;
    screen.update();
    const payload = { kind: 'inventory.inspect', itemUid: beans.uid };
    expect(isReplayActionPayload(payload)).toBe(true);
    expect(recorder.queueAction).toHaveBeenCalledExactlyOnceWith('inventory.inspect', 'down', 'inventory', { payload });
    expect(inspect).not.toHaveBeenCalled();
    pendingPlayerTickActions.applyAtNextTick();
    expect(inspect).toHaveBeenCalledExactlyOnceWith(beans.uid);
    recorder.queueAction.mockClear();
    inspect.mockClear();
    screen.selectTab('items');
    pendingPlayerTickActions.applyAtNextTick();
    expect(recorder.queueAction).not.toHaveBeenCalled();
    expect(inspect).not.toHaveBeenCalled();
    screen.selected = inv.worn.torso;
    screen.update();
    pendingPlayerTickActions.applyAtNextTick();
    expect(inspect).toHaveBeenCalledExactlyOnceWith(inv.worn.torso!.uid);
  });

  it('dims the listed items a typed query misses, and Escape leaves the filter applied', () => {
    const { screen, root, beans } = setup();
    const field = root.querySelector<HTMLInputElement>('[data-inventory-find]')!;
    const tiles = () => [...root.querySelectorAll<HTMLElement>('.inv-item[data-uid]')];
    const dimmed = (tile: HTMLElement) => tile.classList.contains('inv-item-unmatched');
    expect(tiles().length).toBeGreaterThan(1);
    expect(tiles().some(dimmed)).toBe(false);

    expect(screen.onAction('inventory.find')).toBe(true);
    expect(document.activeElement).toBe(field);

    const held = tiles().find((tile) => tile.dataset.uid === String(beans.uid))!;
    field.value = held.querySelector('.inv-item-name')!.textContent!.toUpperCase();
    field.dispatchEvent(new Event('input', { bubbles: true }));
    expect(dimmed(tiles().find((tile) => tile.dataset.uid === String(beans.uid))!)).toBe(false);
    expect(tiles().some(dimmed)).toBe(true);

    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(field.value).not.toBe('');
    expect(tiles().some(dimmed)).toBe(true);
    expect(document.activeElement).not.toBe(field);
  });

  it('shows Wait on the Actions tab and dispatches it through the screen owner', () => {
    const { screen, root, lastPayload } = setup();
    screen.selectTab('actions');
    expect(root.querySelector<HTMLElement>('[data-tab-panel="actions"]')?.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>('[data-tab-panel="items"]')?.hidden).toBe(true);
    const panel = root.querySelector<HTMLElement>('[data-tab-panel="actions"]')!;
    const button = panel.querySelector<HTMLButtonElement>('button[data-action="wait"]');
    expect(button).not.toBeNull();
    button!.click();
    expect(lastPayload()).toEqual({ kind: 'action.wait' });
  });
  it('offers a wake hour only while an alarm is carried, stepping it through the replay owner', () => {
    const { screen, root, lastPayload, carryAlarm } = setup();
    screen.selectTab('actions');
    const panel = root.querySelector<HTMLElement>('[data-tab-panel="actions"]')!;
    expect(panel.querySelector('[data-wake-at]')).toBeNull();
    carryAlarm();
    screen.update();
    const shown = () => panel.querySelector('[data-wake-at]')?.textContent;
    const step = (action: 'wake-earlier' | 'wake-later') => {
      panel.querySelector<HTMLButtonElement>(`button[data-action="${action}"]`)!.click();
      screen.update();
    };
    const whenRested = shown();
    expect(whenRested).toBeTruthy();
    step('wake-earlier');
    expect(lastPayload()).toEqual({ kind: 'action.wake-hour', gameHour: 23 });
    expect(shown()).not.toBe(whenRested);
    step('wake-later');
    expect(lastPayload()).toEqual({ kind: 'action.wake-hour', gameHour: null });
    expect(shown()).toBe(whenRested);
    step('wake-later');
    expect(lastPayload()).toEqual({ kind: 'action.wake-hour', gameHour: 0 });
  });
  it('routes a hotkey to an open screen before its generic action handler', () => {
    const { screen } = setup();
    const handled = routeModalCommand('ui.inventory-tab-skills', {
      toggleMainMenu: () => undefined,
      readingOpen: false,
      readingAction: () => undefined,
      toggleInventory: () => undefined,
      inventoryTabAction: (action) => {
        const tab = inventoryTabForAction(action);
        if (!tab) {
          return false;
        }
        screen.openOnTab(tab);
        return true;
      },
      screenOpen: screen.isOpen,
      screenAction: (action) => {
        screen.onAction(action);
      },
      mainMenuOpen: false,
      interruptionCommand: () => false,
    });

    expect(handled).toBe(true);
    expect(screen.activeTab).toBe('skills');
  });

  it('lets movement leave a book page after its close callback stops reading', () => {
    let pageClosed = false;
    const handled = routeModalCommand('movement.forward', {
      toggleMainMenu: () => undefined,
      readingOpen: true,
      readingAction: () => {
        throw new Error('Movement should leave the book page');
      },
      readingMovementAction: () => {
        pageClosed = true;
        return true;
      },
      toggleInventory: () => undefined,
      inventoryTabAction: () => false,
      screenOpen: false,
      screenAction: () => undefined,
      mainMenuOpen: false,
      interruptionCommand: () => false,
    });

    expect(pageClosed).toBe(true);
    expect(handled).toBe(false);
  });

  it('keeps live needs in the character-screen header on every tab', () => {
    const { screen, root, setNeeds } = setup();
    const needs = () => root.querySelector<HTMLElement>('.inv-needs')?.textContent;
    expect(needs()).toContain('stamina 100%');

    screen.selectTab('skills');
    expect(needs()).toContain('water 100%');
    screen.selectTab('crafting');
    expect(needs()).toContain('food 100%');

    setNeeds('health 80% · stamina 60% · food 40% · water 20% · fatigue 130');
    screen.update();
    expect(needs()).toContain('fatigue 130');
  });

  it('renders a skill level from the live character progression', () => {
    const { screen, root, character } = setup();
    const [skill] = registry.skills.values();
    if (!skill) {
      throw new Error('The skill screen needs a registry skill fixture');
    }
    screen.selectTab('skills');
    const initialLevel = character.skills[skill.id]!;
    const row = () => root.querySelector<HTMLElement>(`[data-skill="${skill.id}"]`);
    expect(row()?.dataset.level).toBe(String(initialLevel));

    character.awardPractice(skill.id, practiceForNextLevel(registry, initialLevel), SKILL_LEVEL_LEGENDARY);
    screen.update();

    expect(character.skills[skill.id]).toBeGreaterThan(initialLevel);
    expect(row()?.dataset.level).toBe(String(character.skills[skill.id]));
  });

  it('rounds the practice the skills panel shows, so accumulated float noise never reaches its text', () => {
    const { screen, root, character } = setup();
    const [skill] = registry.skills.values();
    if (!skill) {
      throw new Error('The skill screen needs a registry skill fixture');
    }
    // A block absorbing part of a hit awards practice as a product, which is where the tail enters.
    character.awardPractice(skill.id, 2.5 * 0.46);
    screen.selectTab('skills');

    const text = registry.ui.get(CORE_CONTENT_IDS.coreUi)!.screenText.inventory;
    const practice = character.practice[skill.id]!;
    const next = practiceForNextLevel(registry, character.skills[skill.id]!);
    const expected = fillText(text.practice, { practice: decimalText(practice), next: countText(next) });
    const row = root.querySelector<HTMLElement>(`[data-skill="${skill.id}"]`);
    expect(row?.querySelector('.inv-skill-practice')?.textContent).toBe(expected);
    expect(row?.querySelector('.inv-skill-progress')?.getAttribute('aria-valuenow')).toBe(decimalText(practice));
  });
  it('shows the nested battery slot of a mounted light in firearm details', () => {
    const mounted = withDefaultMountedLight(registry, 'rifle_assault', 'flashlight');
    const { screen, inv, root } = setup(mounted.registry);
    const firearm = inv.create('rifle_assault');
    if (!inv.add(firearm, { kind: 'pile', pos: [0, 0, 0] })) {
      throw new Error('Fixture firearm could not be placed on the ground');
    }

    screen.selected = firearm;
    screen.update();

    const light = firearm.slots![mounted.fitted.mountedAt]!;
    const battery = root.querySelector<HTMLElement>(`[data-target="battery:${light.uid}"]`);
    expect(battery?.dataset.occupied).toBe('true');
  });

  it('pours once onto a fixed receiver card, refuses a full receiver, and reverses into the explicit other hand', () => {
    const built = buildRegistry([
      {
        source: 'card-vessels',
        data: {
          liquids: [{ id: 'card_liquid', name: 'Card liquid', densityGramsPerMillilitre: 1 }],
          items: ['source', 'receiver'].map((role) => ({
            id: `card_${role}`,
            name: role,
            category: 'tool',
            weight: 1,
            size: [1, 1],
            economy: { usage: [], tiers: [] },
            workInProgress: false,
            notLoot: false,
            ...(role === 'receiver'
              ? {
                  light: {
                    radius: 1,
                    seenFrom: 1,
                    color: '#ffffff',
                    intensity: 1,
                    liquidFuel: { accepts: ['card_liquid'], microlitresPerGameSecond: 1 },
                    burning: {
                      ignition: 'manual',
                      douse: true,
                      sprint: 'douse',
                      stow: 'douse',
                      drop: 'stay',
                      relight: true,
                    },
                  },
                }
              : {}),
            vessel: {
              capacityMicrolitres: role === 'source' ? 24 : 12,
              accepts: ['card_liquid'],
              initialContents:
                role === 'source'
                  ? { kind: 'filled', liquid: 'card_liquid', volumeMicrolitres: 24 }
                  : { kind: 'empty' },
              pour: { incrementMicrolitres: 2, microlitresPerSimSecond: 4 },
            },
          })),
        },
      },
    ]);
    expect(built.issues).toEqual([]);
    const t = setup({
      ...registry,
      items: new Map([...registry.items, ...built.registry.items]),
      liquids: built.registry.liquids,
    });
    const source = t.inv.create('card_source');
    const receiver = t.inv.create('card_receiver');
    expect(t.inv.consume(t.beans)).toBe(true);
    expect(t.inv.add(source, { kind: 'hand', side: 'left' })).toBe(true);
    expect(t.inv.add(receiver, { kind: 'hand', side: 'right' })).toBe(true);
    const survival = new Survival(new Simulation({ seed: 1 }), t.inv, t.queue, {
      reach: t.hooks.reach,
      feet: () => ({ kind: 'pile', pos: [0, 0, 0] }),
      notice: () => undefined,
      read: () => undefined,
      readingLight: () => undefined,
    });
    const pours = vi.fn((from: number, to: number) => survival.pour(from, to));
    t.commandOwners.pour = pours;
    const owners = [t.inv.locate(source), t.inv.locate(receiver)];
    const finish = () => {
      for (let step = 0; t.queue.busy && step < 100; step++) {
        t.queue.tick(t.queue.jobs[0]!.duration);
      }
      expect(t.queue.busy).toBe(false);
      t.screen.update();
    };
    const drag = () => {
      t.screen.selected = receiver;
      t.screen.update();
      const slot = t.root.querySelector<HTMLElement>(`[data-target="reservoir:${receiver.uid}"]`)!;
      const hit = vi.spyOn(document, 'elementsFromPoint').mockImplementation(() => [slot]);
      t.root
        .querySelector<HTMLElement>(`.inv-item-slot[data-uid="${source.uid}"], .inv-item[data-uid="${source.uid}"]`)!
        .dispatchEvent(
          new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, clientX: 10, clientY: 10 }),
        );
      t.screen.update();
      expect(t.root.querySelector('.inv-details')?.getAttribute('data-selected-uid')).toBe(String(receiver.uid));
      globalThis.window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 30, clientY: 10 }));
      globalThis.window.dispatchEvent(
        new PointerEvent('pointerup', { button: 0, pointerId: 1, clientX: 30, clientY: 10 }),
      );
      hit.mockRestore();
    };
    t.screen.selected = receiver;
    t.screen.update();
    const readout = () => t.root.querySelector(`[data-target="reservoir:${receiver.uid}"]`)!.textContent;
    const before = readout();
    drag();
    expect(pours).toHaveBeenCalledExactlyOnceWith(source.uid, receiver.uid);
    finish();
    expect(source.liquidContents?.kind).toBe('filled');
    expect(receiver.liquidContents?.kind).toBe('filled');
    expect(readout()).not.toBe(before);
    const filled = t.inv.snapshotState();
    drag();
    expect(pours).toHaveBeenCalledTimes(1);
    expect(t.refusals).toEqual([coreMessage(t.inv.registry, 'liquidReceiverFull')]);
    expect(t.inv.snapshotState()).toEqual(filled);
    expect(survival.use(receiver)).toBeUndefined();
    drag();
    expect(pours).toHaveBeenCalledTimes(1);
    expect(t.refusals.at(-1)).toBe(coreMessage(t.inv.registry, 'stillLit'));
    expect(survival.use(receiver)).toBeUndefined();
    t.screen.update();
    expect(t.root.querySelector<HTMLButtonElement>('.inv-pour')!.disabled).toBe(false);
    t.root.querySelector<HTMLButtonElement>('.inv-pour')!.click();
    expect(pours).toHaveBeenLastCalledWith(receiver.uid, source.uid);
    expect(pours).toHaveBeenCalledTimes(2);
    finish();
    expect(receiver.liquidContents).toEqual({ kind: 'empty' });
    expect(source.liquidContents?.kind).toBe('filled');
    expect([t.inv.locate(source), t.inv.locate(receiver)]).toEqual(owners);
    expect(t.inv.move(source, { kind: 'pile', pos: [0, 0, 0] }).ok).toBe(true);
    drag();
    expect(pours).toHaveBeenCalledTimes(2);
    expect(t.refusals.at(-1)).toBe(
      coreMessage(t.inv.registry, 'notInHands', { item: t.inv.name(source).toLowerCase() }),
    );
    expect(t.inv.add(t.inv.create(t.beans.type), { kind: 'hand', side: 'left' })).toBe(true);
    t.screen.update();
    const unavailable = t.root.querySelector<HTMLButtonElement>('.inv-pour')!;
    expect(unavailable.disabled).toBe(true);
    expect(unavailable.textContent).toBe(coreLabel(t.inv.registry, 'pour'));
    t.screen.close();
  });

  it('loads a battery dragged onto the battery slot of a light card', () => {
    const t = setup();
    const light = t.inv.create('flashlight');
    const spare = t.inv.create('aa_battery');
    if (!(t.inv.add(light, { kind: 'pile', pos: [0, 0, 0] }) && t.inv.add(spare, { kind: 'hand', side: 'left' }))) {
      throw new Error('Fixture could not place the light on the ground and the battery in hand');
    }
    const fitted = light.slots!.battery!;
    t.setLoadHandler((lightUid, batteryUid) =>
      swapBattery(t.inv, t.inv.itemByUid(lightUid)!, t.inv.itemByUid(batteryUid)!, () => ({
        kind: 'pile',
        pos: [0, 0, 0],
      })),
    );
    t.screen.selected = light;
    t.screen.update();
    const slot = t.root.querySelector<HTMLElement>(`[data-target="battery:${light.uid}"]`)!;
    const hitTest = vi.spyOn(document, 'elementsFromPoint').mockImplementation(() => [slot]);

    t.root
      .querySelector<HTMLElement>(`.inv-item-slot[data-uid="${spare.uid}"]`)!
      .dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, clientX: 10, clientY: 10 }),
      );
    globalThis.window.dispatchEvent(
      new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: 30, clientY: 10 }),
    );
    globalThis.window.dispatchEvent(
      new PointerEvent('pointerup', { bubbles: true, button: 0, pointerId: 1, clientX: 30, clientY: 10 }),
    );
    hitTest.mockRestore();

    expect(t.lastPayload()).toEqual({ kind: 'light.battery.load', lightUid: light.uid, batteryUid: spare.uid });
    expect(light.slots?.battery).toBe(spare);
    expect(t.inv.locate(fitted)?.kind).toBe('pile');
    t.screen.close();
  });

  it('fits a foregrip from an inventory pocket onto the held AR through the inventory control', () => {
    const test = setup();
    const firearm = test.inv.create('rifle_assault');
    const foregrip = test.inv.create('foregrip');
    const pocketOwner = test.inv.worn.legs;
    const model = registry.models.get('rifle_assault')!;
    const slot = model.gun!.attachmentSlots!.find(
      (candidate) =>
        candidate.mount === 'rail-bottom' && model.gun!.compatibility?.[candidate.id]?.includes('foregrip'),
    );
    if (!(pocketOwner && slot && test.inv.consume(test.beans))) {
      throw new Error('Fixture could not prepare the foregrip and held-firearm path');
    }
    if (
      !(
        test.inv.add(firearm, { kind: 'hand', side: 'right' }) &&
        test.inv.add(foregrip, { kind: 'pocket', owner: pocketOwner, pocket: 0 })
      )
    ) {
      throw new Error('Fixture could not place the AR in hand and foregrip in an inventory pocket');
    }
    const handling = new FirearmAttachmentHandling(test.inv, test.queue, () => [0, 0, 0]);
    test.hooks.attachmentCandidates = (firearmUid, slotId) => handling.candidates(firearmUid, slotId);
    test.hooks.dispatch = (payload) =>
      applyReplayActionPayload(payload, {
        inventory: test.inv,
        queue: test.queue,
        quickbar: { assign: () => undefined },
        search: () => undefined,
        work: () => undefined,
        fitAttachment: (uid, targetSlot, attachmentUid) => handling.fit(uid, targetSlot, attachmentUid),
        removeAttachment: (uid, targetSlot) => handling.remove(uid, targetSlot),
        vehicleWork: () => undefined,
        loadBattery: () => undefined,
        toHands: () => undefined,
        pickup: () => undefined,
        interact: () => undefined,
        lift: () => undefined,
        useFurniture: () => undefined,
        slide: () => undefined,
        place: () => undefined,
        turn: () => undefined,
        tip: () => undefined,
        clearDownedBody: () => undefined,
        craftStart: () => undefined,
        craftContinue: () => undefined,
        craftStop: () => undefined,
        wait: () => undefined,
        setWakeGameHour: () => undefined,
        cancelItemThrow: () => undefined,
        throwItem: () => undefined,
      });
    const paint = vi.fn(() => `data:image/png;base64,${paint.mock.calls.length}`);
    const models = { version: 0, has: () => models.version > 0, groundLook: () => new Group() };
    const pictures = new ItemPictures(registry, models, registry.graphics.get('core')!.itemPictureCacheCapacity, {
      paint,
      view: vi.fn(),
      dispose: vi.fn(),
    });
    Object.assign(test.hooks, { pictures });
    test.screen.selected = firearm;
    test.screen.update();
    expect(test.root.querySelector(`[data-uid="${firearm.uid}"] .inv-item-picture`)).toBeNull();
    models.version += 1;
    test.screen.update();
    const picture = () =>
      test.root.querySelector<HTMLImageElement>(`[data-uid="${firearm.uid}"] .inv-item-picture`)!.src;
    const before = picture();
    expect(pictures.picture(firearm)).toBe(before);
    const coldPaints = paint.mock.calls.length;
    expect(pictures.picture(firearm)).toBe(before);
    expect(paint).toHaveBeenCalledTimes(coldPaints);

    expect(test.inv.hands.right).toBe(firearm);
    expect(test.inv.locate(foregrip)?.kind).toBe('pocket');
    const fit = test.root.querySelector<HTMLButtonElement>(`[data-attachment-slot="${slot.id}"] button.inv-option`);
    expect(fit).not.toBeNull();
    fit!.click();

    expect(test.queue.jobs).toHaveLength(1);
    expect(firearm.slots?.[slot.id]).toBeUndefined();
    test.queue.tick(test.queue.remaining);
    expect(firearm.slots?.[slot.id]).toBe(foregrip);
    test.screen.update();
    expect(picture()).not.toBe(before);
    expect(handling.remove(firearm.uid, slot.id)).toBeUndefined();
    test.queue.tick(test.queue.remaining);
    test.screen.update();
    expect(picture()).toBe(before);
  });

  it('shows exported slots and dispatches fitting and removal for held and ground firearms', () => {
    const { screen, inv, root, lastPayload, beans } = setup();
    const groundFirearm = inv.create('rifle_assault');
    inv.consume(beans);
    const heldFirearm = inv.create('rifle_assault');
    if (
      !(
        inv.add(groundFirearm, { kind: 'pile', pos: [0, 0, 0] }) &&
        inv.add(heldFirearm, { kind: 'hand', side: 'right' })
      )
    ) {
      throw new Error('Fixture firearms could not be placed');
    }

    const slotIds = registry.models.get('rifle_assault')!.gun!.attachmentSlots!.map((slot) => slot.id);
    for (const firearm of [groundFirearm, heldFirearm]) {
      screen.selected = firearm;
      screen.update();
      const rows = slotIds.map((id) => root.querySelector<HTMLElement>(`[data-attachment-slot="${id}"]`));
      expect(rows.every(Boolean)).toBe(true);
      const openRow = rows.find((row) => row!.dataset.occupied === 'false')!;
      openRow.querySelector('button')!.click();
      expect(lastPayload()).toMatchObject({ kind: 'firearm.attachment.fit', firearmUid: firearm.uid });
      const occupiedRow = rows.find((row) => row!.dataset.occupied === 'true')!;
      occupiedRow.querySelector('button')!.click();
      expect(lastPayload()).toMatchObject({ kind: 'firearm.attachment.remove', firearmUid: firearm.uid });
    }
  });

  it('names every firearm slot from its mount kind in content, never by its raw id', () => {
    const { screen, inv, root, beans } = setup();
    inv.consume(beans);
    const { screenText } = registry.ui.get(CORE_CONTENT_IDS.coreUi)!;
    const rowPattern = templatePattern(screenText.inventory.slot, { slot: '(.+)', item: '.*' });
    const firearms = [...registry.items.values()].filter(
      (def) => def.firearm && def.model && registry.models.get(def.model)?.gun?.attachmentSlots?.length,
    );
    expect(firearms.length).toBeGreaterThan(0);
    for (const def of firearms) {
      const firearm = inv.create(def.id);
      if (!inv.add(firearm, { kind: 'pile', pos: [0, 0, 0] })) {
        throw new Error(`Fixture could not place ${def.id}`);
      }
      screen.selected = firearm;
      screen.update();
      const mounts = new Map(registry.models.get(def.model!)!.gun!.attachmentSlots!.map((slot) => [slot.id, slot]));
      const labels = firearmSlotIds(registry, def).map((id) => {
        const row = root.querySelector(`[data-attachment-slot="${id}"] span`)?.textContent ?? '';
        const label = rowPattern.exec(row)?.[1];
        expect(label, `${def.id} ${id}`).toBeDefined();
        expect(label, `${def.id} ${id}`).not.toContain(id);
        const template = screenText.attachmentSlot?.[mounts.get(id)?.mount ?? (id as 'sling' | 'light-mount')];
        expect(template, `${def.id} ${id}`).toBeDefined();
        expect(label).toMatch(templatePattern(template!, { number: '\\d+' }));
        return label;
      });
      expect(new Set(labels).size, def.id).toBe(labels.length);
      inv.consume(firearm);
    }
  });

  it('shows the reason when a firearm fit is refused', () => {
    const test = setup();
    const firearm = test.inv.create('rifle_assault');
    if (!test.inv.add(firearm, { kind: 'pile', pos: [0, 0, 0] })) {
      throw new Error('Fixture firearm could not be placed');
    }
    const reason = 'Fit refused: the attachment no longer has a rail certificate';
    test.hooks.dispatch = (payload) => (payload.kind === 'firearm.attachment.fit' ? reason : undefined);
    test.screen.selected = firearm;
    test.screen.update();

    const fit = test.root.querySelector<HTMLButtonElement>('.inv-details [data-attachment-slot] button.inv-option');
    if (!fit) {
      throw new Error('Fixture firearm did not render a fit action');
    }
    fit.click();

    expect(test.refusals).toEqual([reason]);
    expect(test.notices).toEqual([]);
    expect(test.queue.jobs).toHaveLength(0);
  });

  it('refuses inventory actions while unconscious and permits them after waking', () => {
    const { screen, queue, body, beans, refusals } = setup();
    screen.selected = beans;
    body.impact(1, 'torso', { shockDamage: 100 });

    expect(screen.onAction('inventory.drop')).toBe(true);
    expect(screen.onAction('inventory.search')).toBe(true);
    expect(queue.jobs).toHaveLength(0);
    expect(refusals).toHaveLength(2);

    body.advance(body.tuning.knockoutSimSeconds);
    expect(screen.onAction('inventory.drop')).toBe(true);
    expect(queue.jobs.length).toBeGreaterThan(0);
  });
  it('does not confirm a queued assignment if its item is consumed before the player tick', () => {
    const test = setup();
    const pendingPlayerTickActions = new PlayerTickActions();
    const recorder = { queueAction: vi.fn() };
    test.hooks.dispatch = createScreenCommandDispatcher({
      isReplaying: () => false,
      inputRecorder: () => recorder,
      inputContext: () => 'inventory',
      pendingPlayerTickActions,
      apply: (payload) => applyReplayActionPayload(payload, test.commandOwners),
      inventory: test.inv,
      notice: test.hooks.notice,
      refusal: test.hooks.refusal,
    });
    test.screen.selected = test.beans;
    pendingPlayerTickActions.enqueue(() => {
      expect(test.inv.consume(test.beans)).toBe(true);
    });

    expect(test.screen.onAction('quickbar.assign.3')).toBe(true);
    expect(test.quickbar.resolve(2, test.inv)).toBeUndefined();
    expect(test.notices).toEqual([]);

    pendingPlayerTickActions.applyAtNextTick();

    expect(test.quickbar.resolve(2, test.inv)).toBeUndefined();
    expect(test.refusals).toHaveLength(1);
    expect(test.notices).toEqual([]);
  });
  it('confirms a queued quickbar assignment after the player tick applies it', () => {
    const test = setup();
    const pendingPlayerTickActions = new PlayerTickActions();
    const recorder = { queueAction: vi.fn() };
    test.hooks.dispatch = createScreenCommandDispatcher({
      isReplaying: () => false,
      inputRecorder: () => recorder,
      inputContext: () => 'inventory',
      pendingPlayerTickActions,
      apply: (payload) => applyReplayActionPayload(payload, test.commandOwners),
      inventory: test.inv,
      notice: test.hooks.notice,
      refusal: test.hooks.refusal,
    });
    test.screen.selected = test.beans;

    expect(test.screen.onAction('quickbar.assign.3')).toBe(true);
    expect(test.quickbar.resolve(2, test.inv)).toBeUndefined();
    expect(test.notices).toEqual([]);

    pendingPlayerTickActions.applyAtNextTick();

    expect(test.quickbar.resolve(2, test.inv)).toBe(test.beans);
    expect(test.notices).toHaveLength(1);
    expect(test.refusals).toEqual([]);
  });
  it('keeps unselected-item commands owned by inventory rather than debug', () => {
    const bindings = new BindingRegistry(INPUT_BINDINGS, undefined);
    const keyboard = new KeyboardInput(bindings);
    keyboard.context = () => ({ context: 'inventory', debug: true });
    const commands = INPUT_BINDINGS.filter(
      (binding) =>
        !binding.debug &&
        binding.commands.every(({ kind }) => kind === 'press') &&
        (binding.id.startsWith('inventory.') || binding.id.startsWith('quickbar.assign.')),
    );
    expect(commands.length).toBeGreaterThan(0);
    const received: string[] = [];
    for (const binding of commands) {
      const { screen } = setup();
      expect(screen.selected).toBeUndefined();
      keyboard.command = ({ action, phase }) => {
        if (phase === 'down') {
          expect(screen.onAction(action)).toBe(true);
          received.push(action);
        }
      };
      const event = new KeyboardEvent('keydown', bindings.chords(binding.id)[0]);
      expect(keyboard.press(event)).toBe(true);
      expect(received.at(-1)).toBe(binding.id);
      keyboard.release(event);
      screen.close();
    }
  });
  it('shows the derived occupied hand without a second item UID and routes work options by UID', () => {
    const { root, screen, inv, hooks, setWorkHandler } = setup();
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
    setWorkHandler((uid, operation) => {
      calls.push([uid, operation]);
    });
    screen.selected = item;
    screen.update();
    expect(root.querySelectorAll(`.inv-hands [data-uid="${item.uid}"]`)).toHaveLength(1);
    expect(root.querySelector('[data-target="hand:left"] .inv-occupied-hand')).not.toBeNull();
    expect(inv.hands.left).toBeUndefined();
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('.inv-details button')];
    buttons.find((button) => button.textContent!.includes('Take apart'))!.click();
    expect(calls).toEqual([[item.uid, 'apart']]);
  });
  it('cycles the container target and puts the selected item into it through the move path', () => {
    const t = setup();
    const second = t.inv.entities.add({ type: t.entity.type, pos: [0, 0, 1], size: [1, 1, 1], facing: 'n' })!;
    t.hooks.containers = () => [t.entity, second];
    t.inv.entities.markSearched(t.entity);
    t.inv.entities.markSearched(second);
    const targeted = () =>
      [...t.root.querySelectorAll<HTMLElement>('[data-target="true"]')].map((node) => Number(node.dataset.entityUid));
    t.screen.update();
    t.screen.selected = t.beans;

    expect(targeted()).toEqual([t.entity.uid]);
    expect(t.screen.onAction('inventory.cycle-target')).toBe(true);
    t.screen.update();
    expect(targeted()).toEqual([second.uid]);

    expect(t.screen.onAction('inventory.put-target')).toBe(true);
    t.queue.tick(t.queue.remaining);
    expect(t.inv.locate(t.beans)).toMatchObject({ kind: 'furniture', entity: second });

    expect(t.screen.onAction('inventory.cycle-target')).toBe(true);
    t.screen.update();
    expect(targeted()).toEqual([t.entity.uid]);
  });

  it('takes all like items into every pocket with room and counts only what was queued with room', () => {
    const half = 2;
    const fixture = baseRegistryWith([
      {
        source: 'take-all-pockets',
        data: {
          items: [
            {
              ...registry.items.get('hoodie')!,
              container: {
                pockets: [
                  { name: 'First', grid: [half, 1], handlingSimSeconds: 0.5 },
                  { name: 'Second', grid: [half, 1], handlingSimSeconds: 1 },
                ],
              },
            },
            { ...registry.items.get('jeans')!, container: undefined },
            {
              id: 'take_all_like',
              workInProgress: false,
              notLoot: false,
              name: 'Like item',
              category: 'misc',
              weight: 1,
              size: [1, 1],
              economy: { usage: [], tiers: [] },
            },
          ],
        },
      },
    ]);
    const t = setup(fixture);
    const pos: [number, number, number] = [0, 0, 0];
    // One more than both pockets hold, so a refused overflow item shows the count excludes it.
    const like = Array.from({ length: half * 2 + 1 }, () => t.inv.create('take_all_like'));
    for (const item of like) {
      expect(t.inv.add(item, { kind: 'pile', pos })).toBe(true);
    }
    t.screen.update();
    t.screen.selected = like[0];

    expect(t.screen.onAction('inventory.take-all-like')).toBe(true);
    t.queue.tick(t.queue.remaining);

    const pocketed = like.filter((item) => t.inv.locate(item)?.kind === 'pocket');
    expect(pocketed).toHaveLength(half * 2);
    const { inventory } = fixture.ui.get(CORE_CONTENT_IDS.coreUi)!.screenText;
    expect(t.notices).toEqual([fillText(inventory.taking, { count: countText(pocketed.length), category: 'misc' })]);
  });

  it('refuses to cycle or put when no container is in reach', () => {
    const t = setup();
    t.hooks.containers = () => [];
    t.screen.selected = t.beans;
    expect(t.screen.onAction('inventory.cycle-target')).toBe(true);
    expect(t.screen.onAction('inventory.put-target')).toBe(true);
    expect(t.refusals).toHaveLength(2);
    expect(t.inv.locate(t.beans)?.kind).toBe('hand');
  });

  it('redraws the body when a furniture search is queued without a version bump', () => {
    const test = setup();
    const versions = [test.inv.version, test.inv.entities.version];
    const search = test.root.querySelector<HTMLButtonElement>('.inv-pane button[data-action="furniture.search"]');
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
      name: 'browser modifiers are not forwarded into inventory actions',
      ctrlKey: true,
      metaKey: true,
      shiftKey: true,
      altKey: true,
      quick: false,
    },
    { name: 'held quick gate auto-moves', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, quick: true },
  ])('$name through the locked-menu adapter', (binding) => {
    const t = setup();
    const node = t.root.querySelector<HTMLElement>(`[data-uid="${t.beans.uid}"]`)!;
    const canvas = document.createElement('canvas');
    document.body.append(canvas);
    const input = { locked: true, menuPointer: true, cursorX: 100, cursorY: 100, moveMenuCursor: () => undefined };
    const adapter = mountMenuPointer({ input, canvas, cursor: document.createElement('div') });
    const hit = vi.spyOn(document, 'elementFromPoint').mockReturnValue(node);
    const releaseGate = binding.quick ? holdQuickGate() : () => undefined;
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
      expect(received).toEqual({
        ctrlKey: false,
        metaKey: false,
        shiftKey: modifiers.shiftKey,
        altKey: modifiers.altKey,
      });
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
      releaseGate();
      input.locked = false;
      adapter.releaseCaptures();
      t.screen.close();
      hit.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('repeated quick-clicks keep one owned move and emit refusal feedback for every duplicate', () => {
    const t = setup();
    const releaseGate = holdQuickGate();
    try {
      expect(t.inv.move(t.beans, { kind: 'pile', pos: [0, 0, 0] }).ok).toBe(true);
      t.screen.update();
      const attempts = 3;
      for (let click = 0; click < attempts; click++) {
        const node = t.root.querySelector<HTMLElement>(`[data-uid="${t.beans.uid}"]`)!;
        expect(node).not.toBeNull();
        node.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1 }));
      }
      expect.soft(t.queue.jobs).toHaveLength(1);
      expect(t.refusals).toHaveLength(attempts - 1);
      expect(t.refusals.every((refusal) => refusal.length > 0)).toBe(true);
    } finally {
      releaseGate();
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
